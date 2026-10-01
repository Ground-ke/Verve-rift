import { getSharedPool } from "../db/index.ts";
import type { PoolClient } from "pg";
import type { StoredOrder, StoredReservation, TicketTypeConfig } from "./order-service";
import type { DigitalTicketRecord, PaymentTransactionRecord } from "./tickets.server";

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getSharedPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function orderFromRow(row: { data: StoredOrder }): StoredOrder {
  return row.data;
}

export class ManualOrderStore {
  static async createOrder(
    order: StoredOrder,
    reservation: StoredReservation,
    ticket: TicketTypeConfig,
  ): Promise<{ order: StoredOrder; conflict: boolean; inventoryError: boolean }> {
    return withTransaction(async (client) => {
      if (order.idempotencyKey) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `idempotency:${order.idempotencyKey}`,
        ]);
        const prior = await client.query<{ data: StoredOrder }>(
          "SELECT data FROM public.manual_ticket_orders WHERE idempotency_key = $1 LIMIT 1",
          [order.idempotencyKey],
        );
        if (prior.rows[0]) {
          const existing = orderFromRow(prior.rows[0]);
          return {
            order: existing,
            conflict: existing.requestFingerprint !== order.requestFingerprint,
            inventoryError: false,
          };
        }
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`inventory:${ticket.id}`]);
      if (ticket.totalInventory !== null) {
        const count = await client.query<{ quantity: string }>(
          `SELECT COALESCE(SUM(quantity), 0)::text AS quantity
           FROM public.manual_ticket_orders
           WHERE ticket_type_id = $1
             AND ((status IN ('pending', 'pending_approval') AND expires_at > NOW())
               OR status IN ('approved', 'paid', 'completed'))`,
          [ticket.id],
        );
        if (Number(count.rows[0]?.quantity || 0) + order.quantity > ticket.totalInventory) {
          return { order, conflict: false, inventoryError: true };
        }
      }

      await client.query(
        `INSERT INTO public.manual_ticket_orders
          (id, order_number, idempotency_key, ticket_type_id, quantity, status, expires_at, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          order.id,
          order.orderNumber,
          order.idempotencyKey || null,
          order.ticketTypeId,
          order.quantity,
          order.status,
          order.expiresAt,
          JSON.stringify(order),
        ],
      );
      await client.query(
        `INSERT INTO public.manual_ticket_reservations (id, order_id, ticket_type_id, quantity, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [
          reservation.id,
          order.id,
          reservation.ticketTypeId,
          reservation.quantity,
          reservation.expiresAt,
        ],
      );
      return { order, conflict: false, inventoryError: false };
    });
  }

  static async getOrder(orderId: string): Promise<StoredOrder | undefined> {
    const result = await getSharedPool().query<{ data: StoredOrder }>(
      "SELECT data FROM public.manual_ticket_orders WHERE id = $1",
      [orderId],
    );
    return result.rows[0]?.data;
  }

  static async findOrder(orderId: string): Promise<StoredOrder | undefined> {
    const result = await getSharedPool().query<{ data: StoredOrder }>(
      `SELECT data FROM public.manual_ticket_orders
       WHERE id = $1 OR order_number = $1 OR mpesa_code = $1
       ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return result.rows[0]?.data;
  }

  static async updateOrder(order: StoredOrder): Promise<StoredOrder | undefined> {
    const result = await getSharedPool().query<{ data: StoredOrder }>(
      `UPDATE public.manual_ticket_orders
       SET order_number = $2, ticket_type_id = $3, quantity = $4, status = $5,
           expires_at = $6, mpesa_code = $7, data = $8::jsonb, updated_at = NOW()
       WHERE id = $1 RETURNING data`,
      [
        order.id,
        order.orderNumber,
        order.ticketTypeId,
        order.quantity,
        order.status,
        order.expiresAt,
        order.mpesaCode || null,
        JSON.stringify(order),
      ],
    );
    return result.rows[0]?.data;
  }

  static async updateOrderAndReservation(
    order: StoredOrder,
    expectedStatuses?: string[],
  ): Promise<StoredOrder | undefined> {
    return withTransaction(async (client) => {
      const result = await client.query<{ data: StoredOrder }>(
        `UPDATE public.manual_ticket_orders
         SET status = $2, expires_at = $3, mpesa_code = $4, data = $5::jsonb, updated_at = NOW()
         WHERE id = $1 AND ($6::text[] IS NULL OR status = ANY($6::text[])) RETURNING data`,
        [
          order.id,
          order.status,
          order.expiresAt,
          order.mpesaCode || null,
          JSON.stringify(order),
          expectedStatuses || null,
        ],
      );
      if (!result.rows[0]) return undefined;
      await client.query(
        `UPDATE public.manual_ticket_reservations
         SET expires_at = $2, status = $3, updated_at = NOW()
         WHERE order_id = $1 AND status = 'active'`,
        [
          order.id,
          order.expiresAt,
          order.status === "approved" || order.status === "paid" || order.status === "completed"
            ? "completed"
            : order.status === "cancelled" || order.status === "rejected"
              ? "released"
              : "active",
        ],
      );
      return result.rows[0].data;
    });
  }

  static async listOrders(status?: string): Promise<StoredOrder[]> {
    const result = await getSharedPool().query<{ data: StoredOrder }>(
      `SELECT data FROM public.manual_ticket_orders
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY updated_at DESC`,
      [status || null],
    );
    return result.rows.map(orderFromRow);
  }

  static async issueTickets(
    orderId: string,
    expectedStatus: string[],
    tickets: DigitalTicketRecord[],
  ): Promise<DigitalTicketRecord[]> {
    return withTransaction(async (client) => {
      const order = await client.query<{ status: string; data: StoredOrder }>(
        "SELECT status, data FROM public.manual_ticket_orders WHERE id = $1 FOR UPDATE",
        [orderId],
      );
      if (
        !order.rows[0] ||
        !expectedStatus.includes(order.rows[0].status) ||
        !order.rows[0].data.mpesaCode ||
        tickets.length !== order.rows[0].data.quantity
      ) {
        throw new Error("Tickets can only be issued for an approved order.");
      }
      const existing = await client.query<{ data: DigitalTicketRecord }>(
        `SELECT data FROM public.manual_ticket_records WHERE order_id = $1 ORDER BY ticket_number`,
        [orderId],
      );
      if (existing.rows.length) return existing.rows.map((row) => row.data);
      for (const ticket of tickets) {
        await client.query(
          `INSERT INTO public.manual_ticket_records (ticket_number, order_id, status, data)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [ticket.ticketNumber, orderId, ticket.status, JSON.stringify(ticket)],
        );
      }
      return tickets;
    });
  }

  static async getTicketsForOrder(orderId: string): Promise<DigitalTicketRecord[]> {
    const result = await getSharedPool().query<{ data: DigitalTicketRecord }>(
      "SELECT data FROM public.manual_ticket_records WHERE order_id = $1 ORDER BY ticket_number",
      [orderId],
    );
    return result.rows.map((row) => row.data);
  }

  static async getTicket(ticketNumber: string): Promise<DigitalTicketRecord | undefined> {
    const result = await getSharedPool().query<{ data: DigitalTicketRecord }>(
      "SELECT data FROM public.manual_ticket_records WHERE ticket_number = $1",
      [ticketNumber],
    );
    return result.rows[0]?.data;
  }

  static async getTickets(): Promise<DigitalTicketRecord[]> {
    const result = await getSharedPool().query<{ data: DigitalTicketRecord }>(
      "SELECT data FROM public.manual_ticket_records ORDER BY created_at DESC",
    );
    return result.rows.map((row) => row.data);
  }

  static async getTicketsForBuyerEmail(email: string): Promise<DigitalTicketRecord[]> {
    const result = await getSharedPool().query<{ data: DigitalTicketRecord }>(
      `SELECT data FROM public.manual_ticket_records
       WHERE LOWER(COALESCE(data->>'buyerEmail', data->>'attendeeEmail', '')) = $1
       ORDER BY created_at DESC`,
      [email.trim().toLowerCase()],
    );
    return result.rows.map((row) => row.data);
  }

  static async updateTicket(ticket: DigitalTicketRecord): Promise<void> {
    const result = await getSharedPool().query(
      `UPDATE public.manual_ticket_records SET status = $2, data = $3::jsonb, updated_at = NOW()
       WHERE ticket_number = $1`,
      [ticket.ticketNumber, ticket.status, JSON.stringify(ticket)],
    );
    if (result.rowCount !== 1) throw new Error("Ticket record was not found in shared storage.");
  }

  static async markTicketUsed(
    ticketNumber: string,
    scannedBy: string,
    usedAt: string,
  ): Promise<DigitalTicketRecord | undefined> {
    const data = await getSharedPool().query<{ data: DigitalTicketRecord }>(
      `UPDATE public.manual_ticket_records
       SET status = 'used',
           data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"used"'),
             '{usedAt}', to_jsonb($3::text)), '{scannedBy}', to_jsonb($2::text)),
           updated_at = NOW()
       WHERE ticket_number = $1 AND status = 'valid'
       RETURNING data`,
      [ticketNumber, scannedBy, usedAt],
    );
    return data.rows[0]?.data;
  }

  static async recordIssuanceKey(transaction: PaymentTransactionRecord): Promise<void> {
    await getSharedPool().query(
      `INSERT INTO public.manual_ticket_issuance_keys
        (idempotency_key, order_id, status, data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (idempotency_key) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data
       WHERE manual_ticket_issuance_keys.order_id = EXCLUDED.order_id`,
      [
        transaction.idempotencyKey,
        transaction.orderId,
        transaction.status,
        JSON.stringify(transaction),
      ],
    );
    const result = await getSharedPool().query<{ order_id: string }>(
      "SELECT order_id FROM public.manual_ticket_issuance_keys WHERE idempotency_key = $1",
      [transaction.idempotencyKey],
    );
    if (result.rows[0]?.order_id !== transaction.orderId) {
      throw new Error("Idempotency key belongs to a different order.");
    }
  }

  static async getIssuanceKey(key: string): Promise<PaymentTransactionRecord | undefined> {
    const result = await getSharedPool().query<{ data: PaymentTransactionRecord }>(
      "SELECT data FROM public.manual_ticket_issuance_keys WHERE idempotency_key = $1",
      [key],
    );
    return result.rows[0]?.data;
  }
}
