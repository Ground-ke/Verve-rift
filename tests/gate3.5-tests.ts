import {
  OrderService,
  MAX_REQUEST_QUANTITY_CEILING,
  RESERVATION_TTL_MS,
} from "../src/server/order-service";
import { handleApiRequest } from "../src/server/api-router";

async function runGate35Tests() {
  console.log("==========================================================");
  console.log("GATE 3.5 — PRE-M-PESA COMMERCE HARDENING VERIFICATION TESTS");
  console.log("==========================================================\n");

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

  // Reset in-memory test stores
  OrderService._resetStoresForTesting();

  // -------------------------------------------------------------
  // 1. Remove Invented Purchase Limit & Distinguish Safety Ceiling
  // -------------------------------------------------------------
  console.log("\n--- 1. Purchase Limit Business vs Technical Safety Ceiling ---");

  const earlyBird = OrderService.getTicketType("revenant");
  const couplePass = OrderService.getTicketType("soulbound");
  const groupOfFour = OrderService.getTicketType("coven");

  assert(
    earlyBird !== null && earlyBird.purchaseLimit === null,
    "Revenant purchaseLimit is NULL (unconstrained business limit)",
  );
  assert(
    couplePass !== null && couplePass.purchaseLimit === null,
    "Soulbound purchaseLimit is NULL (unconstrained business limit)",
  );
  assert(
    groupOfFour !== null && groupOfFour.purchaseLimit === null,
    "Coven purchaseLimit is NULL (unconstrained business limit)",
  );

  // Purchasing 15 tickets (which would have failed under previous "max 10") now succeeds
  const unconstrainedOrder = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 15,
    buyerName: "Ochieng Otieno",
    buyerPhone: "0712345678",
    clientIp: "10.0.0.1",
  });
  assert(
    unconstrainedOrder.success && unconstrainedOrder.quantity === 15,
    "Orders > 10 succeed because invented business limit of 10 was removed",
  );

  // Technical request safety ceiling enforcement (anti-overflow/anti-spam)
  const safetyExceeded = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: MAX_REQUEST_QUANTITY_CEILING + 1,
    buyerName: "Spam Bot",
    buyerPhone: "0712345678",
    clientIp: "10.0.0.1",
  });
  assert(
    !safetyExceeded.success && safetyExceeded.code === "SAFETY_LIMIT_EXCEEDED",
    `Technical request safety ceiling enforced (rejects quantity > ${MAX_REQUEST_QUANTITY_CEILING})`,
  );

  // -------------------------------------------------------------
  // 2. Server-Authoritative Reservation Expiration
  // -------------------------------------------------------------
  console.log("\n--- 2. Server-Authoritative Reservation Expiration ---");

  OrderService._resetStoresForTesting();
  const expTestOrder = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 2,
    buyerName: "Chebet Kiprop",
    buyerPhone: "0722112233",
    clientIp: "10.0.0.2",
  });
  assert(expTestOrder.success, "Create order for expiration testing");

  if (expTestOrder.success) {
    // Check order while active
    const activeLookup = OrderService.getOrder(expTestOrder.orderId, expTestOrder.checkoutToken);
    assert(
      activeLookup !== null && !activeLookup.isExpired && activeLookup.status === "pending",
      "Active order has isExpired: false and status: pending",
    );

    // Simulate clock advancing beyond 10-minute expiration
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + RESERVATION_TTL_MS + 5000;

      const expiredLookup = OrderService.getOrder(expTestOrder.orderId, expTestOrder.checkoutToken);
      assert(
        expiredLookup !== null && expiredLookup.isExpired && expiredLookup.status === "cancelled",
        "Server strictly marks order as expired/cancelled when server timestamp passes expires_at",
      );

      // Attempting to cancel an expired order is rejected
      const cancelExpired = OrderService.cancelOrder(
        expTestOrder.orderId,
        expTestOrder.checkoutToken,
      );
      assert(
        !cancelExpired.success && cancelExpired.code === "ORDER_EXPIRED",
        "Server rejects cancel or operation on already expired order (ORDER_EXPIRED)",
      );
    } finally {
      Date.now = originalNow;
    }
  }

  // -------------------------------------------------------------
  // 3. Inventory Release on Expiration
  // -------------------------------------------------------------
  console.log("\n--- 3. Inventory Release & Re-availability ---");

  OrderService._resetStoresForTesting();
  OrderService._setTotalInventoryForTesting("revenant", 5);

  const res1 = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 3,
    buyerName: "Wanjiku Njoroge",
    buyerPhone: "0711223344",
    clientIp: "10.0.0.3",
  });
  assert(res1.success, "Reserved 3 of 5 tickets");

  const reservedNow = OrderService.getActiveReservedCount(earlyBird!.id);
  assert(reservedNow === 3, "Active reserved count is 3");

  // Attempting to reserve 3 more tickets fails because 3 + 3 = 6 > 5
  const resOver = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 3,
    buyerName: "Muthoni Kariuki",
    buyerPhone: "0722334455",
    clientIp: "10.0.0.4",
  });
  assert(
    !resOver.success && resOver.code === "INSUFFICIENT_INVENTORY",
    "Cannot over-reserve inventory when 3 of 5 are held",
  );

  // Advance time past expiration
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + RESERVATION_TTL_MS + 2000;

    const reservedAfterExp = OrderService.getActiveReservedCount(earlyBird!.id);
    assert(
      reservedAfterExp === 0,
      "Expired reservation automatically evicted; active reserved count returns to 0",
    );

    // Now reserving all 5 tickets succeeds
    const resAll = await OrderService.createOrder({
      ticketTypeId: "revenant",
      quantity: 5,
      buyerName: "Muthoni Kariuki",
      buyerPhone: "0722334455",
      clientIp: "10.0.0.4",
    });
    assert(resAll.success, "Customer can reserve all 5 released tickets after expiration");
  } finally {
    Date.now = originalNow;
    OrderService._setTotalInventoryForTesting("revenant", null);
  }

  // -------------------------------------------------------------
  // 4. Cancel Authorization & Snooping Protection
  // -------------------------------------------------------------
  console.log("\n--- 4. Cancel Authorization & Cross-Customer Protection ---");

  OrderService._resetStoresForTesting();
  const orderA = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 1,
    buyerName: "Customer A",
    buyerPhone: "0711111111",
    clientIp: "10.0.0.5",
  });

  const orderB = await OrderService.createOrder({
    ticketTypeId: "soulbound",
    quantity: 1,
    buyerName: "Customer B",
    buyerPhone: "0722222222",
    clientIp: "10.0.0.6",
  });

  assert(orderA.success && orderB.success, "Created Order A and Order B");

  if (orderA.success && orderB.success) {
    // Customer B attempts to cancel Customer A's order using Customer B's token
    const crossCancel = OrderService.cancelOrder(orderA.orderId, orderB.checkoutToken);
    assert(!crossCancel.success, "Customer B cannot cancel Customer A's order (UNAUTHORIZED)");

    // Invalid token attempt
    const invalidCancel = OrderService.cancelOrder(orderA.orderId, "tok_invalid_random_string_123");
    assert(!invalidCancel.success, "Random invalid token cannot cancel order");

    // Missing token attempt
    const emptyCancel = OrderService.cancelOrder(orderA.orderId, "");
    assert(!emptyCancel.success, "Empty token cannot cancel order");

    // Customer A cancels Order A with valid Token A
    const validCancel = OrderService.cancelOrder(orderA.orderId, orderA.checkoutToken);
    assert(validCancel.success, "Customer A successfully cancels Order A with matching Token A");

    // Customer A attempts to cancel already cancelled order
    const repeatCancel = OrderService.cancelOrder(orderA.orderId, orderA.checkoutToken);
    assert(
      !repeatCancel.success && repeatCancel.code === "ALREADY_CANCELLED",
      "Repeated cancel on already cancelled order returns ALREADY_CANCELLED",
    );
  }

  // -------------------------------------------------------------
  // 5. Order Lookup Isolation
  // -------------------------------------------------------------
  console.log("\n--- 5. Order Lookup Cryptographic Isolation ---");

  if (orderA.success && orderB.success) {
    const lookupAwithB = OrderService.getOrder(orderA.orderId, orderB.checkoutToken);
    assert(lookupAwithB === null, "Token B CANNOT retrieve Order A (isolation guaranteed)");

    const lookupBwithA = OrderService.getOrder(orderB.orderId, orderA.checkoutToken);
    assert(lookupBwithA === null, "Token A CANNOT retrieve Order B (isolation guaranteed)");

    const randomLookup = OrderService.getOrder(orderA.orderId, "tok_attacker_random_token");
    assert(randomLookup === null, "Attacker random token CANNOT retrieve Order A");

    const validLookupA = OrderService.getOrder(orderA.orderId, orderA.checkoutToken);
    assert(validLookupA !== null, "Matching Token A successfully retrieves Order A");
  }

  // -------------------------------------------------------------
  // 6. Idempotency Semantics (Same Request vs Conflicting Request)
  // -------------------------------------------------------------
  console.log("\n--- 6. Idempotency Semantics & Conflict Detection ---");

  OrderService._resetStoresForTesting();
  const testKey = "idemp_test_hardening_key_999";

  // Request 1: 2 Revenant tickets
  const idempReq1 = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 2,
    buyerName: "Kiplagat Ruto",
    buyerPhone: "0712345678",
    idempotencyKey: testKey,
    clientIp: "10.0.0.7",
  });
  assert(idempReq1.success, "Initial request with idempotency key succeeds");

  // Request 2: Identical retry with same idempotency key
  const idempReq2 = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 2,
    buyerName: "Kiplagat Ruto",
    buyerPhone: "0712345678",
    idempotencyKey: testKey,
    clientIp: "10.0.0.7",
  });
  assert(
    idempReq2.success && idempReq1.success && idempReq1.orderId === idempReq2.orderId,
    "Identical retry returns existing order without creating secondary reservation",
  );

  // Request 3: Same key with DIFFERENT payload (Quantity 4 instead of 2)
  const idempConflict = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 4, // CHANGED QUANTITY
    buyerName: "Kiplagat Ruto",
    buyerPhone: "0712345678",
    idempotencyKey: testKey,
    clientIp: "10.0.0.7",
  });
  assert(
    !idempConflict.success && idempConflict.code === "IDEMPOTENCY_CONFLICT",
    "Different request with previously used key is rejected as IDEMPOTENCY_CONFLICT",
  );

  // -------------------------------------------------------------
  // 7. Price Snapshot Persistence
  // -------------------------------------------------------------
  console.log("\n--- 7. Price Snapshot Immutability ---");

  OrderService._resetStoresForTesting();
  const snapshotOrder = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 2,
    buyerName: "Aoko Otieno",
    buyerPhone: "0733123456",
    clientIp: "10.0.0.8",
  });
  assert(
    snapshotOrder.success && snapshotOrder.unitPriceKes === 1500 && snapshotOrder.totalKes === 3000,
    "Order created at initial catalog price: KES 1,500 * 2 = KES 3,000",
  );

  if (snapshotOrder.success) {
    // Modify catalog price for revenant
    OrderService._setCatalogPriceForTesting("revenant", 2000);

    // Retrieve original order
    const retrieved = OrderService.getOrder(snapshotOrder.orderId, snapshotOrder.checkoutToken);
    assert(
      retrieved !== null && retrieved.unitPriceKes === 1500 && retrieved.totalKes === 3000,
      "Order retains snapshotted unit price (KES 1,500) despite catalog price increase to KES 2,000",
    );

    // Restore catalog price
    OrderService._setCatalogPriceForTesting("revenant", 1500);
  }

  // -------------------------------------------------------------
  // 8. Order & Reservation Creation Atomicity
  // -------------------------------------------------------------
  console.log("\n--- 8. Order & Reservation Creation Atomicity ---");

  OrderService._resetStoresForTesting();
  OrderService._setTotalInventoryForTesting("revenant", 1);

  // Try to create order for 2 tickets when only 1 exists
  const failedAtomic = await OrderService.createOrder({
    ticketTypeId: "revenant",
    quantity: 2,
    buyerName: "Atomicity Tester",
    buyerPhone: "0711002233",
    clientIp: "10.0.0.9",
  });
  assert(
    !failedAtomic.success && failedAtomic.code === "INSUFFICIENT_INVENTORY",
    "Atomic creation fails cleanly on insufficient inventory",
  );

  const activeRes = OrderService.getActiveReservedCount(earlyBird!.id);
  assert(activeRes === 0, "No orphaned reservation left behind after failed inventory check");

  OrderService._setTotalInventoryForTesting("revenant", null);

  // -------------------------------------------------------------
  // 9. HTTP API Router Endpoint Status Codes & Security
  // -------------------------------------------------------------
  console.log("\n--- 9. HTTP API Router Endpoint Hardening ---");

  // Create order via API
  const apiCreateReq = new Request("http://localhost:3000/api/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_type_id: "revenant",
      quantity: 1,
      buyer_name: "API Tester",
      buyer_phone: "0712345678",
      idempotency_key: "api_key_001",
    }),
  });
  const apiCreateRes = await handleApiRequest(apiCreateReq);
  assert(apiCreateRes.status === 201, "POST /api/orders/create returns 201 Created");
  const apiCreatedData = (await apiCreateRes.json()) as {
    orderId: string;
    checkoutToken: string;
  };

  // Idempotency conflict via API
  const apiConflictReq = new Request("http://localhost:3000/api/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_type_id: "revenant",
      quantity: 5, // Different quantity with same key
      buyer_name: "API Tester",
      buyer_phone: "0712345678",
      idempotency_key: "api_key_001",
    }),
  });
  const apiConflictRes = await handleApiRequest(apiConflictReq);
  assert(
    apiConflictRes.status === 409,
    "POST /api/orders/create with idempotency conflict returns 409 Conflict",
  );

  // Lookup without token -> 401 Unauthorized
  const noTokenReq = new Request(`http://localhost:3000/api/orders/${apiCreatedData.orderId}`, {
    method: "GET",
  });
  const noTokenRes = await handleApiRequest(noTokenReq);
  assert(noTokenRes.status === 401, "GET /api/orders/:id without token returns 401 Unauthorized");

  // Lookup with invalid token -> 401 Unauthorized
  const badTokenReq = new Request(
    `http://localhost:3000/api/orders/${apiCreatedData.orderId}?token=invalid_tok`,
    { method: "GET" },
  );
  const badTokenRes = await handleApiRequest(badTokenReq);
  assert(
    badTokenRes.status === 401,
    "GET /api/orders/:id with invalid token returns 401 Unauthorized",
  );

  // Lookup with valid Bearer Header -> 200 OK
  const bearerReq = new Request(`http://localhost:3000/api/orders/${apiCreatedData.orderId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiCreatedData.checkoutToken}` },
  });
  const bearerRes = await handleApiRequest(bearerReq);
  assert(
    bearerRes.status === 200,
    "GET /api/orders/:id with Authorization: Bearer <token> returns 200 OK",
  );

  // Cancel with invalid token -> 401 Unauthorized
  const badCancelReq = new Request("http://localhost:3000/api/orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: apiCreatedData.orderId,
      token: "wrong_token_xyz",
    }),
  });
  const badCancelRes = await handleApiRequest(badCancelReq);
  assert(
    badCancelRes.status === 401,
    "POST /api/orders/cancel with invalid token returns 401 Unauthorized",
  );

  // Cancel with valid token -> 200 OK
  const goodCancelReq = new Request("http://localhost:3000/api/orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: apiCreatedData.orderId,
      token: apiCreatedData.checkoutToken,
    }),
  });
  const goodCancelRes = await handleApiRequest(goodCancelReq);
  assert(goodCancelRes.status === 200, "POST /api/orders/cancel with valid token returns 200 OK");

  console.log("\n==========================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runGate35Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
