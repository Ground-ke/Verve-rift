import {
  createApiAuthorizer,
  readBearerToken,
  requiredApiRoles,
  resolveSupabaseUserId,
} from "../src/server/api-auth";
import { handleApiRequest } from "../src/server/api-router";
import { RefundService } from "../src/server/refund-service";
import { sendRecoveryEmail } from "../src/lib/email.server";
import { WhatsAppNotificationService } from "../src/server/whatsapp-service";
import { notificationRetryDelaySeconds } from "../src/server/notification-outbox";

function assert(condition: boolean, name: string) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function run() {
  const readinessVariables = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "SQL_HOST",
    "SQL_USER",
    "SQL_DB_NAME",
    "SQL_PASSWORD",
    "SQL_PORT",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_MPESA_PAYBILL",
    "VITE_MPESA_ACCOUNT",
    "VITE_MPESA_ACCOUNT_NAME",
  ];
  const savedReadinessEnvironment = new Map(
    readinessVariables.map((key) => [key, process.env[key]] as const),
  );
  try {
    readinessVariables.forEach((key) => delete process.env[key]);

    const healthResponse = await handleApiRequest(new Request("https://example.test/api/health"));
    const health = (await healthResponse.json()) as { status: string; ready: boolean };
    assert(
      health.status === "degraded" && !health.ready,
      "Report production readiness as degraded while critical services are unconfigured",
    );

    const createOrderRequest = () =>
      new Request("https://example.test/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_type_id: "revenant",
          quantity: 1,
          buyer_name: "Test Buyer",
          buyer_phone: "254712345678",
        }),
      });
    const createOrderResponse = await handleApiRequest(createOrderRequest());
    const createOrder = (await createOrderResponse.json()) as { code?: string };
    assert(
      createOrderResponse.status === 503 && createOrder.code === "PAYMENT_NOT_CONFIGURED",
      "Reject order creation server-side until verified M-Pesa instructions are configured",
    );

    process.env["VITE_MPESA_PAYBILL"] = "test-paybill";
    process.env["VITE_MPESA_ACCOUNT"] = "test-account";
    process.env["VITE_MPESA_ACCOUNT_NAME"] = "Test merchant";
    const storageResponse = await handleApiRequest(createOrderRequest());
    const storageError = (await storageResponse.json()) as { code?: string };
    assert(
      storageResponse.status === 503 && storageError.code === "STORAGE_UNAVAILABLE",
      "Reject checkout when payment instructions exist but shared storage is unavailable",
    );

    process.env["DATABASE_URL"] = "postgres://unreachable.example/test";
    const staffAuthResponse = await handleApiRequest(createOrderRequest());
    const staffAuthError = (await staffAuthResponse.json()) as { code?: string };
    assert(
      staffAuthResponse.status === 503 && staffAuthError.code === "STAFF_AUTH_UNAVAILABLE",
      "Reject checkout when organizers cannot authenticate and review payments",
    );
  } finally {
    for (const [key, value] of savedReadinessEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert(
    resolveSupabaseUserId(null, { status: 400 }) === null,
    "Map malformed-token auth rejection to 401",
  );
  assert(
    resolveSupabaseUserId(null, { status: 401 }) === null,
    "Map expired-token auth rejection to 401",
  );
  let transportErrorPropagated = false;
  try {
    resolveSupabaseUserId(null, { status: 503 });
  } catch {
    transportErrorPropagated = true;
  }
  assert(transportErrorPropagated, "Keep Supabase transport failures fail-closed as 503");

  assert(
    requiredApiRoles("/api/admin/ticket-tiers")?.includes("admin") === true,
    "Protect admin reads and mutations",
  );
  assert(
    requiredApiRoles("/api/notifications/reminder-24h")?.includes("admin") === true,
    "Protect administrative notification endpoints",
  );
  assert(
    requiredApiRoles("/api/admin/notifications/outbox")?.includes("admin") === true &&
      requiredApiRoles("/api/admin/notifications/outbox/process")?.includes("admin") === true,
    "Protect notification outbox reads and retry processing with admin authorization",
  );
  assert(
    requiredApiRoles("/api/admin/refunds/process")?.includes("admin") === true,
    "Keep the disabled refund endpoint restricted to admins",
  );
  assert(
    notificationRetryDelaySeconds(1) === 30 &&
      notificationRetryDelaySeconds(2) === 60 &&
      notificationRetryDelaySeconds(5) === 480,
    "Apply bounded exponential notification retry backoff",
  );
  const databaseEnvironment = new Map(
    [
      "DATABASE_URL",
      "POSTGRES_URL",
      "SQL_HOST",
      "SQL_USER",
      "SQL_DB_NAME",
      "SQL_PASSWORD",
      "SQL_PORT",
    ].map((key) => [key, process.env[key]] as const),
  );
  let reconciliationFailedClosed = false;
  try {
    for (const key of databaseEnvironment.keys()) delete process.env[key];
    await RefundService.getReconciliationData();
  } catch (error) {
    reconciliationFailedClosed =
      error instanceof Error &&
      error.message.includes("Shared PostgreSQL persistence is not configured");
  } finally {
    for (const [key, value] of databaseEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert(
    reconciliationFailedClosed,
    "Fail closed instead of synthesizing reconciliation records without configured persistence",
  );
  const refundResult = await RefundService.processRefund({
    orderId: "unverified-order",
    amountKes: 1000,
    reason: "test",
    refundType: "full",
    reversalReference: "REVTEST123",
    externalReversalProcessedAt: new Date().toISOString(),
    confirmedExternalReversal: true,
    processedBy: "test-admin",
  });
  assert(
    !refundResult.success && refundResult.code === "REVERSAL_VERIFICATION_UNAVAILABLE",
    "Keep refund recording disabled without independent external reversal verification",
  );
  const savedSmtpEnvironment = new Map(
    ["SMTP_PASS", "GMAIL_APP_PASSWORD"].map((key) => [key, process.env[key]] as const),
  );
  try {
    for (const key of savedSmtpEnvironment.keys()) delete process.env[key];
    const recoveryEmail = await sendRecoveryEmail({
      to: "test@example.invalid",
      name: "Test",
      links: [],
    });
    assert(
      !recoveryEmail.success && recoveryEmail.simulated === false,
      "Do not simulate ticket recovery email success without SMTP credentials",
    );
  } finally {
    for (const [key, value] of savedSmtpEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const savedWhatsAppEnvironment = new Map(
    ["WHATSAPP_API_KEY", "TWILIO_AUTH_TOKEN", "WHATSAPP_API_URL"].map(
      (key) => [key, process.env[key]] as const,
    ),
  );
  try {
    for (const key of savedWhatsAppEnvironment.keys()) delete process.env[key];
    const notification = await WhatsAppNotificationService.sendNotification({
      recipientPhone: "254712345678",
      template: "gate_alert",
      params: { customerName: "Test", ticketCode: "TEST-123" },
    });
    assert(
      !notification.success && notification.status === "failed",
      "Do not report an undelivered WhatsApp message as successful",
    );
  } finally {
    for (const [key, value] of savedWhatsAppEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert(
    requiredApiRoles("/api/tickets/validate")?.includes("scanner") === true,
    "Protect scanner validation endpoints",
  );
  assert(
    requiredApiRoles("/api/tickets/stats")?.includes("scanner") === true,
    "Protect scanner statistics endpoint",
  );
  assert(requiredApiRoles("/api/orders/create") === null, "Keep public checkout available");
  assert(
    requiredApiRoles("/api/orders/order-1") === null,
    "Keep public order status flow available",
  );

  assert(
    readBearerToken(
      new Request("https://example.test/api/user/tickets", {
        headers: { "X-User-Email": "attendee@example.com" },
      }),
    ) === null,
    "Do not allow an email header alone to authenticate ticket access",
  );

  const authorizedRequest = (authorization?: string) =>
    new Request("https://example.test/api/admin/overview", {
      headers: authorization ? { authorization } : undefined,
    });

  const authorizer = createApiAuthorizer({
    verifyAccessToken: async (token) => (token === "valid-token" ? "user-1" : null),
    lookupRoles: async (userId) => (userId === "user-1" ? ["admin"] : []),
  });

  const unauthenticated = await authorizer(authorizedRequest(), ["admin"]);
  assert(
    !unauthenticated.success && unauthenticated.status === 401,
    "Reject unauthenticated request",
  );

  const customerAuthorizer = createApiAuthorizer({
    verifyAccessToken: async () => "customer-1",
    lookupRoles: async () => ["customer"],
  });
  const customer = await customerAuthorizer(authorizedRequest("Bearer valid-token"), ["admin"]);
  assert(!customer.success && customer.status === 403, "Reject customer role on admin endpoint");

  const staff = await authorizer(authorizedRequest("Bearer valid-token"), ["admin"]);
  assert(staff.success && staff.identity.userId === "user-1", "Allow verified admin staff");

  const scannerAuthorizer = createApiAuthorizer({
    verifyAccessToken: async () => "scanner-1",
    lookupRoles: async () => ["scanner"],
  });
  const scanner = await scannerAuthorizer(authorizedRequest("Bearer valid-token"), [
    "admin",
    "scanner",
  ]);
  assert(
    scanner.success && scanner.identity.role === "scanner",
    "Allow scanner on scanner endpoint",
  );

  const unavailable = await createApiAuthorizer(null)(authorizedRequest("Bearer valid-token"), [
    "admin",
  ]);
  assert(
    !unavailable.success && unavailable.status === 503,
    "Deny when auth config is unavailable",
  );

  const roleLookupFailure = createApiAuthorizer({
    verifyAccessToken: async () => "staff-1",
    lookupRoles: async () => {
      throw new Error("database unavailable");
    },
  });
  const failedLookup = await roleLookupFailure(authorizedRequest("Bearer valid-token"), ["admin"]);
  assert(!failedLookup.success && failedLookup.status === 503, "Deny when role lookup fails");
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const processGlobal = globalThis as typeof globalThis & {
      _postgresPool?: import("pg").Pool;
    };
    await processGlobal._postgresPool?.end();
    process.exit(process.exitCode ?? 0);
  });
