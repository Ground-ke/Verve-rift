import { supabaseServer, isServerSupabaseConfigured } from "../lib/supabase/server";
import { TicketsServerService, type DigitalTicketRecord } from "./tickets.server";
import { AdminServerService } from "./admin-service";
import { WhatsAppNotificationService } from "./whatsapp-service";
import { sendRefundNoticeEmail } from "./email.server";
import type { FinancialReconciliationRecord, FinancialSummaryTotals } from "../lib/export-utils";

export interface RefundRecord {
  id: string;
  transactionId: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: string;
  attendeeName: string;
  amountKes: number;
  originalAmountKes: number;
  reason: string;
  refundType: "full" | "partial";
  status: "pending" | "processed" | "failed";
  processedBy: string;
  refundRef: string;
  createdAt: string;
}

// In-Memory Synchronized Store for Refunds (starts empty, populated upon live organizer actions)
const refundsStore = new Map<string, RefundRecord>();

export class RefundService {
  /**
   * Get all refunds
   */
  static getAllRefunds(): RefundRecord[] {
    return Array.from(refundsStore.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Process a Full or Partial Refund for an Order / Ticket
   */
  static async processRefund(params: {
    orderId: string;
    ticketNumber?: string;
    amountKes: number;
    reason: string;
    refundType?: "full" | "partial";
    processedBy?: string;
    actorId?: string;
    clientIp?: string;
  }): Promise<{
    success: boolean;
    message: string;
    refund?: RefundRecord;
    ticket?: DigitalTicketRecord;
  }> {
    const {
      orderId,
      ticketNumber,
      amountKes,
      reason,
      refundType = "full",
      processedBy = "admin@verve.co.ke",
      actorId,
      clientIp,
    } = params;

    // 1. Locate Ticket by ticketNumber or orderId
    const allTickets = await TicketsServerService.getAllTickets();
    let targetTicket = ticketNumber
      ? allTickets.find((t) => t.ticketNumber === ticketNumber)
      : undefined;

    if (!targetTicket && orderId) {
      targetTicket = allTickets.find((t) => t.orderId === orderId || t.orderNumber === orderId);
    }

    if (!targetTicket) {
      return {
        success: false,
        message: "No active ticket found for this order ID or ticket code.",
      };
    }

    if (targetTicket.status === "refunded") {
      return {
        success: false,
        message: `Ticket ${targetTicket.ticketNumber} has already been refunded.`,
      };
    }

    if (amountKes <= 0 || amountKes > targetTicket.priceKes) {
      return {
        success: false,
        message: `Refund amount must be between KES 1 and KES ${targetTicket.priceKes.toLocaleString()}.`,
      };
    }

    // 2. Execute Payment Provider Reversal API (M-Pesa B2C / Stripe Refund simulation)
    const refundRef = `REV-MPESA-${Date.now().toString(36).toUpperCase()}`;

    // 3. Create Refund Ledger Record
    const refundRecord: RefundRecord = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transactionId: `tx_${targetTicket.orderId}`,
      orderId: targetTicket.orderId,
      orderNumber: targetTicket.orderNumber,
      ticketNumber: targetTicket.ticketNumber,
      attendeeName: targetTicket.attendeeName,
      amountKes: Number(amountKes),
      originalAmountKes: targetTicket.priceKes,
      reason,
      refundType,
      status: "processed",
      processedBy,
      refundRef,
      createdAt: new Date().toISOString(),
    };

    refundsStore.set(refundRecord.id, refundRecord);

    // 4. Update Ticket Status to 'refunded' and invalidate gate pass
    targetTicket.status = "refunded";
    await TicketsServerService.updateTicketRecord(targetTicket);

    // 5. Record Authoritative Audit Log
    await AdminServerService.recordAuditLog({
      actorId: actorId || "admin-refund-officer",
      actorEmail: processedBy,
      actorRole: "admin",
      action: "order.refunded",
      targetTable: "refunds",
      targetId: refundRecord.id,
      metadata: {
        orderNumber: targetTicket.orderNumber,
        ticketNumber: targetTicket.ticketNumber,
        attendeeName: targetTicket.attendeeName,
        amountKes,
        refundType,
        reason,
        refundRef,
      },
      ipAddress: clientIp,
    });

    // 6. Persist to Supabase if available
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        await supabaseServer.from("refunds").insert({
          id: refundRecord.id,
          order_id: targetTicket.orderId,
          ticket_number: targetTicket.ticketNumber,
          amount: amountKes,
          reason,
          status: "processed",
          processed_by: processedBy,
          refund_ref: refundRef,
        });
      } catch (err) {
        console.warn("Could not insert refund into Supabase:", err);
      }
    }

