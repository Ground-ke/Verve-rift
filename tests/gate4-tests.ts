import { getSharedPool } from "../src/db/index";
import { OrderService } from "../src/server/order-service";
import { TicketsServerService } from "../src/server/tickets.server";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName}`);
  }
}

async function runPersistenceGateTests() {
  const databaseVariables = ["DATABASE_URL", "POSTGRES_URL", "SQL_HOST", "SQL_USER", "SQL_DB_NAME"];
  const savedEnvironment = new Map(
    databaseVariables.map((key) => [key, process.env[key]] as const),
  );

  for (const key of databaseVariables) delete process.env[key];

  try {
    console.log("\n===============================================");
    console.log("   SHARED ORDER / TICKET PERSISTENCE GATE TESTS");
    console.log("===============================================\n");

    let databaseRejected = false;
    try {
      getSharedPool();
    } catch {
      databaseRejected = true;
    }
    assert(databaseRejected, "Shared persistence refuses to provide an unconfigured mock database");

    const order = await OrderService.createOrder({
      ticketTypeId: "early-bird",
      quantity: 1,
      buyerName: "Test Buyer",
      buyerPhone: "0712345678",
    });
    assert(
      !order.success && order.code === "SERVER_ERROR",
      "Checkout fails closed when shared order storage is unavailable",
    );

    let approvalRejected = false;
    try {
      await OrderService.approveOrder({
        orderId: "unavailable-order",
        adminEmail: "organizer@example.com",
      });
    } catch {
      approvalRejected = true;
    }
    assert(approvalRejected, "Organizer approval does not succeed without shared database access");

    const issuance = await TicketsServerService.verifyPayment({
      idempotencyKey: "unavailable-order:ticket-issue",
      orderId: "unavailable-order",
      token: "invalid-checkout-token",
    });
    assert(
      !issuance.success && issuance.code === "STORAGE_UNAVAILABLE",
      "Ticket issuance is blocked when a durable order cannot be read",
    );

    console.log(`\nPERSISTENCE GATE RESULTS: ${passed} Passed, ${failed} Failed\n`);
  } finally {
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  if (failed > 0) process.exit(1);
}

runPersistenceGateTests().catch((error) => {
  console.error("Persistence gate test execution failed:", error);
  process.exit(1);
});
