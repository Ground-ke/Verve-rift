import { OrderService, RESERVATION_TTL_MS } from "../src/server/order-service";
import { validateAndNormalizeKenyanPhone } from "../src/lib/validation/phone";

async function runTests() {
  console.log("====================================================");
  console.log("GATE 3 — ORDER ENGINE & INVENTORY RESERVATION TESTS");
  console.log("====================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // 1. Phone Normalization Tests
  // -------------------------------------------------------------
  console.log("\n--- 1. Kenyan Phone Number Validation & Normalization ---");

  const p1 = validateAndNormalizeKenyanPhone("0712345678");
  assert(
    p1.isValid && p1.normalized === "254712345678" && p1.operator === "Safaricom",
    "Normalize 0712345678 (Safaricom)",
  );

  const p2 = validateAndNormalizeKenyanPhone("0110123456");
  assert(
    p2.isValid && p2.normalized === "254110123456" && p2.operator === "Safaricom",
    "Normalize 0110123456 (Safaricom 011X)",
  );

  const p3 = validateAndNormalizeKenyanPhone("+254 733 123 456");
  assert(
    p3.isValid && p3.normalized === "254733123456" && p3.operator === "Airtel",
    "Normalize +254 733 123 456 (Airtel)",
  );

  const p4 = validateAndNormalizeKenyanPhone("254770123456");
  assert(
    p4.isValid && p4.normalized === "254770123456" && p4.operator === "Telkom",
    "Normalize 254770123456 (Telkom)",
  );

  const p5 = validateAndNormalizeKenyanPhone("0201234567");
  assert(!p5.isValid, "Reject invalid landline prefix 0201234567");

  const p6 = validateAndNormalizeKenyanPhone("12345");
  assert(!p6.isValid, "Reject short invalid phone number");

  // -------------------------------------------------------------
  // 2. Quantity & Validation Tests
  // -------------------------------------------------------------
  console.log("\n--- 2. Quantity & Buyer Input Validation ---");

  const q0 = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 0,
    buyerName: "Amani Mwangi",
    buyerPhone: "0712345678",
    clientIp: "127.0.0.1",
  });
  assert(!q0.success && q0.code === "INVALID_INPUT", "Reject zero quantity");

  const qNeg = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: -2,
    buyerName: "Amani Mwangi",
    buyerPhone: "0712345678",
    clientIp: "127.0.0.1",
  });
  assert(!qNeg.success && qNeg.code === "INVALID_INPUT", "Reject negative quantity");

  const qLimit = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 100, // Exceeds technical request safety ceiling (50)
    buyerName: "Amani Mwangi",
    buyerPhone: "0712345678",
    clientIp: "127.0.0.1",
  });
  assert(
    !qLimit.success && qLimit.code === "SAFETY_LIMIT_EXCEEDED",
    "Enforce technical safety ceiling (rejects quantity > 50)",
  );

  const emptyName = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 1,
    buyerName: "",
    buyerPhone: "0712345678",
    clientIp: "127.0.0.1",
  });
  assert(!emptyName.success && emptyName.code === "INVALID_INPUT", "Reject empty buyer name");

  // -------------------------------------------------------------
  // 3. Server Authoritative Pricing Tests
  // -------------------------------------------------------------
  console.log("\n--- 3. Server Authoritative Pricing & Snapshots ---");

  const order1 = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 2,
    buyerName: "Wanjiku Kamau",
    buyerPhone: "0722112233",
    clientIp: "127.0.0.1",
  });
  assert(
    order1.success &&
      order1.unitPriceKes === 1000 &&
      order1.subtotalKes === 2000 &&
      order1.totalKes === 2000 &&
      order1.admitsCount === 1,
    "Authoritative Early Bird calculation: KES 1,000 * 2 = KES 2,000",
  );

  const order2 = await OrderService.createOrder({
    ticketTypeId: "couple-pass",
    quantity: 1,
    buyerName: "Kipchoge Keino",
    buyerPhone: "0740998877",
    clientIp: "127.0.0.1",
  });
  assert(
    order2.success &&
      order2.unitPriceKes === 1800 &&
      order2.totalKes === 1800 &&
      order2.admitsCount === 2,
    "Authoritative Couple Pass calculation: KES 1,800 (admits 2)",
  );

  const order3 = await OrderService.createOrder({
    ticketTypeId: "group-of-four",
    quantity: 1,
    buyerName: "Mercy Cherono",
    buyerPhone: "0711554433",
    clientIp: "127.0.0.1",
  });
  assert(
    order3.success &&
      order3.unitPriceKes === 3200 &&
      order3.totalKes === 3200 &&
      order3.admitsCount === 4,
    "Authoritative Group of Four calculation: KES 3,200 (admits 4)",
  );

  // -------------------------------------------------------------
  // 4. Duplicate Request / Idempotency Tests
  // -------------------------------------------------------------
  console.log("\n--- 4. Duplicate Request Protection & Idempotency ---");

  const idempKey = "test_idemp_key_12345";
  const firstReq = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 1,
    buyerName: "Otieno Odhiambo",
    buyerPhone: "0712345678",
    idempotencyKey: idempKey,
    clientIp: "127.0.0.1",
  });

  const secondReq = await OrderService.createOrder({
    ticketTypeId: "early-bird",
    quantity: 1,
    buyerName: "Otieno Odhiambo",
    buyerPhone: "0712345678",
    idempotencyKey: idempKey,
    clientIp: "127.0.0.1",
  });

  assert(
    firstReq.success &&
      secondReq.success &&
      firstReq.orderId === secondReq.orderId &&
      firstReq.orderNumber === secondReq.orderNumber,
    "Idempotent duplicate request returns existing order without creating secondary reservation",
  );

  // -------------------------------------------------------------
  // 5. Authorization & Session Token Isolation
  // -------------------------------------------------------------
  console.log("\n--- 5. Order Lookup Authorization & Snooping Protection ---");

  if (firstReq.success) {
    const validLookup = OrderService.getOrder(firstReq.orderId, firstReq.checkoutToken);
    assert(
      validLookup !== null && validLookup.orderNumber === firstReq.orderNumber,
      "Valid checkout token successfully retrieves order details",
    );

    const invalidLookup = OrderService.getOrder(firstReq.orderId, "fake_attacker_token_xyz");
    assert(
      invalidLookup === null,
      "Invalid / stolen checkout token is rejected (401 Unauthorized)",
    );
  }

  // -------------------------------------------------------------
  // 6. Reservation Cancellation & Release
  // -------------------------------------------------------------
  console.log("\n--- 6. Reservation Cancellation ---");

  if (order1.success) {
    const cancelled = OrderService.cancelOrder(order1.orderId, order1.checkoutToken);
    assert(cancelled, "Order cancellation succeeds with valid token");

    const lookupAfterCancel = OrderService.getOrder(order1.orderId, order1.checkoutToken);
    assert(
      lookupAfterCancel !== null && lookupAfterCancel.status === "cancelled",
      "Cancelled order transitions status to cancelled",
    );
  }

  console.log("\n====================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
