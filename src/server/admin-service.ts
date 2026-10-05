import { randomBytes, randomUUID } from "crypto";
import { supabaseServer, isServerSupabaseConfigured } from "../lib/supabase/server";
import { TicketsServerService, type DigitalTicketRecord } from "./tickets.server";
import { NotificationOutbox } from "./notification-outbox";
import { ManualOrderStore, getEventCapacity } from "./manual-order-store";
import { generateTicketCode, generateTicketHmac } from "./crypto";
import { getSiteBaseUrl } from "./email.server";
import {
  OrderService,
  normalizeReferralCode,
  AFFILIATE_TERMS,
  type CompReason,
  type StoredOrder,
} from "./order-service";
import { validateAndNormalizeKenyanPhone } from "../lib/validation/phone";

export { AFFILIATE_TERMS, type CompReason };

const VALID_COMP_REASONS: ReadonlySet<CompReason> = new Set<CompReason>([
  "affiliate_milestone",
  "performer_staff",
  "sponsor",
  "other",
]);

export interface PromotionRecord {
  id: string;
  code: string;
  name: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: "admin" | "scanner" | "system";
  action: string;
  targetTable: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface ScannerDeviceRecord {
  id: string;
  name: string;
  operatorName: string;
  gateLocation: string;
  status: "active" | "standby" | "offline";
  scansCount: number;
  lastScanAt: string | null;
}

// In-Memory Synchronized Stores
const promotionsStore = new Map<string, PromotionRecord>();
const auditLogsStore: AuditLogEntry[] = [];
const scannersStore = new Map<string, ScannerDeviceRecord>();

// Stores start pristine with zero hallucinated entries. Organizers register real codes and checkpoints dynamically.
export class AdminServerService {
  /**
   * Record an authoritative audit log entry
   */
  static async recordAuditLog(entry: {
    actorId?: string;
    actorEmail?: string;
    actorRole?: "admin" | "scanner" | "system";
    action: string;
    targetTable: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string | undefined;
  }): Promise<AuditLogEntry> {
    const log: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actorId: entry.actorId || "admin-system",
      actorEmail: entry.actorEmail || "admin@verve.co.ke",
      actorRole: entry.actorRole || "admin",
      action: entry.action,
      targetTable: entry.targetTable,
      targetId: entry.targetId,
      metadata: entry.metadata || {},
      ipAddress: entry.ipAddress || "127.0.0.1",
      createdAt: new Date().toISOString(),
    };

    auditLogsStore.unshift(log);

    // Keep memory store bounded
    if (auditLogsStore.length > 500) {
      auditLogsStore.length = 500;
    }

