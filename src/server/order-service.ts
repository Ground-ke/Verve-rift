import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { validateAndNormalizeKenyanPhone } from "../lib/validation/phone";
import type { OrderStatus, ReservationStatus } from "../lib/database.types";
import { ManualOrderStore } from "./manual-order-store";

// Reservation Time-To-Live in milliseconds (10 minutes)
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

// Technical request safety ceiling: protects against integer overflow / spam attacks
// This is NOT an organizer business rule and is strictly distinguished from ticket.purchaseLimit
export const MAX_REQUEST_QUANTITY_CEILING = 50;

export interface CreateOrderInput {
  eventId?: string;
  ticketTypeId: string;
  quantity: number;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | undefined;
  idempotencyKey?: string | undefined;
  clientIp?: string;
}

export interface ClientOrderResponse {
  success: boolean;
  orderId: string;
  orderNumber: string;
  checkoutToken: string;
  eventId: string;
  ticketTypeId: string;
  ticketName: string;
  admitsCount: number;
  quantity: number;
  unitPriceKes: number;
  discountKes: number;
  subtotalKes: number;
  totalKes: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | undefined;
  status: OrderStatus;
  mpesaCode?: string | undefined;
  mpesaMessage?: string | undefined;
  paymentReference?: string | undefined;
  rejectionReason?: string | undefined;
  approvedBy?: string | undefined;
  approvedAt?: string | undefined;
  expiresAt: string;
  ttlSeconds: number;
}

export interface OrderErrorResponse {
  success: false;
  code:
    | "INVALID_INPUT"
    | "INVALID_PHONE"
    | "EVENT_NOT_FOUND"
    | "SALES_PAUSED"
    | "TICKET_NOT_FOUND"
    | "TICKET_NOT_CONFIGURED"
    | "PURCHASE_LIMIT_EXCEEDED"
    | "SAFETY_LIMIT_EXCEEDED"
    | "INSUFFICIENT_INVENTORY"
    | "IDEMPOTENCY_CONFLICT"
    | "ORDER_EXPIRED"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "SERVER_ERROR";
  message: string;
}

export interface StoredOrder {
  id: string;
  orderNumber: string;
  checkoutToken: string;
  eventId: string;
  ticketTypeId: string;
  ticketName: string;
  admitsCount: number;
  quantity: number;
  unitPriceKes: number;
  discountKes: number;
  subtotalKes: number;
  totalKes: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | undefined;
  status: OrderStatus;
  mpesaCode?: string;
  mpesaMessage?: string;
  paymentReference?: string | undefined;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt: string;
  idempotencyKey?: string | undefined;
  requestFingerprint?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface StoredReservation {
  id: string;
  ticketTypeId: string;
  orderId: string;
  quantity: number;
  expiresAt: string;
  status: ReservationStatus;
  createdAt: string;
}

export interface TicketTypeConfig {
  id: string;
  eventId: string;
  slug: string;
  name: string;
  admitsCount: number;
  priceKes: number;
  totalInventory: number | null; // NULL by default unless explicitly configured
  soldCount: number | null;
  purchaseLimit: number | null; // NULL = NO business limit by default
  isConfigured: boolean;
  active: boolean;
}

// Rate Limiter Bucket (Sliding window per IP)
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= limit) {
    return false;
  }
  valid.push(now);
  rateLimitMap.set(key, valid);
  return true;
}

// Helper: Safely compare cryptographic tokens in constant time
function safeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Helper: Compute SHA-256 fingerprint of order creation request parameters
function computeRequestFingerprint(ticketTypeId: string, quantity: number, phone: string): string {
  return createHash("sha256").update(`${ticketTypeId}:${quantity}:${phone}`).digest("hex");
}

