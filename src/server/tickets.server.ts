import {
  generateTicketCode,
  generateTicketHmac,
  createRecoveryToken,
  verifyRecoveryToken,
} from "./crypto";
import { sendTicketConfirmationEmail, sendRecoveryEmail, getSiteBaseUrl } from "./email.server";
import { OrderService } from "./order-service";
import { isCloudSqlConfigured } from "../db/index.ts";
import { insertTickets, updateTicketStatus } from "../db/tickets.ts";
import { PersistentStore } from "./persistent-store";

export interface DigitalTicketRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: string;
  qrHash: string;
  tierSlug: string;
  tierName: string;
  admitsCount: number;
  attendeeName: string;
  buyerEmail?: string;
  attendeeEmail?: string;
  buyerPhone: string;
  userId?: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  priceKes: number;
  issuedAt: string;
  usedAt?: string | null;
  scannedBy?: string | null;
  venue: {
    name: string;
    address: string;
    city: string;
    date: string;
    time: string;
    ageRequirement: string;
  };
}

export interface PublicTicketView {
  ticketNumber: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  tierSlug: string;
  tierName: string;
  admitsCount: number;
  attendeeName: string; // Sanitized/masked for public display
  qrHash: string;
  venue: {
    name: string;
    address: string;
    city: string;
    date: string;
    time: string;
    ageRequirement: string;
  };
  issuedAt: string;
  usedAt?: string | null;
}

export interface PaymentTransactionRecord {
  id: string;
  idempotencyKey: string;
  orderId: string;
  amountKes: number;
  currency: string;
  provider: string;
  providerRef?: string;
  status: "pending" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
}

export interface RecoveryRateLimitRecord {
  identifier: string; // email or IP
  timestamp: number;
}

export interface CheckInLogRecord {
  id: string;
  ticketNumber: string;
  orderNumber: string;
  attendeeName: string;
  tierName: string;
  admitsCount: number;
  status: "valid" | "duplicate" | "invalid";
  scannedAt: string;
  scannedBy: string;
  gateLocation: string;
  ipAddress?: string;
}

// Persistent Authoritative Store
const ticketsStore = PersistentStore.loadTickets();
const transactionsStore = new Map<string, PaymentTransactionRecord>();
const checkInLogsStore: CheckInLogRecord[] = [];
const recoveryRateLimitStore: RecoveryRateLimitRecord[] = [];

