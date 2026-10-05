import type { DigitalTicketRecord } from "./tickets.server";
import { PaymentOperationsStore, type ManualRefundRecord } from "./payment-operations-store";
import type { FinancialReconciliationRecord, FinancialSummaryTotals } from "../lib/export-utils";
import { OrderService } from "./order-service";

export type RefundRecord = ManualRefundRecord;

export class RefundService {
  static async processRefund(_params: {
    orderId: string;
    ticketNumber?: string;
    amountKes: number;
    reason: string;
    refundType: "full" | "partial";
    reversalReference: string;
    externalReversalProcessedAt: string;
    confirmedExternalReversal: boolean;
    processedBy: string;
  }): Promise<{
    success: boolean;
    message: string;
    refund?: RefundRecord;
    ticket?: DigitalTicketRecord;
    code?: string;
  }> {
    return {
      success: false,
      code: "REVERSAL_VERIFICATION_UNAVAILABLE",
      message:
        "Refund recording is disabled until an external M-Pesa reversal can be independently verified. This app does not initiate reversals.",
    };
  }

  static async getReconciliationData(): Promise<{
    available: boolean;
    totals: FinancialSummaryTotals;
    ledger: FinancialReconciliationRecord[];
    refunds: RefundRecord[];
    receipts: Awaited<ReturnType<typeof PaymentOperationsStore.getReceipts>>;
    settlements: Awaited<ReturnType<typeof PaymentOperationsStore.getSettlements>>;
    receiptReviews: Awaited<ReturnType<typeof PaymentOperationsStore.getReceiptReviews>>;
  }> {
    const [receipts, settlements, refunds, receiptReviews] = await Promise.all([
      PaymentOperationsStore.getReceipts(),
      PaymentOperationsStore.getSettlements(),
      PaymentOperationsStore.getRefunds(),
      PaymentOperationsStore.getReceiptReviews(),
    ]);
    const orders = await OrderService.getAllOrders();
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const paidReceipts = receipts.filter((receipt) => {
      const order = orderById.get(receipt.orderId);
      if (order?.isComp || order?.mpesaCode === "COMP" || receipt.receiptReference === "COMP") {
        return false;
      }
      return true;
    });
    const ticketsSold = paidReceipts.reduce(
      (sum, receipt) => sum + (orderById.get(receipt.orderId)?.quantity || 0),
      0,
    );
    const ledger: FinancialReconciliationRecord[] = paidReceipts.map((receipt) => {
      const order = orderById.get(receipt.orderId);
      return {
        transactionId: receipt.id,
        orderNumber: receipt.orderNumber,
        gatewayRef: receipt.receiptReference,
        attendeeName: order?.buyerName || "Order record unavailable",
        tierName: order?.ticketName || "Ticket tier unavailable",
        amountKes: receipt.amountKes,
        gatewayFeeKes: null,
        netRevenueKes: null,
        status: "Verified Receipt",
        createdAt: receipt.receivedAt,
      };
    });
    const totals: FinancialSummaryTotals = {
      grossRevenueKes: paidReceipts.reduce((sum, receipt) => sum + receipt.amountKes, 0),
      totalRefundsKes: refunds.reduce((sum, refund) => sum + refund.amountKes, 0),
      platformFeesKes: null,
      netRevenueKes: null,
      totalSettlementsKes: settlements.reduce((sum, settlement) => sum + settlement.amountKes, 0),
      totalTicketsSold: ticketsSold,
      totalRefundsCount: refunds.length,
    };
    return {
      available: paidReceipts.length > 0 || settlements.length > 0 || refunds.length > 0,
      totals,
      ledger,
      refunds,
      receipts: paidReceipts,
      settlements,
      receiptReviews,
    };
  }
}