    // 7. Dispatch Automated Refund Notices (WhatsApp Template + HTML Email)
    if (targetTicket.buyerPhone) {
      WhatsAppNotificationService.sendNotification({
        recipientPhone: targetTicket.buyerPhone,
        template: "refund_notice",
        params: {
          customerName: targetTicket.attendeeName,
          refundAmountKes: amountKes,
          paymentProviderRef: refundRef,
          reasonOrDetails: reason,
          orderId: targetTicket.orderNumber || targetTicket.orderId,
        },
      }).catch((err) => console.warn("[WhatsApp Refund Notice Error]", err));
    }

    if (targetTicket.buyerEmail) {
      sendRefundNoticeEmail({
        to: targetTicket.buyerEmail,
        customerName: targetTicket.attendeeName,
        refundAmount: amountKes,
        paymentRef: refundRef,
        refundReason: reason,
        orderId: targetTicket.orderNumber || targetTicket.orderId,
      }).catch((err) => console.warn("[Email Refund Notice Error]", err));
    }

    return {
      success: true,
      message: `Refund of KES ${amountKes.toLocaleString()} successfully processed (${refundRef}). Pass invalidated.`,
      refund: refundRecord,
      ticket: targetTicket,
    };
  }

  /**
   * Compute Financial Reconciliation Metrics & Transaction Ledger
   */
  static async getReconciliationData(): Promise<{
    totals: FinancialSummaryTotals;
    ledger: FinancialReconciliationRecord[];
    refunds: RefundRecord[];
  }> {
    const tickets = await TicketsServerService.getAllTickets();
    const refunds = Array.from(refundsStore.values());

    const totalTicketsSold = tickets.length;
    const grossRevenueKes = tickets.reduce((sum, t) => sum + (t.priceKes || 0), 0);
    const totalRefundsKes = refunds.reduce((sum, r) => sum + (r.amountKes || 0), 0);

    // M-Pesa gateway transaction fee (standard 2.5%)
    const platformFeesKes = Math.round(grossRevenueKes * 0.025);
    const netRevenueKes = grossRevenueKes - totalRefundsKes - platformFeesKes;

    const totals: FinancialSummaryTotals = {
      grossRevenueKes,
      totalRefundsKes,
      platformFeesKes,
      netRevenueKes,
      totalTicketsSold,
      totalRefundsCount: refunds.length,
    };

    // Build structured reconciliation line items for each transaction
    const ledger: FinancialReconciliationRecord[] = tickets.map((t) => {
      const refund = refunds.find(
        (r) => r.ticketNumber === t.ticketNumber || r.orderId === t.orderId,
      );
      const isRefunded = t.status === "refunded" || Boolean(refund);
      const fee = Math.round(t.priceKes * 0.025);
      const net = isRefunded ? 0 : t.priceKes - fee;

      let status: "Matched" | "Discrepancy" | "Refunded" | "Pending Settlement" = "Matched";
      if (isRefunded) {
        status = "Refunded";
      } else if (t.status === "cancelled") {
        status = "Discrepancy";
      }

      return {
        transactionId: `tx_${t.ticketNumber}`,
        orderNumber: t.orderNumber,
        gatewayRef: `MPESA-${t.ticketNumber.replace(/-/g, "")}`,
        attendeeName: t.attendeeName,
        tierName: t.tierName,
        amountKes: t.priceKes,
        gatewayFeeKes: fee,
        netRevenueKes: net,
        status,
        createdAt: t.issuedAt,
      };
    });

    return {
      totals,
      ledger,
      refunds,
    };
  }
}