// Default verified ticket catalog (NO INVENTED PURCHASE LIMITS: purchaseLimit is null by default)
const defaultTicketTypes: Record<string, TicketTypeConfig> = {
  "early-bird": {
    id: "00000000-0000-0000-0000-000000000011",
    eventId: "00000000-0000-0000-0000-000000000001",
    slug: "early-bird",
    name: "Early Bird",
    admitsCount: 1,
    priceKes: 1000,
    totalInventory: null,
    soldCount: null,
    purchaseLimit: null, // Configurable business limit (null = unlimited by default)
    isConfigured: true,
    active: true,
  },
  "couple-pass": {
    id: "00000000-0000-0000-0000-000000000012",
    eventId: "00000000-0000-0000-0000-000000000001",
    slug: "couple-pass",
    name: "Couple Pass",
    admitsCount: 2,
    priceKes: 1800,
    totalInventory: null,
    soldCount: null,
    purchaseLimit: null,
    isConfigured: true,
    active: true,
  },
  "group-of-four": {
    id: "00000000-0000-0000-0000-000000000013",
    eventId: "00000000-0000-0000-0000-000000000001",
    slug: "group-of-four",
    name: "Group of Four",
    admitsCount: 4,
    priceKes: 3200,
    totalInventory: null,
    soldCount: null,
    purchaseLimit: null,
    isConfigured: true,
    active: true,
  },
};

function toClientOrderResponse(order: StoredOrder): ClientOrderResponse {
  return {
    success: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    checkoutToken: order.checkoutToken,
    eventId: order.eventId,
    ticketTypeId: order.ticketTypeId,
    ticketName: order.ticketName,
    admitsCount: order.admitsCount,
    quantity: order.quantity,
    unitPriceKes: order.unitPriceKes,
    discountKes: order.discountKes,
    subtotalKes: order.subtotalKes,
    totalKes: order.totalKes,
    currency: order.currency,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    buyerEmail: order.buyerEmail,
    status: order.status,
    mpesaCode: order.mpesaCode,
    mpesaMessage: order.mpesaMessage,
    rejectionReason: order.rejectionReason,
    approvedBy: order.approvedBy,
    approvedAt: order.approvedAt,
    expiresAt: order.expiresAt,
    ttlSeconds: Math.max(0, Math.round((new Date(order.expiresAt).getTime() - Date.now()) / 1000)),
  };
}

export class OrderService {
  /**
   * Test / Diagnostic helper: reset in-memory stores
   */
  static _resetStoresForTesting(): void {
    rateLimitMap.clear();
  }

  /**
   * Diagnostic helper: update catalog price for snapshot verification test
   */
  static _setCatalogPriceForTesting(slug: string, newPriceKes: number): void {
    if (defaultTicketTypes[slug]) {
      defaultTicketTypes[slug].priceKes = newPriceKes;
    }
  }

  /**
   * Diagnostic helper: set total inventory for testing
   */
  static _setTotalInventoryForTesting(slug: string, total: number | null): void {
    if (defaultTicketTypes[slug]) {
      defaultTicketTypes[slug].totalInventory = total;
    }
  }

  /**
   * Get all ticket tier configurations
   */
  static getTicketTypes(): TicketTypeConfig[] {
    return Object.values(defaultTicketTypes);
  }

  /**
   * Authoritatively update ticket tier pricing and configuration
   */
  static updateTicketType(
    slug: string,
    updates: {
      name?: string;
      priceKes?: number;
      admitsCount?: number;
      totalInventory?: number | null;
      active?: boolean;
    },
  ): { success: boolean; tier?: TicketTypeConfig; message?: string } {
    const tier = defaultTicketTypes[slug];
    if (!tier) {
      return { success: false, message: `Ticket tier '${slug}' was not found.` };
    }

    if (updates.name !== undefined && updates.name.trim()) {
      tier.name = updates.name.trim();
    }
    if (updates.priceKes !== undefined) {
      tier.priceKes = Math.max(0, Math.round(Number(updates.priceKes)));
    }
    if (updates.admitsCount !== undefined) {
      tier.admitsCount = Math.max(1, Math.round(Number(updates.admitsCount)));
    }
    if (updates.totalInventory !== undefined) {
      tier.totalInventory =
        updates.totalInventory === null
          ? null
          : Math.max(0, Math.round(Number(updates.totalInventory)));
    }
    if (updates.active !== undefined) {
      tier.active = Boolean(updates.active);
    }

    return { success: true, tier };
  }

