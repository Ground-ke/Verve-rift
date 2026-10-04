import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getSharedPool } from "../db/index.ts";
import type { StoredOrder } from "./order-service";

export interface ManualPaymentReceipt {
  id: string;
  orderId: string;
  orderNumber: string;
  receiptReference: string;
  amountKes: number;
  receivedAt: string;
  recordedBy: string;
  evidenceNote: string;
  createdAt: string;
}

export interface ManualPaymentSettlement {
  id: string;
  settlementReference: string;
  amountKes: number;
  settledAt: string;
  recordedBy: string;
  evidenceNote: string;
  createdAt: string;
}

export interface ManualPaymentReview {
  id: string;
  orderId: string;
  submittedReference: string;
  receiptReference: string;
  expectedAmountKes: number;
  receivedAmountKes: number;
  status: "accepted" | "amount_mismatch" | "duplicate_reference";
  recordedBy: string;
  evidenceNote: string;
  createdAt: string;
}

export interface ManualRefundRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: string;
  amountKes: number;
  originalAmountKes: number;
  reason: string;
  refundType: "full" | "partial";
  reversalReference: string;
  processedBy: string;
  externalReversalProcessedAt: string;
  createdAt: string;
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getSharedPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    const pgError = error as { code?: unknown; message?: unknown; constraint?: unknown };
    console.error("[PaymentOperationsStore] Database transaction error:", {
      code: pgError?.code,
      message: pgError?.message,
      constraint: pgError?.constraint,
    });
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class PaymentOperationsStore {
  static async hasReceiptForOrder(orderId: string): Promise<boolean> {
    const result = await getSharedPool().query(
      `SELECT 1 FROM public.manual_payment_receipts r
       JOIN public.manual_ticket_orders o ON o.id = r.order_id
       WHERE o.id = $1 OR o.order_number = $1
       LIMIT 1`,
      [orderId],
    );
    return result.rowCount === 1;
  }

  static async verifyAndApproveOrder(params: {
    orderId: string;
    receiptReference: string;
    receivedAmountKes: number;
    receivedAt: string;
    recordedBy: string;
    evidenceNote: string;
  }): Promise<
    | { status: "approved"; order: StoredOrder; receipt: ManualPaymentReceipt }
    | { status: "amount_mismatch" | "duplicate_reference" | "invalid_order"; message: string }
  > {
    const receiptReference = params.receiptReference.trim().toUpperCase();
    return withTransaction(async (client) => {
      const selected = await client.query<{ status: string; data: StoredOrder }>(
        `SELECT status, data FROM public.manual_ticket_orders
         WHERE id = $1 OR order_number = $1
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [params.orderId],
      );
      const row = selected.rows[0];
      if (!row || row.status !== "pending_approval" || !row.data.mpesaCode) {
        return {
          status: "invalid_order" as const,
          message: "Only an order with a submitted payment reference can be reviewed.",
        };
      }

      const expectedAmountKes = row.data.totalKes;
      if (params.receivedAmountKes !== expectedAmountKes) {
        await client.query(
          `INSERT INTO public.manual_payment_receipt_reviews
            (id, order_id, submitted_reference, receipt_reference, expected_amount_kes, received_amount_kes,
             status, recorded_by, evidence_note)
           VALUES ($1, $2, $3, $4, $5, $6, 'amount_mismatch', $7, $8)`,
          [
            randomUUID(),
            row.data.id,
            row.data.mpesaCode,
            receiptReference,
            expectedAmountKes,
            params.receivedAmountKes,
            params.recordedBy,
            params.evidenceNote,
          ],
        );
        await this.writeAudit(client, {
          actorId: params.recordedBy,
          action: "payment.receipt_exception",
          targetTable: "manual_payment_receipt_reviews",
          targetId: row.data.id,
          metadata: {
            submittedReference: row.data.mpesaCode,
            receiptReference,
            expectedAmountKes,
            receivedAmountKes: params.receivedAmountKes,
          },
        });
        return {
          status: "amount_mismatch" as const,
          message: `Statement amount does not match the order total of KES ${expectedAmountKes}.`,
        };
      }

      const receiptId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.manual_payment_receipts
          (id, order_id, receipt_reference, amount_kes, received_at, recorded_by, evidence_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          receiptId,
          row.data.id,
          receiptReference,
          params.receivedAmountKes,
          params.receivedAt,
          params.recordedBy,
          params.evidenceNote,
        ],
      );
      if (!inserted.rows[0]) {
        await client.query(
          `INSERT INTO public.manual_payment_receipt_reviews
            (id, order_id, submitted_reference, receipt_reference, expected_amount_kes, received_amount_kes,
             status, recorded_by, evidence_note)
           VALUES ($1, $2, $3, $4, $5, $6, 'duplicate_reference', $7, $8)`,
          [
            randomUUID(),
            row.data.id,
            row.data.mpesaCode,
            receiptReference,
            expectedAmountKes,
            params.receivedAmountKes,
            params.recordedBy,
            params.evidenceNote,
          ],
        );
        await this.writeAudit(client, {
          actorId: params.recordedBy,
          action: "payment.duplicate_receipt",
          targetTable: "manual_payment_receipt_reviews",
          targetId: row.data.id,
          metadata: { submittedReference: row.data.mpesaCode, receiptReference },
        });
        return {
          status: "duplicate_reference" as const,
          message: "This M-Pesa receipt reference has already been recorded for another payment.",
        };
      }

      const approvedAt = new Date().toISOString();
      const order: StoredOrder = {
        ...row.data,
        status: "approved",
        mpesaCode: receiptReference,
        paymentReference: receiptReference,
        approvedBy: params.recordedBy,
        approvedAt,
        updatedAt: approvedAt,
      };
      const updated = await client.query<{ data: StoredOrder }>(
        `UPDATE public.manual_ticket_orders
         SET status = 'approved', mpesa_code = $2, data = $3::jsonb, updated_at = NOW()
         WHERE id = $1 AND status = 'pending_approval'
         RETURNING data`,
        [order.id, receiptReference, JSON.stringify(order)],
      );
      if (!updated.rows[0]) throw new Error("Order status changed during receipt verification.");
      await client.query(
        `UPDATE public.manual_ticket_reservations
         SET status = 'completed', updated_at = NOW()
         WHERE order_id = $1 AND status = 'active'`,
        [order.id],
      );
      await client.query(
        `INSERT INTO public.manual_payment_receipt_reviews
          (id, order_id, submitted_reference, receipt_reference, expected_amount_kes, received_amount_kes,
           status, recorded_by, evidence_note)
         VALUES ($1, $2, $3, $4, $5, $6, 'accepted', $7, $8)`,
        [
          randomUUID(),
          order.id,
          row.data.mpesaCode,
          receiptReference,
          expectedAmountKes,
          params.receivedAmountKes,
          params.recordedBy,
          params.evidenceNote,
        ],
      );
      await this.writeAudit(client, {
        actorId: params.recordedBy,
        action: "payment.receipt_verified",
        targetTable: "manual_payment_receipts",
        targetId: receiptId,
        metadata: {
          orderNumber: order.orderNumber,
          submittedReference: row.data.mpesaCode,
          receiptReference,
          amountKes: params.receivedAmountKes,
        },
      });
      return {
        status: "approved" as const,
        order: updated.rows[0].data,
        receipt: {
          id: receiptId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          receiptReference,
          amountKes: params.receivedAmountKes,
          receivedAt: params.receivedAt,
          recordedBy: params.recordedBy,
          evidenceNote: params.evidenceNote,
          createdAt: approvedAt,
        },
      };
    });
  }

  static async recordSettlement(params: {
    settlementReference: string;
    amountKes: number;
    settledAt: string;
    recordedBy: string;
    evidenceNote: string;
  }): Promise<{ settlement?: ManualPaymentSettlement; duplicate: boolean }> {
    return withTransaction(async (client) => {
      const id = randomUUID();
      const result = await client.query<{ created_at: string }>(
        `INSERT INTO public.manual_payment_settlements
          (id, settlement_reference, amount_kes, settled_at, recorded_by, evidence_note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (settlement_reference) DO NOTHING
         RETURNING created_at`,
        [
          id,
          params.settlementReference.trim().toUpperCase(),
          params.amountKes,
          params.settledAt,
          params.recordedBy,
          params.evidenceNote,
        ],
      );
      if (!result.rows[0]) return { duplicate: true };
      await this.writeAudit(client, {
        actorId: params.recordedBy,
        action: "payment.settlement_recorded",
        targetTable: "manual_payment_settlements",
        targetId: id,
        metadata: {
          settlementReference: params.settlementReference.trim().toUpperCase(),
          amountKes: params.amountKes,
          settledAt: params.settledAt,
        },
      });
      return {
        duplicate: false,
        settlement: {
          id,
          settlementReference: params.settlementReference.trim().toUpperCase(),
          amountKes: params.amountKes,
          settledAt: params.settledAt,
          recordedBy: params.recordedBy,
          evidenceNote: params.evidenceNote,
          createdAt: result.rows[0].created_at,
        },
      };
    });
  }

  static async getReceipts(): Promise<ManualPaymentReceipt[]> {
    const result = await getSharedPool().query<ManualPaymentReceipt>(
      `SELECT r.id, r.order_id AS "orderId", o.order_number AS "orderNumber",
              r.receipt_reference AS "receiptReference", r.amount_kes AS "amountKes",
              r.received_at AS "receivedAt", r.recorded_by AS "recordedBy",
              r.evidence_note AS "evidenceNote", r.created_at AS "createdAt"
       FROM public.manual_payment_receipts r
       JOIN public.manual_ticket_orders o ON o.id = r.order_id
       ORDER BY r.created_at DESC`,
    );
    return result.rows;
  }

  static async getSettlements(): Promise<ManualPaymentSettlement[]> {
    const result = await getSharedPool().query<ManualPaymentSettlement>(
      `SELECT id, settlement_reference AS "settlementReference", amount_kes AS "amountKes",
              settled_at AS "settledAt", recorded_by AS "recordedBy",
              evidence_note AS "evidenceNote", created_at AS "createdAt"
       FROM public.manual_payment_settlements ORDER BY settled_at DESC`,
    );
    return result.rows;
  }

  static async getRefunds(): Promise<ManualRefundRecord[]> {
    const result = await getSharedPool().query<ManualRefundRecord>(
      `SELECT r.id, r.order_id AS "orderId", o.order_number AS "orderNumber",
              r.ticket_number AS "ticketNumber", r.amount_kes AS "amountKes",
              r.original_amount_kes AS "originalAmountKes", r.reason, r.refund_type AS "refundType",
              r.reversal_reference AS "reversalReference", r.processed_by AS "processedBy",
              r.external_reversal_processed_at AS "externalReversalProcessedAt",
              r.created_at AS "createdAt"
       FROM public.manual_ticket_refunds r
       JOIN public.manual_ticket_orders o ON o.id = r.order_id
       ORDER BY r.created_at DESC`,
    );
    return result.rows;
  }

  static async getReceiptReviews(): Promise<ManualPaymentReview[]> {
    const result = await getSharedPool().query<ManualPaymentReview>(
      `SELECT id, order_id AS "orderId", submitted_reference AS "submittedReference",
              receipt_reference AS "receiptReference",
              expected_amount_kes AS "expectedAmountKes", received_amount_kes AS "receivedAmountKes",
              status, recorded_by AS "recordedBy", evidence_note AS "evidenceNote",
              created_at AS "createdAt"
       FROM public.manual_payment_receipt_reviews ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  private static async writeAudit(
    client: PoolClient,
    event: {
      actorId: string;
      action: string;
      targetTable: string;
      targetId: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO public.manual_payment_audit_events
        (id, actor_id, action, target_table, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        randomUUID(),
        event.actorId,
        event.action,
        event.targetTable,
        event.targetId,
        JSON.stringify(event.metadata),
      ],
    );
  }
}
