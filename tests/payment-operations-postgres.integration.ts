import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, test } from "bun:test";
import pg from "pg";

const testDatabaseUrl = process.env["TEST_DATABASE_URL"];
const testFn = testDatabaseUrl ? test : test.skip;
const orderIds: string[] = [];
const receiptIds: string[] = [];
let pool: pg.Pool | undefined;
let appPool: pg.Pool | undefined;
let receiptReference: string;
let settlementReference: string;
let notificationId: string;
let environmentBeforeTest: string | undefined;
let sslEnvironmentBeforeTest: string | undefined;
let paymentStore: typeof import("../src/server/payment-operations-store.ts").PaymentOperationsStore;
let notificationOutbox: typeof import("../src/server/notification-outbox.ts").NotificationOutbox;

beforeAll(async () => {
  if (!testDatabaseUrl) return;
  pool = new pg.Pool({
    connectionString: testDatabaseUrl,
    ssl: process.env["TEST_DATABASE_SSL"] === "true",
  });
  const { rows } = await pool.query("SELECT current_database() AS name");
  assert.match(
    rows[0].name,
    /(^|[_-])test($|[_-])/i,
    "TEST_DATABASE_URL must point to a dedicated test database",
  );

  environmentBeforeTest = process.env["DATABASE_URL"];
  sslEnvironmentBeforeTest = process.env["SQL_SSL"];
  process.env["DATABASE_URL"] = testDatabaseUrl;
  process.env["SQL_SSL"] = "false";
  const baseMigration = await readFile(
    new URL(
      "../supabase/migrations/20260930000001_shared_manual_ticket_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const paymentMigration = await readFile(
    new URL("../supabase/migrations/20261101000001_p1_payment_operations.sql", import.meta.url),
    "utf8",
  );
  await pool.query(baseMigration);
  await pool.query(paymentMigration);

  ({ PaymentOperationsStore: paymentStore } =
    await import("../src/server/payment-operations-store.ts"));
  ({ NotificationOutbox: notificationOutbox } =
    await import("../src/server/notification-outbox.ts"));
  const { getSharedPool } = await import("../src/db/index.ts");
  appPool = getSharedPool();
});

afterAll(async () => {
  if (pool) {
    const auditTargetIds = [...receiptIds, ...orderIds];
    if (auditTargetIds.length > 0) {
      await pool.query(
        "DELETE FROM public.manual_payment_audit_events WHERE target_id = ANY($1::text[])",
        [auditTargetIds],
      );
    }
    for (const id of orderIds) {
      await pool.query("DELETE FROM public.manual_payment_receipt_reviews WHERE order_id = $1", [
        id,
      ]);
      await pool.query("DELETE FROM public.manual_payment_receipts WHERE order_id = $1", [id]);
      await pool.query("DELETE FROM public.manual_ticket_orders WHERE id = $1", [id]);
    }
    if (settlementReference) {
      await pool.query(
        "DELETE FROM public.manual_payment_settlements WHERE settlement_reference = $1",
        [settlementReference],
      );
    }
    if (notificationId) {
      await pool.query("DELETE FROM public.notification_outbox WHERE id = $1", [notificationId]);
    }
  }
  if (appPool) await appPool.end();
  if (pool) await pool.end();
  if (environmentBeforeTest === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = environmentBeforeTest;
  if (sslEnvironmentBeforeTest === undefined) delete process.env["SQL_SSL"];
  else process.env["SQL_SSL"] = sslEnvironmentBeforeTest;
});

testFn(
  "persists receipt decisions, settlements, audit, and idempotent notification state",
  async () => {
    assert.ok(pool && paymentStore && notificationOutbox);
    const crypto = await import("node:crypto");
    const now = new Date().toISOString();
    receiptReference = `R${crypto.randomUUID().replaceAll("-", "").slice(0, 19).toUpperCase()}`;
    settlementReference = `S${crypto.randomUUID().replaceAll("-", "").slice(0, 19).toUpperCase()}`;
    notificationId = crypto.randomUUID();

    const createPendingOrder = async (submittedReference: string) => {
      const id = `p1-test-${crypto.randomUUID()}`;
      const orderNumber = `P1-${crypto.randomUUID()}`;
      orderIds.push(id);
      const data = {
        id,
        orderNumber,
        checkoutToken: `token-${id}`,
        eventId: "test-event",
        ticketTypeId: "test-tier",
        ticketName: "Test Tier",
        admitsCount: 1,
        quantity: 1,
        unitPriceKes: 1000,
        discountKes: 0,
        subtotalKes: 1000,
        totalKes: 1000,
        currency: "KES",
        buyerName: "Integration Test",
        buyerPhone: "254712345678",
        buyerEmail: "test@example.invalid",
        status: "pending_approval",
        mpesaCode: submittedReference,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      await pool!.query(
        `INSERT INTO public.manual_ticket_orders
        (id, order_number, ticket_type_id, quantity, status, expires_at, mpesa_code, data)
       VALUES ($1, $2, 'test-tier', 1, 'pending_approval', NOW() + INTERVAL '1 day', $3, $4::jsonb)`,
        [id, orderNumber, submittedReference, JSON.stringify(data)],
      );
      return { id, orderNumber };
    };

    const first = await createPendingOrder("BUYERCLAIM01");
    const accepted = await paymentStore.verifyAndApproveOrder({
      orderId: first.id,
      receiptReference,
      receivedAmountKes: 1000,
      receivedAt: now,
      recordedBy: "integration-test-admin",
      evidenceNote: "Compared against test merchant statement",
    });
    assert.equal(accepted.status, "approved");
    if (accepted.status !== "approved") throw new Error("Receipt approval was not persisted.");
    receiptIds.push(accepted.receipt.id);
    assert.equal(accepted.order.status, "approved");

    const duplicateOrder = await createPendingOrder("BUYERCLAIM02");
    const duplicate = await paymentStore.verifyAndApproveOrder({
      orderId: duplicateOrder.id,
      receiptReference,
      receivedAmountKes: 1000,
      receivedAt: now,
      recordedBy: "integration-test-admin",
      evidenceNote: "Duplicate receipt reference from test statement",
    });
    assert.equal(duplicate.status, "duplicate_reference");

    const mismatchOrder = await createPendingOrder("BUYERCLAIM03");
    const mismatch = await paymentStore.verifyAndApproveOrder({
      orderId: mismatchOrder.id,
      receiptReference: `M${crypto.randomUUID().replaceAll("-", "").slice(0, 19).toUpperCase()}`,
      receivedAmountKes: 900,
      receivedAt: now,
      recordedBy: "integration-test-admin",
      evidenceNote: "Test statement amount mismatch",
    });
    assert.equal(mismatch.status, "amount_mismatch");
    const pending = await pool.query(
      "SELECT status FROM public.manual_ticket_orders WHERE id = $1",
      [mismatchOrder.id],
    );
    assert.equal(pending.rows[0].status, "pending_approval");

    const settlement = await paymentStore.recordSettlement({
      settlementReference,
      amountKes: 1000,
      settledAt: now,
      recordedBy: "integration-test-admin",
      evidenceNote: "Test settlement statement",
    });
    assert.equal(settlement.duplicate, false);
    const duplicateSettlement = await paymentStore.recordSettlement({
      settlementReference,
      amountKes: 1000,
      settledAt: now,
      recordedBy: "integration-test-admin",
      evidenceNote: "Duplicate test settlement",
    });
    assert.equal(duplicateSettlement.duplicate, true);

    const task = {
      channel: "email" as const,
      type: "recovery" as const,
      recipient: "test@example.invalid",
      payload: {
        to: "test@example.invalid",
        recoveryUrl: "https://example.invalid/recover",
        ticketsCount: 1,
      },
    };
    notificationId = await notificationOutbox.enqueue(task, `test-recovery:${first.id}`);
    const duplicateNotificationId = await notificationOutbox.enqueue(
      task,
      `test-recovery:${first.id}`,
    );
    assert.equal(duplicateNotificationId, notificationId);
    const persistedNotification = await notificationOutbox.get(notificationId);
    assert.equal(persistedNotification?.status, "queued");

    const persisted = await pool.query(
      `SELECT
       (SELECT COUNT(*) FROM public.manual_payment_receipts WHERE receipt_reference = $1) AS receipts,
       (SELECT COUNT(*) FROM public.manual_payment_receipt_reviews WHERE order_id = $2 AND status = 'duplicate_reference') AS duplicate_reviews,
       (SELECT COUNT(*) FROM public.manual_payment_receipt_reviews WHERE order_id = $3 AND status = 'amount_mismatch') AS mismatch_reviews,
       (SELECT COUNT(*) FROM public.manual_payment_settlements WHERE settlement_reference = $4) AS settlements,
       (SELECT COUNT(*) FROM public.manual_payment_audit_events WHERE target_id = $5) AS receipt_audit`,
      [
        receiptReference,
        duplicateOrder.id,
        mismatchOrder.id,
        settlementReference,
        accepted.receipt.id,
      ],
    );
    assert.equal(Number(persisted.rows[0].receipts), 1);
    assert.equal(Number(persisted.rows[0].duplicate_reviews), 1);
    assert.equal(Number(persisted.rows[0].mismatch_reviews), 1);
    assert.equal(Number(persisted.rows[0].settlements), 1);
    assert.equal(Number(persisted.rows[0].receipt_audit), 1);
  },
);