  /**
   * Authoritatively create a new ticket tier
   */
  static createTicketType(config: {
    slug: string;
    name: string;
    priceKes: number;
    admitsCount?: number;
    totalInventory?: number | null;
  }): { success: boolean; tier?: TicketTypeConfig; message?: string } {
    const normalizedSlug = config.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "-");

    if (!normalizedSlug) {
      return { success: false, message: "A valid tier slug is required." };
    }

    if (defaultTicketTypes[normalizedSlug]) {
      return { success: false, message: `Ticket tier '${normalizedSlug}' already exists.` };
    }

    const newTier: TicketTypeConfig = {
      id: `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
      eventId: "00000000-0000-0000-0000-000000000001",
      slug: normalizedSlug,
      name: config.name.trim() || normalizedSlug,
      priceKes: Math.max(0, Math.round(Number(config.priceKes))),
      admitsCount: Math.max(1, Math.round(Number(config.admitsCount) || 1)),
      totalInventory: config.totalInventory !== undefined ? config.totalInventory : null,
      soldCount: null,
      purchaseLimit: null,
      isConfigured: true,
      active: true,
    };

    defaultTicketTypes[normalizedSlug] = newTier;
    return { success: true, tier: newTier };
  }

  /**
   * Release expired reservations and update order statuses
   */
  static cleanExpiredReservations(): void {
    // Expiry is checked against shared database timestamps on each relevant transaction.
  }

  /**
   * Get active reserved ticket count for a ticket type
   */
  static getActiveReservedCount(ticketTypeId: string): number {
    void ticketTypeId;
    return 0;
  }

  /**
   * Get total sold count for a ticket type
   */
  static getSoldCount(ticketTypeId: string): number | null {
    const ticket = this.getTicketType(ticketTypeId);
    return ticket?.soldCount ?? null;
  }

  /**
   * Internal order lookup without token (for backend webhooks/services)
   */
  static _getOrderByIdInternal(orderId: string): Promise<StoredOrder | undefined> {
    return ManualOrderStore.getOrder(orderId);
  }

  /**
   * Internal order status update (for backend services)
   */
  static async _updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const order = await ManualOrderStore.getOrder(orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
      if (!(await ManualOrderStore.updateOrder(order))) {
        throw new Error("Order was not found in shared storage.");
      }
    }
  }

  /**
   * Internal atomic payment finalization:
   * 1. Mark order paid
   * 2. Mark reservation completed
   * 3. Convert reserved count into soldCount on the ticket type
   */
  static async _finalizeOrderPayment(orderId: string, receiptNumber: string): Promise<boolean> {
    const order = await ManualOrderStore.getOrder(orderId);
    if (!order) return false;
    order.status = "paid";
    order.paymentReference = receiptNumber;
    order.updatedAt = new Date().toISOString();
    return Boolean(await ManualOrderStore.updateOrderAndReservation(order));
  }

  /**
   * Look up a ticket type by UUID or Slug
   */
  static getTicketType(identifier: string): TicketTypeConfig | null {
    // 1. Check by slug
    if (defaultTicketTypes[identifier]) {
      return defaultTicketTypes[identifier];
    }
    // 2. Check by ID
    for (const t of Object.values(defaultTicketTypes)) {
      if (t.id === identifier || t.slug === identifier) {
        return t;
      }
    }
    return null;
  }

  /**
   * Create an order with an atomic 10-minute inventory reservation
   */
  static async createOrder(
    input: CreateOrderInput,
  ): Promise<ClientOrderResponse | OrderErrorResponse> {
    const {
      ticketTypeId,
      quantity,
      buyerName,
      buyerPhone,
      buyerEmail,
      idempotencyKey,
      clientIp = "unknown",
    } = input;

    // 1. Rate Limiting Check (Server-authoritative sliding window)
    if (!checkRateLimit(`ip:${clientIp}`, 20, 60000)) {
      return {
        success: false,
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment before trying again.",
      };
    }

    // 2. Validate Buyer Name
    const trimmedName = (buyerName || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "Please provide a valid full name (at least 2 characters).",
      };
    }

    // 2b. Validate Buyer Email if provided
    const trimmedEmail = (buyerEmail || "").trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "Please provide a valid email address for ticket delivery.",
      };
    }

    // 3. Validate and Normalize Phone Number
    const phoneValidation = validateAndNormalizeKenyanPhone(buyerPhone);
    if (!phoneValidation.isValid) {
      return {
        success: false,
        code: "INVALID_PHONE",
        message: phoneValidation.error || "Please enter a valid Kenyan phone number.",
      };
    }
    const normalizedPhone = phoneValidation.normalized;

    // 4. Validate Quantity & Enforce Technical Request Safety Ceiling
    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "Quantity must be a positive integer (minimum 1).",
      };
    }

    if (quantity > MAX_REQUEST_QUANTITY_CEILING) {
      return {
        success: false,
        code: "SAFETY_LIMIT_EXCEEDED",
        message: `Maximum allowed quantity per checkout request is ${MAX_REQUEST_QUANTITY_CEILING}.`,
      };
    }

    // 5. Look up Ticket Type
    const ticket = this.getTicketType(ticketTypeId);
    if (!ticket || !ticket.active) {
      return {
        success: false,
        code: "TICKET_NOT_FOUND",
        message: "Selected ticket type was not found or is currently inactive.",
      };
    }

    // 6. Check Configuration Status
    if (!ticket.isConfigured) {
      return {
        success: false,
        code: "TICKET_NOT_CONFIGURED",
        message: "Tickets are not currently available.",
      };
    }

    // 7. Check Configurable Business Purchase Limit (if defined by organizer)
    if (ticket.purchaseLimit !== null && quantity > ticket.purchaseLimit) {
      return {
        success: false,
        code: "PURCHASE_LIMIT_EXCEEDED",
        message: `Maximum purchase limit for ${ticket.name} is ${ticket.purchaseLimit} per order.`,
      };
    }

    // 8. Fingerprint the request for the shared, transactionally enforced idempotency check.
    const currentFingerprint = computeRequestFingerprint(ticket.id, quantity, normalizedPhone);

    // 10. Server-Authoritative Price Calculation
    // Base unit price stored on server (Never client-supplied)
    const unitPriceKes = ticket.priceKes;
    const discountKes = 0; // Configurable when promotion active
    const subtotalKes = unitPriceKes * quantity;
    const totalKes = subtotalKes - discountKes;

    // 11. Create Secure Reservation & Order
    const orderId = randomUUID();
    const reservationId = randomUUID();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `HRT-2026-${randomSuffix}`;

    // Generate high-entropy 256-bit cryptographic checkout session token
    const checkoutToken = `tok_${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();

    const newReservation: StoredReservation = {
      id: reservationId,
      ticketTypeId: ticket.id,
      orderId,
      quantity,
      expiresAt,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    const newOrder: StoredOrder = {
      id: orderId,
      orderNumber,
      checkoutToken,
      eventId: ticket.eventId,
      ticketTypeId: ticket.id,
      ticketName: ticket.name,
      admitsCount: ticket.admitsCount,
      quantity,
      unitPriceKes,
      discountKes,
      subtotalKes,
      totalKes,
      currency: "KES",
      buyerName: trimmedName,
      buyerPhone: normalizedPhone,
      buyerEmail: trimmedEmail || undefined,
      status: "pending",
      expiresAt,
      idempotencyKey,
      requestFingerprint: currentFingerprint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let created: Awaited<ReturnType<typeof ManualOrderStore.createOrder>>;
    try {
      created = await ManualOrderStore.createOrder(newOrder, newReservation, ticket);
    } catch (error) {
      console.error("Failed to persist order and inventory reservation:", error);
      return {
        success: false,
        code: "SERVER_ERROR",
        message: "Shared order storage is unavailable. No order was accepted.",
      };
    }
    if (created.conflict) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        message:
          "Idempotency key was previously used for a different request payload. Please use a new request key.",
      };
    }
    if (created.inventoryError) {
      return {
        success: false,
        code: "INSUFFICIENT_INVENTORY",
        message: "These tickets are currently sold out. Please adjust your quantity.",
      };
    }
    return toClientOrderResponse(created.order);
  }

  /**
   * Securely retrieve order status using orderId + checkoutToken
   */
  static async getOrder(
    orderId: string,
    checkoutToken: string,
  ): Promise<(ClientOrderResponse & { isExpired: boolean }) | null> {
    const order = await ManualOrderStore.getOrder(orderId);
    if (!order) {
      return null;
    }

    // Timing-safe cryptographic token verification
    if (!safeTokenEqual(order.checkoutToken, checkoutToken)) {
      return null;
    }

    // Server-authoritative expiration check based strictly on server timestamp
    const now = Date.now();
    const isExpired =
      order.status === "cancelled" ||
      (order.status === "pending" && new Date(order.expiresAt).getTime() < now);

    if (isExpired && order.status === "pending") {
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      const saved = await ManualOrderStore.updateOrderAndReservation(order, ["pending"]);
      if (saved) Object.assign(order, saved);
    }

    return {
      ...toClientOrderResponse(order),
      isExpired,
    };
  }

  /**
   * Submit a buyer-provided M-Pesa reference for organizer review.
   */
  static async submitMpesaCode(params: {
    orderId: string;
    checkoutToken?: string;
    mpesaCode: string;
    mpesaMessage?: string;
  }): Promise<{ success: boolean; order?: StoredOrder; message: string; code?: string }> {
    const { orderId, checkoutToken, mpesaCode, mpesaMessage } = params;

    const sanitizedCode = mpesaCode.trim().toUpperCase();
    if (sanitizedCode.length < 5) {
      return {
        success: false,
        code: "INVALID_CODE",
        message: "Please provide a valid M-Pesa transaction reference.",
      };
    }

    let order = await ManualOrderStore.getOrder(orderId);
    if (!order) {
      return { success: false, code: "NOT_FOUND", message: "Order not found." };
    }

    if (!checkoutToken || !safeTokenEqual(order.checkoutToken, checkoutToken)) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        message: "A valid order authorization token is required.",
      };
    }