    // Persist to Supabase if available
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        await supabaseServer.from("audit_logs").insert({
          actor_id: log.actorId,
          actor_email: log.actorEmail,
          actor_role: log.actorRole,
          action: log.action,
          target_table: log.targetTable,
          target_id: log.targetId,
          metadata: log.metadata as Record<string, never>,
          ip_address: log.ipAddress,
        });
      } catch (err) {
        console.warn("Could not persist audit log to Supabase:", err);
      }
    }

    return log;
  }

  /**
   * Get all Audit Logs
   */
  static async getAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(safeLimit);

        if (error) {
          throw error;
        }

        return (data ?? []).map((row) => ({
          id: String(row.id),
          actorId: row.actor_id || "admin-system",
          actorEmail: row.actor_email || "admin@verve.co.ke",
          actorRole:
            row.actor_role === "scanner" || row.actor_role === "system"
              ? row.actor_role
              : "admin",
          action: row.action,
          targetTable: row.target_table,
          targetId: row.target_id || "",
          metadata:
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : {},
          ipAddress: row.ip_address || "127.0.0.1",
          createdAt: row.created_at,
        }));
      } catch (err) {
        console.warn("Could not read audit logs from Supabase, falling back to in-memory store:", err);
        return auditLogsStore.slice(0, safeLimit);
      }
    }

    return auditLogsStore.slice(0, safeLimit);
  }

  /**
   * Get Overall Event Overview Metrics
   */
  static async getOverviewMetrics() {
    const [tickets, committedPeople] = await Promise.all([
      TicketsServerService.getAllTickets(),
      ManualOrderStore.getCommittedPeople(),
    ]);
    const promos = Array.from(promotionsStore.values());
    const scanners = Array.from(scannersStore.values());

    const totalSold = tickets.length;
    const totalUsed = tickets.filter((t) => t.status === "used").length;
    const totalCancelled = tickets.filter((t) => t.status === "cancelled").length;
    const totalValid = tickets.filter((t) => t.status === "valid").length;

    const totalRevenueKes = tickets
      .filter((t) => t.status !== "cancelled")
      .reduce((sum, t) => sum + (t.priceKes || 0), 0);

    const totalCapacity = getEventCapacity();
    const remainingCapacity = Math.max(0, totalCapacity - committedPeople);
    const checkinRate = totalSold > 0 ? Math.round((totalUsed / totalSold) * 100) : 0;

    return {
      totalSold,
      totalTicketsSold: totalSold,
      totalUsed,
      checkedInCount: totalUsed,
      totalCancelled,
      totalValid,
      totalRevenueKes,
      totalCapacity,
      committedPeople,
      remainingCapacity,
      checkinRate,
      activePromotionsCount: promos.filter((p) => p.isActive).length,
      activePromosCount: promos.filter((p) => p.isActive).length,
      activeScannersCount: scanners.filter((s) => s.status === "active").length,
      recentTickets: tickets.slice(0, 5),
      recentAuditLogs: auditLogsStore.slice(0, 8),
      hourlySalesTrend: this.getHourlySalesTrendFromTickets(tickets),
    };
  }

  /**
   * Get Hourly Sales Trend derived from actual issued tickets
   */
  static async getHourlySalesTrend(): Promise<
    Array<{ hour: string; sales: number; count: number }>
  > {
    const tickets = await TicketsServerService.getAllTickets();
    return this.getHourlySalesTrendFromTickets(tickets);
  }

  private static getHourlySalesTrendFromTickets(tickets: DigitalTicketRecord[]): Array<{
    hour: string;
    sales: number;
    count: number;
  }> {
    tickets = tickets.filter((t) => t.status !== "cancelled");
    if (tickets.length === 0) {
      return [];
    }

    const hourMap = new Map<string, { sales: number; count: number }>();
    for (const t of tickets) {
      const date = new Date(t.issuedAt);
      const hourKey = `${String(date.getHours()).padStart(2, "0")}:00`;
      const current = hourMap.get(hourKey) || { sales: 0, count: 0 };
      current.sales += t.priceKes || 0;
      current.count += 1;
      hourMap.set(hourKey, current);
    }

    const sortedHours = Array.from(hourMap.keys()).sort();
    return sortedHours.map((hour) => ({
      hour,
      sales: hourMap.get(hour)!.sales,
      count: hourMap.get(hour)!.count,
    }));
  }

  /**
   * List all Tickets with optional search & status filter
   */
  static getTickets(filters?: {
    search?: string;
    status?: string;
    tier?: string;
  }): Promise<DigitalTicketRecord[]> {
    return TicketsServerService.getAllTickets().then((storedTickets) => {
      let tickets = storedTickets.filter((t): t is DigitalTicketRecord =>
        Boolean(
          t &&
          typeof t === "object" &&
          typeof t.ticketNumber === "string" &&
          t.ticketNumber.trim().length > 0 &&
          t.attendeeName,
        ),
      );

      if (filters?.status && filters.status !== "all") {
        tickets = tickets.filter((t) => t.status === filters.status);
      }

      if (filters?.tier && filters.tier !== "all") {
        tickets = tickets.filter((t) => t.tierSlug === filters.tier);
      }

      if (filters?.search) {
        const q = filters.search.trim().toLowerCase();
        tickets = tickets.filter(
          (t) =>
            (t.ticketNumber?.toLowerCase().includes(q) ?? false) ||
            (t.attendeeName?.toLowerCase().includes(q) ?? false) ||
            (t.buyerEmail?.toLowerCase().includes(q) ?? false) ||
            (t.buyerPhone?.toLowerCase().includes(q) ?? false) ||
            (t.orderNumber?.toLowerCase().includes(q) ?? false),
        );
      }

      // Sort newest issued first
      return tickets.sort((a, b) => {
        const timeB = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
        const timeA = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
        return timeB - timeA;
      });
    });
  }

  /**
   * Revoke / Invalidate a ticket
   */
  static async revokeTicket(params: {
    code: string;
    reason: string;
    actorEmail: string;
    actorId?: string | undefined;
    clientIp?: string | undefined;
  }): Promise<{
    success: boolean;
    message: string;
    ticket?: DigitalTicketRecord | undefined;
  }> {
    const { code, reason, actorEmail, actorId, clientIp } = params;
    const result = await TicketsServerService.getTicketByCode(code);
    const ticket = result.ticket;

    if (!ticket) {
      return { success: false, message: "Ticket pass not found." };
    }

    if (ticket.status === "used") {
      return {
        success: false,
        message: `Ticket pass ${ticket.ticketNumber} has already been used for gate entry and cannot be revoked.`,
      };
    }

    if (ticket.status === "cancelled") {
      return { success: false, message: "Ticket is already cancelled/revoked." };
    }

    const previousStatus = ticket.status;
    ticket.status = "cancelled";
    await TicketsServerService.updateTicketRecord(ticket);

    // Audit log
    await this.recordAuditLog({
      actorId: actorId || "admin-user",
      actorEmail,
      actorRole: "admin",
      action: "ticket.revoked",
      targetTable: "tickets",
      targetId: ticket.ticketNumber,
      metadata: {
        attendeeName: ticket.attendeeName,
        orderNumber: ticket.orderNumber,
        previousStatus,
        reason: reason || "Manual organizer revocation",
      },
      ipAddress: clientIp,
    });

    return {
      success: true,
      message: `Pass ${ticket.ticketNumber} has been invalidated.`,
      ticket,
    };
  }

  /**
   * Resend Ticket Confirmation Email
   */
  static async resendTicketEmail(params: {
    code: string;
    actorEmail: string;
    actorId?: string;
    clientIp?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { code, actorEmail, actorId, clientIp } = params;
    const result = await TicketsServerService.getTicketByCode(code);
    const ticket = result.ticket;

    if (!ticket) {
      return { success: false, message: "Ticket pass not found." };
    }

    if (!ticket.buyerEmail) {
      return { success: false, message: "Ticket does not have a recipient email address." };
    }

    const emailResult = await NotificationOutbox.enqueueAndDispatch({
      channel: "email",
      type: "ticket_confirmation",
      recipient: ticket.buyerEmail,
      payload: {
        to: ticket.buyerEmail,
        attendeeName: ticket.attendeeName,
        ticketCode: ticket.ticketNumber,
        tierName: ticket.tierName,
        admitsCount: ticket.admitsCount,
        orderNumber: ticket.orderNumber,
        totalKes: ticket.priceKes,
        eventDate: ticket.venue.date,
        venueName: ticket.venue.name,
        qrHash: ticket.qrHash,
      },
    });

    // Record audit log
    await this.recordAuditLog({
      actorId: actorId || "admin-user",
      actorEmail,
      actorRole: "admin",
      action: "ticket.email_resent",
      targetTable: "tickets",
      targetId: ticket.ticketNumber,
      metadata: {
        recipientEmail: ticket.buyerEmail,
        attendeeName: ticket.attendeeName,
        emailProviderStatus: emailResult.providerStatus || "unknown",
        emailOutboxStatus: emailResult.status,
        emailProviderMessageId: emailResult.providerMessageId,
      },
      ipAddress: clientIp,
    });

    return {
      success: true,
      message:
        emailResult.status === "accepted"
          ? `The email provider accepted the ticket email for ${ticket.buyerEmail}; recipient delivery is not confirmed.`
          : `Ticket email queued for retry; current outbox status is ${emailResult.status}.`,
    };
  }

  /**
   * Issue complimentary (comp) tickets for guests, artists, sponsors, or affiliate milestone rewards
   */
  static async issueCompTickets(params: {
    tierSlug: string;
    quantity?: number | undefined;
    attendeeName: string;
    buyerEmail?: string | undefined;
    buyerPhone?: string | undefined;
    compReason?: string | undefined;
    reason?: string | undefined;
    compNote?: string | undefined;
    compForAffiliate?: string | undefined;
    referralCode?: string | undefined;
    idempotencyKey?: string | undefined;
    actorEmail: string;
    actorId?: string | undefined;
    clientIp?: string | undefined;
  }): Promise<{
    success: boolean;
    code?: string | undefined;
    message: string;
    order?: StoredOrder | undefined;
    tickets?: DigitalTicketRecord[] | undefined;
    emailDelivery?: {
      status: string;
      providerStatus: string;
      providerMessageId?: string;
      lastError?: string;
    } | undefined;
  }> {
    const trimmedName = (params.attendeeName || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "Please provide a valid recipient full name (at least 2 characters).",
      };
    }

    const trimmedEmail = (params.buyerEmail || "").trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "A valid recipient email address is required to issue a complimentary pass.",
      };
    }

    const rawReason = (params.compReason || params.reason || "").trim();
    if (!VALID_COMP_REASONS.has(rawReason as CompReason)) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message:
          "Please select a valid comp reason (affiliate_milestone, performer_staff, sponsor, or other).",
      };
    }
    const compReason = rawReason as CompReason;
    const trimmedNote = (params.compNote || "").trim();

    const normalizedAffiliate = normalizeReferralCode(
      params.compForAffiliate || params.referralCode,
    );
    if (compReason === "affiliate_milestone" && !normalizedAffiliate) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message:
          "An affiliate referral code is required when issuing a comp pass for an affiliate milestone.",
      };
    }

    const quantity = params.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return {
        success: false,
        code: "INVALID_INPUT",
        message: "Comp pass quantity must be an integer between 1 and 10.",
      };
    }

    let normalizedPhone = "254700000000";
    if (params.buyerPhone && params.buyerPhone.trim()) {
      const phoneCheck = validateAndNormalizeKenyanPhone(params.buyerPhone.trim());
      if (!phoneCheck.isValid) {
        return {
          success: false,
          code: "INVALID_PHONE",
          message: phoneCheck.error || "Please enter a valid Kenyan phone number.",
        };
      }
      normalizedPhone = phoneCheck.normalized;
    }

    const ticketTier = OrderService.getTicketType(params.tierSlug);
    if (!ticketTier) {
      return {
        success: false,
        code: "TICKET_NOT_FOUND",
        message: `Ticket tier '${params.tierSlug}' was not found.`,
      };
    }

    const orderId = randomUUID();
    const reservationId = randomUUID();
    const generateOrderNumber = () =>
      `HRT-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();
    const trimmedIdempotencyKey = (params.idempotencyKey || "").trim() || undefined;
    const issuedBy = (params.actorEmail || "").trim() || "admin@verve.co.ke";

    const compOrder: StoredOrder = {
      id: orderId,
      orderNumber: generateOrderNumber(),
      checkoutToken: `tok_${randomBytes(32).toString("hex")}`,
      eventId: ticketTier.eventId,
      ticketTypeId: ticketTier.id,
      ticketName: ticketTier.name,
      admitsCount: ticketTier.admitsCount,
      quantity,
      unitPriceKes: 0,
      discountKes: 0,
      subtotalKes: 0,
      totalKes: 0,
      currency: "KES",
      buyerName: trimmedName,
      buyerPhone: normalizedPhone,
      buyerEmail: trimmedEmail,
      referralCode: normalizedAffiliate,
      isComp: true,
      compReason,
      compNote: trimmedNote || undefined,
      compForAffiliate: normalizedAffiliate,
      issuedBy,
      status: "completed",
      mpesaCode: "COMP",
      paymentReference: "COMP",
      approvedBy: issuedBy,
      approvedAt: nowIso,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      idempotencyKey: trimmedIdempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const buildTickets = (ordNum: string): DigitalTicketRecord[] => {
      const list: DigitalTicketRecord[] = [];
      for (let i = 0; i < quantity; i++) {
        const ticketNumber = generateTicketCode();
        const qrHash = generateTicketHmac(ticketNumber, orderId, trimmedName);
        list.push({
          id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          orderId,
          orderNumber: ordNum,
          ticketNumber,
          qrHash,
          tierSlug: ticketTier.slug,
          tierName: ticketTier.name,
          admitsCount: ticketTier.admitsCount,
          attendeeName: trimmedName,
          buyerEmail: trimmedEmail,
          buyerPhone: normalizedPhone,
          status: "valid",
          priceKes: 0,
          issuedAt: nowIso,
          venue: {
            name: "Top Cliff Lodge",
            address: "Nakuru-Nairobi Highway, Free Area",
            city: "Nakuru, Kenya",
            date: "Saturday, 31 October 2026",
            time: "4 PM till late",
            ageRequirement: "18+",
          },
        });
      }
      return list;
    };

    let created:
      | Awaited<ReturnType<typeof ManualOrderStore.createCompOrderAndTickets>>
      | undefined;
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        const candidateTickets = buildTickets(compOrder.orderNumber);
        created = await ManualOrderStore.createCompOrderAndTickets(
          compOrder,
          reservationId,
          ticketTier,
          candidateTickets,
        );
        break;
      } catch (err) {
        const pgError = err as {
          code?: unknown;
          constraint?: unknown;
          message?: unknown;
          detail?: unknown;
        };
        const isOrderNumberCollision =
          pgError?.code === "23505" &&
          (String(pgError?.constraint || "").includes("order_number") ||
            String(pgError?.message || "").includes("order_number") ||
            String(pgError?.detail || "").includes("order_number"));
        if (isOrderNumberCollision && attempt < 5) {
          compOrder.orderNumber = generateOrderNumber();
          continue;
        }
        console.error("Failed to create comp order and tickets:", err);
        return {
          success: false,
          code: "SERVER_ERROR",
          message: "Shared order storage is unavailable. Could not issue complimentary pass.",
        };
      }
    }

    if (!created) {
      return {
        success: false,
        code: "SERVER_ERROR",
        message: "Could not issue complimentary pass.",
      };
    }

    if (created.inventoryError) {
      return {
        success: false,
        code: "INSUFFICIENT_INVENTORY",
        message: "Not enough places left for this ticket",
      };
    }

    const issuedTickets = created.tickets;
    const firstTicket = issuedTickets[0];

    if (created.duplicate) {
      return {
        success: true,
        message: `Complimentary pass already issued (${issuedTickets.map((t) => t.ticketNumber).join(", ")}).`,
        order: created.order,
        tickets: issuedTickets,
      };
    }

    await this.recordAuditLog({
      actorId: params.actorId || "admin-user",
      actorEmail: issuedBy,
      actorRole: "admin",
      action: "ticket.comp_issued",
      targetTable: "tickets",
      targetId: firstTicket?.ticketNumber || compOrder.orderNumber,
      metadata: {
        orderNumber: compOrder.orderNumber,
        ticketNumbers: issuedTickets.map((t) => t.ticketNumber),
        tierSlug: ticketTier.slug,
        tierName: ticketTier.name,
        quantity,
        admitsPeople: quantity * ticketTier.admitsCount,
        attendeeName: trimmedName,
        buyerEmail: trimmedEmail,
        compReason,
        compNote: trimmedNote || null,
        compForAffiliate: normalizedAffiliate || null,
        issuedBy,
      },
      ipAddress: params.clientIp,
    });

    let emailDelivery: {
      status: string;
      providerStatus: string;
      providerMessageId?: string;
      lastError?: string;
    } = { status: "not_requested", providerStatus: "no_recipient" };

    if (trimmedEmail && firstTicket) {
      const siteBase = getSiteBaseUrl();
      try {
        const outboxRecord = await NotificationOutbox.enqueueAndDispatch(
          {
            channel: "email",
            type: "ticket_confirmation",
            recipient: trimmedEmail,
            payload: {
              to: trimmedEmail,
              buyerName: trimmedName,
              orderNumber: compOrder.orderNumber,
              totalKes: 0,
              isComp: true,
              ticketTier: `${ticketTier.name} (Complimentary)`,
              quantity,
              ticketUrl: `${siteBase}/ticket/${firstTicket.ticketNumber}`,
              tickets: issuedTickets.map((t) => ({
                ticketNumber: t.ticketNumber,
                tierName: t.tierName,
                attendeeName: t.attendeeName,
                admitsCount: t.admitsCount,
                qrHash: t.qrHash,
                ticketUrl: `${siteBase}/ticket/${t.ticketNumber}`,
                qrDataUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                  JSON.stringify({
                    code: t.ticketNumber,
                    hash: t.qrHash,
                    event: "HALLOWEEN_RIFT_2026",
                    admits: t.admitsCount,
                  }),
                )}`,
              })),
            },
          },
          `ticket-confirmation:${compOrder.id}`,
        );
        emailDelivery = {
          status: outboxRecord.status,
          providerStatus: outboxRecord.providerStatus || "unknown",
          ...(outboxRecord.providerMessageId
            ? { providerMessageId: outboxRecord.providerMessageId }
            : {}),
          ...(outboxRecord.lastError ? { lastError: outboxRecord.lastError } : {}),
        };
      } catch (err) {
        emailDelivery = {
          status: "enqueue_failed",
          providerStatus: "not_attempted",
          lastError: err instanceof Error ? err.message : "Email could not be queued.",
        };
      }
    }

    return {
      success: true,
      message: `Issued ${issuedTickets.length} complimentary ${ticketTier.name} pass(es) (${issuedTickets.map((t) => t.ticketNumber).join(", ")}).`,
      order: created.order,
      tickets: issuedTickets,
      emailDelivery,
    };
  }

  /**
   * Get Affiliate Referral Leaderboard
   */
  static async getAffiliateLeaderboard() {
    const affiliates = await OrderService.getAffiliateReferralStats();
    const totalReferredPeople = affiliates.reduce((sum, a) => sum + a.admittedPeople, 0);
    const totalPendingPeople = affiliates.reduce((sum, a) => sum + a.pendingPeople, 0);
    const totalReferredRevenueKes = affiliates.reduce((sum, a) => sum + a.totalRevenueKes, 0);
    const totalCommissionKes = affiliates.reduce((sum, a) => sum + a.commissionKes, 0);
    const totalCompsEarned = affiliates.reduce((sum, a) => sum + a.compsEarned, 0);
    const totalCompsIssued = affiliates.reduce((sum, a) => sum + a.compsIssued, 0);
    const totalCompsOutstanding = affiliates.reduce((sum, a) => sum + a.compsOutstanding, 0);
    return {
      terms: AFFILIATE_TERMS,
      affiliates,
      summary: {
        activeAffiliatesCount: affiliates.length,
        totalReferredPeople,
        totalPendingPeople,
        totalReferredRevenueKes,
        totalCommissionKes,
        totalCommissionDueKes: totalCommissionKes,
        totalCompsEarned,
        totalCompsIssued,
        totalCompsOutstanding,
      },
    };
  }

  /**
   * Get all Promotions
   */
  static getPromotions(): PromotionRecord[] {
    return Array.from(promotionsStore.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get Active published promotions for customer/public discovery
   */
  static getActivePromotions(): PromotionRecord[] {
    const now = new Date();
    return Array.from(promotionsStore.values()).filter((p) => {
      if (!p.isActive) return false;
      if (p.expiresAt && new Date(p.expiresAt) < now) return false;
      if (p.currentUses >= p.maxUses) return false;
      return true;
    });
  }

  /**
   * Create New Promotion Code
   */
  static async createPromotion(params: {
    code: string;
    name?: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxUses: number;
    expiresAt?: string | null;
    isActive?: boolean;
    actorEmail: string;
    actorId?: string;
    clientIp?: string;
  }): Promise<{ success: boolean; message: string; promo?: PromotionRecord }> {
    const code = params.code.trim().toUpperCase();

    if (!code) {
      return { success: false, message: "Promotion code cannot be blank." };
    }

    if (promotionsStore.has(code)) {
      return { success: false, message: `Promo code '${code}' already exists.` };
    }

    if (params.discountValue <= 0) {
      return { success: false, message: "Discount value must be greater than zero." };
    }

    if (params.discountType === "percentage" && params.discountValue > 100) {
      return { success: false, message: "Percentage discount cannot exceed 100%." };
    }

    const newPromo: PromotionRecord = {
      id: `promo-${Date.now()}`,
      code,
      name: params.name || `${code} Promotional Offer`,
      discountType: params.discountType,
      discountValue: Number(params.discountValue),
      maxUses: Number(params.maxUses) || 100,
      currentUses: 0,
      expiresAt: params.expiresAt || null,
      isActive: params.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    promotionsStore.set(code, newPromo);

    // Audit log
    await this.recordAuditLog({
      actorId: params.actorId || "admin-user",
      actorEmail: params.actorEmail,
      actorRole: "admin",
      action: "promotion.created",
      targetTable: "promotions",
      targetId: newPromo.code,
      metadata: {
        code: newPromo.code,
        discountType: newPromo.discountType,
        discountValue: newPromo.discountValue,
        maxUses: newPromo.maxUses,
      },
      ipAddress: params.clientIp,
    });

    return {
      success: true,
      message: `Promo code ${newPromo.code} created successfully.`,
      promo: newPromo,
    };
  }

  /**
   * Toggle Promotion Active / Inactive
   */
  static async togglePromotion(params: {
    codeOrId: string;
    isActive: boolean;
    actorEmail: string;
    actorId?: string;
    clientIp?: string;
  }): Promise<{ success: boolean; message: string; promo?: PromotionRecord }> {
    const { codeOrId, isActive, actorEmail, actorId, clientIp } = params;

    let target: PromotionRecord | undefined;
    for (const p of promotionsStore.values()) {
      if (p.id === codeOrId || p.code.toUpperCase() === codeOrId.toUpperCase()) {
        target = p;
        break;
      }
    }

    if (!target) {
      return { success: false, message: "Promotion code not found." };
    }

    target.isActive = isActive;
    target.updatedAt = new Date().toISOString();
    promotionsStore.set(target.code.toUpperCase(), target);

    // Audit log
    await this.recordAuditLog({
      actorId: actorId || "admin-user",
      actorEmail,
      actorRole: "admin",
      action: isActive ? "promotion.activated" : "promotion.deactivated",
      targetTable: "promotions",
      targetId: target.code,
      metadata: { code: target.code, isActive },
      ipAddress: clientIp,
    });

    return {
      success: true,
      message: `Promo code ${target.code} is now ${isActive ? "ACTIVE" : "PAUSED"}.`,
      promo: target,
    };
  }

  /**
   * Delete / Remove Promotion Code
   */
  static async deletePromotion(params: {
    codeOrId: string;
    actorEmail: string;
    actorId?: string;
    clientIp?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { codeOrId, actorEmail, actorId, clientIp } = params;

    let target: PromotionRecord | undefined;
    for (const p of promotionsStore.values()) {
      if (p.id === codeOrId || p.code.toUpperCase() === codeOrId.toUpperCase()) {
        target = p;
        break;
      }
    }

    if (!target) {
      return { success: false, message: "Promotion code not found." };
    }

    promotionsStore.delete(target.code.toUpperCase());

    await this.recordAuditLog({
      actorId: actorId || "admin-user",
      actorEmail,
      actorRole: "admin",
      action: "promotion.deleted",
      targetTable: "promotions",
      targetId: target.code,
      metadata: { code: target.code },
      ipAddress: clientIp,
    });

    return {
      success: true,
      message: `Promo code ${target.code} was removed.`,
    };
  }

  /**
   * Validate Promo Code for customer checkout
   */
  static validatePromoCode(
    code: string,
    subtotalKes: number,
  ): {
    valid: boolean;
    message?: string;
    discountKes?: number;
    promo?: {
      code: string;
      discountType: string;
      discountValue: number;
    };
  } {
    const normalized = code.trim().toUpperCase();
    const promo = promotionsStore.get(normalized);

    if (!promo) {
      return { valid: false, message: "Invalid promotional discount code." };
    }

    if (!promo.isActive) {
      return { valid: false, message: "This promotional code is currently inactive." };
    }

    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
      return { valid: false, message: "This promotional code has expired." };
    }

    if (promo.currentUses >= promo.maxUses) {
      return {
        valid: false,
        message: "This promotional code has reached its maximum usage limit.",
      };
    }

    let discountKes = 0;
    if (promo.discountType === "percentage") {
      discountKes = Math.round((subtotalKes * promo.discountValue) / 100);
    } else {
      discountKes = Math.min(subtotalKes, promo.discountValue);
    }

    return {
      valid: true,
      discountKes,
      promo: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      },
    };
  }

  /**
   * Get Scanner Devices & Staff
   */
  static getScanners(): ScannerDeviceRecord[] {
    return Array.from(scannersStore.values());
  }

  /**
   * Register a new gate scanner device
   */
  static registerScanner(params: {
    name: string;
    operatorName: string;
    gateLocation: string;
    status?: "active" | "standby" | "offline";
  }): ScannerDeviceRecord {
    const id = `scan-${Date.now().toString(36)}`;
    const record: ScannerDeviceRecord = {
      id,
      name: params.name.trim(),
      operatorName: params.operatorName.trim(),
      gateLocation: params.gateLocation.trim(),
      status: params.status || "active",
      scansCount: 0,
      lastScanAt: null,
    };
    scannersStore.set(id, record);
    return record;
  }

  /**
   * Delete a scanner device
   */
  static deleteScanner(id: string): boolean {
    return scannersStore.delete(id);
  }
}