// Helper to mask attendee name for public ticket view (e.g. "Mwangi Karanja" -> "Mwangi K.")
function maskAttendeeName(fullName: string): string {
  if (!fullName) return "Valued Attendee";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

export class TicketsServerService {
  /**
   * Returns all tickets currently in store (strictly internal/admin)
   */
  static getAllTickets(): DigitalTicketRecord[] {
    return Array.from(ticketsStore.values());
  }

  /**
   * Updates a ticket record in store with durable persistence
   */
  static updateTicketRecord(ticket: DigitalTicketRecord): void {
    ticketsStore.set(ticket.ticketNumber, ticket);
    PersistentStore.saveTickets(ticketsStore);
  }

  /**
   * Issues cryptographic digital tickets for a completed order
   */
  static async issueTicketsForOrder(
    orderId: string,
    token?: string,
    verifiedBy?: string,
  ): Promise<DigitalTicketRecord[]> {
    // Check if tickets were already issued for this order (Idempotency)
    const existing = Array.from(ticketsStore.values()).filter((t) => t.orderId === orderId);
    if (existing.length > 0) {
      return existing;
    }

    const order = token
      ? OrderService.getOrder(orderId, token)
      : OrderService._getOrderByIdInternal(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found or unauthorized token.`);
    }

    const issuedTickets: DigitalTicketRecord[] = [];
    const admitsPerTicket = order.admitsCount || 1;
    const quantity = order.quantity || 1;

    for (let i = 0; i < quantity; i++) {
      const ticketNumber = generateTicketCode();
      const qrHash = generateTicketHmac(ticketNumber, order.orderId, order.buyerName);

      const ticketRecord: DigitalTicketRecord = {
        id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        ticketNumber,
        qrHash,
        tierSlug: order.ticketTypeId || "general-admission",
        tierName: order.ticketName,
        admitsCount: admitsPerTicket,
        attendeeName: order.buyerName,
        buyerEmail: order.buyerEmail,
        attendeeEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        userId: order.userId,
        status: "valid",
        priceKes: Math.round(order.totalKes / quantity),
        issuedAt: new Date().toISOString(),
        venue: {
          name: "The Lawns Restaurant",
          address: "Oyster-Shell Rd, opposite Sarova Woodlands",
          city: "Nakuru, Kenya",
          date: "Saturday, 31 October 2026",
          time: "4:00 PM till late",
          ageRequirement: "Strictly 18+ with Valid ID",
        },
      };

      ticketsStore.set(ticketNumber, ticketRecord);
      issuedTickets.push(ticketRecord);
    }

    // Persist all newly issued tickets to disk immediately - throws on error!
    PersistentStore.saveTickets(ticketsStore);

    if (isCloudSqlConfigured() && issuedTickets.length > 0) {
      insertTickets(
        issuedTickets.map((t) => ({
          ticketNumber: t.ticketNumber,
          orderId: t.orderId,
          orderNumber: t.orderNumber,
          attendeeName: t.attendeeName,
          attendeeEmail: t.buyerEmail || null,
          buyerPhone: t.buyerPhone,
          tierSlug: t.tierSlug,
          tierName: t.tierName,
          admitsCount: t.admitsCount,
          priceKes: t.priceKes,
          qrHash: t.qrHash,
          status: t.status,
        })),
      ).catch((err) => {
        console.warn("Cloud SQL tickets sync notice:", err);
      });
    }

    return issuedTickets;
  }

  /**
   * Issue authoritative tickets for an approved order without requiring customer token (Admin context)
   */
  static async issueTicketsForApprovedOrder(orderId: string): Promise<DigitalTicketRecord[]> {
    return this.issueTicketsForOrder(orderId, undefined, "admin");
  }

  /**
   * Single authoritative payment finalization and ticket issuance workflow
   */
  static async finalizeOrderPaymentWorkflow(params: {
    orderId: string;
    paymentReference: string;
    paymentMethod?: string;
    verifiedBy: string;
    clientIp?: string;
  }): Promise<{
    success: boolean;
    order?: ReturnType<typeof OrderService._getOrderByIdInternal>;
    tickets?: DigitalTicketRecord[];
    code?: string;
    message: string;
  }> {
    const { orderId, paymentReference, verifiedBy } = params;

    // Check existing tickets for idempotency
    const existingTickets = Array.from(ticketsStore.values()).filter((t) => t.orderId === orderId);
    const existingOrder = OrderService._getOrderByIdInternal(orderId);

    if (
      existingOrder &&
      (existingOrder.status === "paid" || existingOrder.status === "approved") &&
      existingTickets.length > 0
    ) {
      return {
        success: true,
        order: existingOrder,
        tickets: existingTickets,
        message: "Payment previously finalized and tickets issued.",
      };
    }

    if (!existingOrder) {
      return {
        success: false,
        code: "ORDER_NOT_FOUND",
        message: `Order ${orderId} does not exist.`,
      };
    }

    if (existingOrder.status === "cancelled") {
      return {
        success: false,
        code: "ORDER_CANCELLED",
        message: "Order has been cancelled and cannot be paid.",
      };
    }

    // Approve the order in OrderService
    const approveResult = OrderService.approveOrder({
      orderId,
      adminEmail: verifiedBy,
    });

    if (!approveResult.success || !approveResult.order) {
      return {
        success: false,
        code: approveResult.code || "APPROVAL_FAILED",
        message: approveResult.message || "Failed to approve order state.",
      };
    }

    // Set payment reference
    approveResult.order.paymentReference = paymentReference;
    OrderService._updateOrderStatus(orderId, "approved");

    // Issue tickets
    let tickets: DigitalTicketRecord[] = [];
    try {
      tickets = await this.issueTicketsForApprovedOrder(orderId);
    } catch (ticketErr) {
      console.error("[TicketsServerService] Failed to issue tickets:", ticketErr);
      return {
        success: false,
        code: "TICKET_ISSUANCE_FAILED",
        message:
          "Order was marked approved but tickets could not be saved to storage. Please retry.",
      };
    }

    // Dispatch confirmation email asynchronously if buyerEmail present
    if (approveResult.order.buyerEmail) {
      const siteBase = getSiteBaseUrl();
      const email = approveResult.order.buyerEmail;
      sendTicketConfirmationEmail({
        to: email,
        buyerName: approveResult.order.buyerName,
        orderNumber: approveResult.order.orderNumber,
        totalKes: approveResult.order.totalKes,
        ticketTier: approveResult.order.ticketName,
        quantity: approveResult.order.quantity,
        ticketUrl: `${siteBase}/ticket/${tickets[0]?.ticketNumber || ""}`,
        tickets: tickets.map((t) => ({
          ticketNumber: t.ticketNumber,
          tierName: t.tierName,
          attendeeName: t.attendeeName,
          admitsCount: t.admitsCount,
          ticketUrl: `${siteBase}/ticket/${t.ticketNumber}`,
        })),
      }).catch((emailErr) => {
        console.warn("[Email Service] Non-blocking confirmation dispatch note:", emailErr);
      });
    }

    return {
      success: true,
      order: approveResult.order,
      tickets,
      message: `Payment reference ${paymentReference} confirmed and ${tickets.length} ticket(s) issued.`,
    };
  }

  /**
   * Idempotency Gate for Payment Verification & Processing
   */
  static async verifyPayment(params: {
    idempotencyKey: string;
    orderId: string;
    token: string;
    mpesaReceipt?: string;
    clientIp?: string;
  }): Promise<{
    success: boolean;
    status: "completed" | "pending" | "failed";
    code?: string;
    message: string;
    tickets?: DigitalTicketRecord[];
    receipt?: string;
  }> {
    const { idempotencyKey, orderId, token, mpesaReceipt, clientIp } = params;

    if (!idempotencyKey || !orderId || !token) {
      return {
        success: false,
        status: "failed",
        code: "INVALID_ARGUMENTS",
        message: "Idempotency key, orderId, and checkout token are required.",
      };
    }

    // 1. Check existing transaction under this idempotency key
    const existingTx = transactionsStore.get(idempotencyKey);
    if (existingTx) {
      if (existingTx.status === "completed") {
        const existingTickets = Array.from(ticketsStore.values()).filter(
          (t) => t.orderId === orderId,
        );
        return {
          success: true,
          status: "completed",
          message: "Transaction previously completed.",
          tickets: existingTickets,
          receipt: existingTx.providerRef || mpesaReceipt,
        };
      }

      if (existingTx.status === "pending") {
        return {
          success: false,
          status: "pending",
          code: "TRANSACTION_PENDING",
          message: "Payment transaction is currently being processed. Please wait.",
        };
      }
    }

    // 2. Lookup order with secure token
    const order = OrderService.getOrder(orderId, token);
    if (!order) {
      return {
        success: false,
        status: "failed",
        code: "ORDER_NOT_FOUND",
        message: "Order not found or authorization token invalid.",
      };
    }

    // 3. Mark transaction as pending
    const txRecord: PaymentTransactionRecord = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey,
      orderId,
      amountKes: order.totalKes,
      currency: "KES",
      provider: "mpesa",
      providerRef: mpesaReceipt || `REC-${Date.now().toString(36).toUpperCase()}`,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    transactionsStore.set(idempotencyKey, txRecord);

    try {
      // 4. Use the consolidated payment workflow
      const result = await this.finalizeOrderPaymentWorkflow({
        orderId,
        paymentReference: txRecord.providerRef || "VERIFIED-CHECKOUT",
        paymentMethod: "mpesa",
        verifiedBy: "client_checkout_verification",
        clientIp,
      });

      if (!result.success) {
        txRecord.status = "failed";
        txRecord.errorMessage = result.message;
        txRecord.updatedAt = Date.now();
        transactionsStore.set(idempotencyKey, txRecord);

        return {
          success: false,
          status: "failed",
          code: result.code || "PROCESSING_ERROR",
          message: result.message,
        };
      }

      txRecord.status = "completed";
      txRecord.updatedAt = Date.now();
      transactionsStore.set(idempotencyKey, txRecord);

      return {
        success: true,
        status: "completed",
        message: "Payment authoritatively verified and tickets issued.",
        tickets: result.tickets,
        receipt: txRecord.providerRef,
      };
    } catch (err) {
      txRecord.status = "failed";
      txRecord.errorMessage = err instanceof Error ? err.message : String(err);
      txRecord.updatedAt = Date.now();
      transactionsStore.set(idempotencyKey, txRecord);

      return {
        success: false,
        status: "failed",
        code: "PROCESSING_ERROR",
        message: "Payment verification failed to write to database. You may safely retry.",
      };
    }
  }

  /**
   * Public Ticket Lookup by Code — Sanitized to expose only necessary pass validation fields
   * Never exposes buyer contact details (email, phone, pricing, order IDs)
   */
  static getTicketByCode(code: string): {
    success: boolean;
    ticket?: PublicTicketView;
    message?: string;
  } {
    const normalized = code.trim().toUpperCase();
    const ticket = ticketsStore.get(normalized);

    if (!ticket) {
      return {
        success: false,
        message: "No ticket found matching the specified code.",
      };
    }

    // Return sanitized view without PII
    const publicView: PublicTicketView = {
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      tierSlug: ticket.tierSlug,
      tierName: ticket.tierName,
      admitsCount: ticket.admitsCount,
      attendeeName: maskAttendeeName(ticket.attendeeName),
      qrHash: ticket.qrHash,
      venue: ticket.venue,
      issuedAt: ticket.issuedAt,
      usedAt: ticket.usedAt,
    };

    return {
      success: true,
      ticket: publicView,
    };
  }

  /**
   * Authenticated Ticket Lookup by Code — For owner or admin access with full fields
   */
  static getTicketByCodeFull(
    code: string,
    authenticatedEmailOrId?: string,
    isAdmin = false,
  ): {
    success: boolean;
    ticket?: DigitalTicketRecord;
    message?: string;
  } {
    const normalized = code.trim().toUpperCase();
    const ticket = ticketsStore.get(normalized);

    if (!ticket) {
      return {
        success: false,
        message: "No ticket found matching the specified code.",
      };
    }

    if (isAdmin) {
      return { success: true, ticket };
    }

    // Check ownership
    if (authenticatedEmailOrId) {
      const email = authenticatedEmailOrId.trim().toLowerCase();
      const isOwner =
        (ticket.buyerEmail && ticket.buyerEmail.toLowerCase() === email) ||
        (ticket.attendeeEmail && ticket.attendeeEmail.toLowerCase() === email) ||
        (ticket.userId && ticket.userId === authenticatedEmailOrId);

      if (isOwner) {
        return { success: true, ticket };
      }
    }

    return {
      success: false,
      message: "Unauthorized access to complete ticket records.",
    };
  }

  /**
   * Retrieve all tickets belonging to an authenticated user
   */
  static getTicketsForUser(email: string, userId?: string): DigitalTicketRecord[] {
    const normalizedEmail = email.trim().toLowerCase();
    const matches: DigitalTicketRecord[] = [];

    for (const ticket of ticketsStore.values()) {
      const buyerMatch =
        ticket.buyerEmail && ticket.buyerEmail.trim().toLowerCase() === normalizedEmail;
      const attendeeMatch =
        ticket.attendeeEmail && ticket.attendeeEmail.trim().toLowerCase() === normalizedEmail;
      const userMatch = userId && ticket.userId === userId;

      if (buyerMatch || attendeeMatch || userMatch) {
        matches.push(ticket);
      }
    }

    return matches.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  /**
   * Authoritative gate check-in & scanning validation
   */
  static async validateAndCheckinTicket(params: {
    ticket_code: string;
    qr_hash?: string;
    event_id?: string;
    staff_name: string;
    gate_location: string;
    clientIp?: string;
  }): Promise<{
    success: boolean;
    valid: boolean;
    already_used: boolean;
    status: string;
    httpStatus: number;
    message: string;
    ticket?: PublicTicketView;
  }> {
    const { ticket_code, staff_name, gate_location, clientIp } = params;
    const normalized = ticket_code.trim().toUpperCase();
    const ticket = ticketsStore.get(normalized);

    if (!ticket) {
      return {
        success: false,
        valid: false,
        already_used: false,
        status: "INVALID",
        httpStatus: 404,
        message: "Invalid ticket code. Ticket does not exist in registry.",
      };
    }

    if (ticket.status === "used") {
      return {
        success: false,
        valid: false,
        already_used: true,
        status: "DUPLICATE",
        httpStatus: 409,
        message: `Ticket was already checked in on ${ticket.usedAt || "an earlier scan"} by ${ticket.scannedBy || "Gate Staff"}.`,
        ticket: {
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          tierSlug: ticket.tierSlug,
          tierName: ticket.tierName,
          admitsCount: ticket.admitsCount,
          attendeeName: maskAttendeeName(ticket.attendeeName),
          qrHash: ticket.qrHash,
          venue: ticket.venue,
          issuedAt: ticket.issuedAt,
          usedAt: ticket.usedAt,
        },
      };
    }

    if (ticket.status === "cancelled" || ticket.status === "refunded") {
      return {
        success: false,
        valid: false,
        already_used: false,
        status: "REVOKED",
        httpStatus: 410,
        message: `Ticket pass has been revoked (${ticket.status}). Entry denied.`,
      };
    }

    // Mark as checked in
    const usedAt = new Date().toISOString();
    ticket.status = "used";
    ticket.usedAt = usedAt;
    ticket.scannedBy = staff_name;

    ticketsStore.set(normalized, ticket);
    PersistentStore.saveTickets(ticketsStore);

    if (isCloudSqlConfigured()) {
      updateTicketStatus(ticket.ticketNumber, {
        status: "used",
        usedAt,
        scannedBy: staff_name,
      }).catch(() => {});
    }

    return {
      success: true,
      valid: true,
      already_used: false,
      status: "VALID",
      httpStatus: 200,
      message: `Pass verified! Welcome ${maskAttendeeName(ticket.attendeeName)} to Hauntings of the Rift.`,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        tierSlug: ticket.tierSlug,
        tierName: ticket.tierName,
        admitsCount: ticket.admitsCount,
        attendeeName: maskAttendeeName(ticket.attendeeName),
        qrHash: ticket.qrHash,
        venue: ticket.venue,
        issuedAt: ticket.issuedAt,
        usedAt: ticket.usedAt,
      },
    };
  }

  /**
   * Get Gate Check-in Stats
   */
  static getCheckinStats(): {
    totalTickets: number;
    checkedIn: number;
    pending: number;
    cancelled: number;
  } {
    const tickets = Array.from(ticketsStore.values());
    const totalTickets = tickets.length;
    const checkedIn = tickets.filter((t) => t.status === "used").length;
    const cancelled = tickets.filter(
      (t) => t.status === "cancelled" || t.status === "refunded",
    ).length;
    const pending = totalTickets - checkedIn - cancelled;

    return { totalTickets, checkedIn, pending, cancelled };
  }

  /**
   * Ticket Recovery Request Handler (Rate limited + generic non-enumerating response)
   */
  static async recoverTicket(params: {
    email?: string;
    phone?: string;
    clientIp: string;
    baseUrl: string;
  }): Promise<{
    success: boolean;
    code?: string;
    message: string;
    rateLimited?: boolean;
  }> {
    const { email, clientIp, baseUrl } = params;
    const now = Date.now();
    const ONE_HOUR = 3600000;

    // Clean up old rate limit records
    while (
      recoveryRateLimitStore.length > 0 &&
      recoveryRateLimitStore[0].timestamp < now - ONE_HOUR
    ) {
      recoveryRateLimitStore.shift();
    }

    const emailKey = email?.trim().toLowerCase() || "";
    const ipKey = clientIp.trim();

    const emailAttempts = recoveryRateLimitStore.filter(
      (r) => emailKey && r.identifier === emailKey && r.timestamp > now - ONE_HOUR,
    ).length;
    const ipAttempts = recoveryRateLimitStore.filter(
      (r) => r.identifier === ipKey && r.timestamp > now - ONE_HOUR,
    ).length;

    if (emailAttempts >= 5 || ipAttempts >= 10) {
      return {
        success: false,
        rateLimited: true,
        code: "RATE_LIMITED",
        message: "Too many recovery requests. Please wait an hour before requesting again.",
      };
    }

    if (emailKey) recoveryRateLimitStore.push({ identifier: emailKey, timestamp: now });
    recoveryRateLimitStore.push({ identifier: ipKey, timestamp: now });

    if (emailKey) {
      const userTickets = this.getTicketsForUser(emailKey);
      if (userTickets.length > 0) {
        const recoveryToken = createRecoveryToken(emailKey);
        const recoveryUrl = `${baseUrl}/recover?token=${encodeURIComponent(recoveryToken)}`;

        sendRecoveryEmail({
          to: emailKey,
          recipientName: userTickets[0]?.attendeeName || "Attendee",
          recoveryUrl,
          ticketCount: userTickets.length,
          expiresIn: "1 hour",
        }).catch((err) => {
          console.warn("[Recovery] Email send notice:", err);
        });
      }
    }

    return {
      success: true,
      message:
        "If passes exist matching your email, a secure one-time access link has been dispatched to your inbox.",
    };
  }

  /**
   * Verify recovery token & list associated tickets
   */
  static verifyRecoveryToken(token: string): {
    valid: boolean;
    email?: string;
    expired?: boolean;
    tickets?: DigitalTicketRecord[];
  } {
    const verification = verifyRecoveryToken(token);
    if (!verification.valid || !verification.email) {
      return {
        valid: false,
        expired: verification.expired,
      };
    }

    const tickets = this.getTicketsForUser(verification.email);
    return {
      valid: true,
      email: verification.email,
      tickets,
    };
  }
}