    if (order.status !== "pending" && order.status !== "pending_approval") {
      return {
        success: false,
        code: "INVALID_ORDER_STATUS",
        message: "This order is not accepting payment references.",
      };
    }

    order.mpesaCode = sanitizedCode;
    if (mpesaMessage) order.mpesaMessage = mpesaMessage.trim();

    order.status = "pending_approval";
    order.updatedAt = new Date().toISOString();

    // Keep the reservation alive while under admin verification (extend 48 hours for generous 24hr manual review SLA)
    order.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const updated = await ManualOrderStore.updateOrderAndReservation(order, [
      "pending",
      "pending_approval",
    ]);
    if (!updated) {
      return {
        success: false,
        code: "INVALID_ORDER_STATUS",
        message: "This order is no longer accepting payment references.",
      };
    }
    order = updated;

    return {
      success: true,
      order,
      message: "M-Pesa code submitted and is awaiting organizer review.",
    };
  }

  /**
   * Admin approves an order
   */
  static async approveOrder(params: { orderId: string; adminEmail: string }): Promise<{
    success: boolean;
    order?: StoredOrder;
    message: string;
    code?: string;
  }> {
    const { orderId, adminEmail } = params;
    let order = await ManualOrderStore.findOrder(orderId);

    // Also match by orderNumber if orderId not found directly
    if (!order) {
      return { success: false, code: "NOT_FOUND", message: "Order not found." };
    }

    if (order.status !== "pending_approval" || !order.mpesaCode) {
      return {
        success: false,
        code: "INVALID_ORDER_STATUS",
        message: "Only an order with a submitted payment reference can be approved.",
      };
    }

    order.status = "approved";
    order.approvedBy = adminEmail;
    order.approvedAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();

    const updated = await ManualOrderStore.updateOrderAndReservation(order, ["pending_approval"]);
    if (!updated) {
      return {
        success: false,
        code: "INVALID_ORDER_STATUS",
        message: "Order status changed before approval; refresh and review it again.",
      };
    }
    order = updated;

    return { success: true, order, message: "Order successfully approved and verified." };
  }

  /**
   * Admin rejects an order with a reason
   */
  static async rejectOrder(params: {
    orderId: string;
    reason: string;
    adminEmail: string;
  }): Promise<{
    success: boolean;
    order?: StoredOrder;
    message: string;
    code?: string;
  }> {
    const { orderId, reason, adminEmail } = params;
    let order = await ManualOrderStore.findOrder(orderId);

    if (!order) {
      return { success: false, code: "NOT_FOUND", message: "Order not found." };
    }

    order.status = "rejected";
    order.rejectionReason = reason;
    order.approvedBy = adminEmail;
    order.updatedAt = new Date().toISOString();

    const updated = await ManualOrderStore.updateOrderAndReservation(order, ["pending_approval"]);
    if (!updated) {
      return {
        success: false,
        code: "INVALID_ORDER_STATUS",
        message: "Order status changed before rejection; refresh and review it again.",
      };
    }
    order = updated;

    return { success: true, order, message: "Order rejected." };
  }

  /**
   * Get all orders with status pending_approval
   */
  static getPendingOrders(): Promise<StoredOrder[]> {
    return ManualOrderStore.listOrders("pending_approval");
  }

  /**
   * Get all orders in store (for reporting, reconciliation, and broadcasting)
   */
  static getAllOrders(): Promise<StoredOrder[]> {
    return ManualOrderStore.listOrders();
  }

  /**
   * Get unique email list of ticket buyers with their metadata
   */
  static async getTicketBuyersEmailList(): Promise<
    Array<{
      email: string;
      name: string;
      phone: string;
      ticketTier: string;
      orderCount: number;
      totalPaidKes: number;
      status: string;
      latestOrderDate: string;
    }>
  > {
    const buyersMap = new Map<
      string,
      {
        email: string;
        name: string;
        phone: string;
        ticketTier: string;
        orderCount: number;
        totalPaidKes: number;
        status: string;
        latestOrderDate: string;
      }
    >();

    for (const order of await ManualOrderStore.listOrders()) {
      if (!order.buyerEmail) continue;
      const normalizedEmail = order.buyerEmail.trim().toLowerCase();

      const existing = buyersMap.get(normalizedEmail);
      if (existing) {
        existing.orderCount += 1;
        if (order.status === "completed" || order.status === "approved") {
          existing.totalPaidKes += order.totalKes;
        }
        if (new Date(order.createdAt).getTime() > new Date(existing.latestOrderDate).getTime()) {
          existing.latestOrderDate = order.createdAt;
          existing.status = order.status;
          existing.ticketTier = order.ticketName;
        }
      } else {
        buyersMap.set(normalizedEmail, {
          email: normalizedEmail,
          name: order.buyerName || normalizedEmail.split("@")[0] || normalizedEmail,
          phone: order.buyerPhone || "",
          ticketTier: order.ticketName,
          orderCount: 1,
          totalPaidKes:
            order.status === "completed" || order.status === "approved" ? order.totalKes : 0,
          status: order.status,
          latestOrderDate: order.createdAt,
        });
      }
    }

    return Array.from(buyersMap.values()).sort(
      (a, b) => new Date(b.latestOrderDate).getTime() - new Date(a.latestOrderDate).getTime(),
    );
  }

  /**
   * Cancel an order and release reservation
   */
  static async cancelOrder(
    orderId: string,
    checkoutToken: string,
  ): Promise<{ success: boolean; code?: string; message: string }> {
    const order = await ManualOrderStore.getOrder(orderId);
    if (!order) {
      return { success: false, code: "NOT_FOUND", message: "Order not found." };
    }

    // Verify token with timing-safe comparison
    if (!safeTokenEqual(order.checkoutToken, checkoutToken)) {
      return { success: false, code: "UNAUTHORIZED", message: "Invalid authorization token." };
    }

    // Check if expired
    if (new Date(order.expiresAt).getTime() < Date.now()) {
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      await ManualOrderStore.updateOrderAndReservation(order, ["pending"]);

      return {
        success: false,
        code: "ORDER_EXPIRED",
        message: "Reservation has already expired.",
      };
    }

    // Check if already cancelled
    if (order.status === "cancelled") {
      return {
        success: false,
        code: "ALREADY_CANCELLED",
        message: "Order has already been cancelled.",
      };
    }

    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();
    await ManualOrderStore.updateOrderAndReservation(order, ["pending"]);

    return { success: true, message: "Reservation released successfully." };
  }
}
