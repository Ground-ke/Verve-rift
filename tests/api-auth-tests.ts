import {
  createApiAuthorizer,
  readBearerToken,
  requiredApiRoles,
  resolveSupabaseUserId,
} from "../src/server/api-auth";

function assert(condition: boolean, name: string) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function run() {
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

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
