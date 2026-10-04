import { OrderService } from "./order-service";
import { TicketsServerService } from "./tickets.server";
import { AdminServerService } from "./admin-service";
import { RefundService } from "./refund-service";
import { PaymentOperationsStore } from "./payment-operations-store";
import { NotificationOutbox } from "./notification-outbox";
import { getSiteBaseUrl, isGmailSmtpConfigured } from "./email.server";
import { generateTicketPdfBuffer, generateTicketPassImageBuffer } from "./pdf-ticket";
import { SlidingWindowRateLimiter } from "./rate-limiter";
import {
  validateTicketSchema,
  sendWhatsAppNotificationSchema,
} from "../lib/validation/api-schemas";
import { sanitizeObject } from "../lib/validation/sanitizer";
import { isCloudSqlConfigured } from "../db/index.ts";
import {
  authorizeStaffApiRequest,
  getAuthenticatedApiUser,
  readBearerToken,
  requiredApiRoles,
} from "./api-auth";

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  // Helper for JSON responses with defensive security headers and strict CORS
  const json = (data: unknown, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      },
    });
  };

  // Helper for error responses
  const errorJson = (
    message: string,
    code = "ERROR",
    status = 400,
    extra?: Record<string, unknown>,
  ) => {
    return json({ success: false, code, message, ...(extra || {}) }, status);
  };

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 403 });
  }

  try {
    const requiredRoles = requiredApiRoles(pathname);
    let apiRequestRole: "admin" | "scanner" | null = null;
    let apiRequestUserId: string | null = null;

    if (requiredRoles) {
      const authorization = await authorizeStaffApiRequest(request, requiredRoles);
      if (!authorization.success) {
        return errorJson(
          authorization.message,
          authorization.status === 401
            ? "UNAUTHORIZED"
            : authorization.status === 403
              ? "FORBIDDEN"
              : "AUTH_UNAVAILABLE",
          authorization.status,
        );
      }
      apiRequestRole = authorization.identity.role;
      apiRequestUserId = authorization.identity.userId;
    }

    if (pathname === "/api/user/tickets" && method === "GET") {
      const token = readBearerToken(request);
      if (!token) {
        return errorJson("A valid bearer token is required.", "UNAUTHORIZED", 401);
      }
      try {
        const user = await getAuthenticatedApiUser(token);
        if (!user) {
          return errorJson("The access token is invalid or expired.", "UNAUTHORIZED", 401);
        }
        const tickets = await TicketsServerService.getTicketsForUser(user.email);
        return json({ success: true, count: tickets.length, tickets });
      } catch (error) {
        console.error("Could not retrieve authenticated user's tickets:", error);
        return errorJson("Ticket records are temporarily unavailable.", "SERVICE_UNAVAILABLE", 503);
      }
    }

    // --------------------------------------------------------------------------
    // 1. Health check
    // --------------------------------------------------------------------------
    if (pathname === "/api/health") {
      const cloudSqlConfigured = isCloudSqlConfigured();
      const supabaseConfigured = Boolean(
        process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"],
      );
      const manualMpesaConfigured = Boolean(
        process.env["VITE_MPESA_PAYBILL"] &&
        process.env["VITE_MPESA_ACCOUNT"] &&
        process.env["VITE_MPESA_ACCOUNT_NAME"],
      );
      const ready = cloudSqlConfigured && supabaseConfigured && manualMpesaConfigured;

      return json({
        status: ready ? "ok" : "degraded",
        ready,
        runtime: process.env["VERCEL"] ? "vercel" : "node",
        time: new Date().toISOString(),
        databases: {
          cloudSqlConfigured,
          supabaseConfigured,
          firebaseConfigured: Boolean(
            process.env["FIREBASE_PROJECT_ID"] || process.env["VITE_FIREBASE_PROJECT_ID"],
          ),
        },
        services: {
          manualMpesaConfigured,
          gmailSmtpConfigured: isGmailSmtpConfigured(),
          whatsappConfigured: Boolean(
            process.env["WHATSAPP_API_KEY"] && process.env["WHATSAPP_API_URL"],
          ),
        },
      });
    }

    // --------------------------------------------------------------------------
    // 2. POST /api/orders/create (or /api/orders/reserve)
    // --------------------------------------------------------------------------
    if (
      (pathname === "/api/orders/create" || pathname === "/api/orders/reserve") &&
      method === "POST"
    ) {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const ticketTypeId = String(body["ticket_type_id"] || body["ticketTypeId"] || "");
      const quantity = parseInt(String(body["quantity"] || "1"), 10);
      const buyerName = String(body["buyer_name"] || body["buyerName"] || "");
      const buyerPhone = String(body["buyer_phone"] || body["buyerPhone"] || "");
      const buyerEmail =
        body["buyer_email"] || body["buyerEmail"]
          ? String(body["buyer_email"] || body["buyerEmail"])
              .trim()
              .toLowerCase()
          : undefined;
      const idempotencyKey =
        body["idempotency_key"] || body["idempotencyKey"]
          ? String(body["idempotency_key"] || body["idempotencyKey"])
          : undefined;

      if (
        !process.env["VITE_MPESA_PAYBILL"] ||
        !process.env["VITE_MPESA_ACCOUNT"] ||
        !process.env["VITE_MPESA_ACCOUNT_NAME"]
      ) {
        return errorJson(
          "Checkout is unavailable because verified M-Pesa payment instructions are not configured.",
          "PAYMENT_NOT_CONFIGURED",
          503,
        );
      }
      if (!isCloudSqlConfigured()) {
        return errorJson(
          "Checkout is unavailable because shared order storage is not configured.",
          "STORAGE_UNAVAILABLE",
          503,
        );
      }
      if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
        return errorJson(
          "Checkout is unavailable because organizer authentication is not configured.",
          "STAFF_AUTH_UNAVAILABLE",
          503,
        );
      }

      // Extract client IP for rate limiting
      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const result = await OrderService.createOrder({
        ticketTypeId,
        quantity,
        buyerName,
        buyerPhone,
        buyerEmail,
        idempotencyKey,
        clientIp,
      });

      if (!result.success) {
        let status = 400;
        if (result.code === "RATE_LIMITED") status = 429;
        if (result.code === "TICKET_NOT_FOUND" || result.code === "EVENT_NOT_FOUND") status = 404;
        if (result.code === "INSUFFICIENT_INVENTORY" || result.code === "IDEMPOTENCY_CONFLICT")
          status = 409;
        return json(result, status);
      }

      return json(result, 201);
    }

    // --------------------------------------------------------------------------
    // 2b. POST /api/orders/submit-mpesa-code (Buyer Manual M-Pesa Code Entry)
    // --------------------------------------------------------------------------
    if (pathname === "/api/orders/submit-mpesa-code" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const orderId = String(body["order_id"] || body["orderId"] || "");
      const checkoutToken =
        body["token"] || body["checkoutToken"]
          ? String(body["token"] || body["checkoutToken"])
          : undefined;
      if (!checkoutToken) {
        return errorJson(
          "A checkout authorization token is required to submit a payment reference.",
          "UNAUTHORIZED",
          401,
        );
      }
      const rawInput = String(
        body["mpesa_code"] ||
          body["mpesaCode"] ||
          body["mpesa_message"] ||
          body["mpesaMessage"] ||
          "",
      );
      if (!orderId) {
        return errorJson("order_id is required.", "INVALID_INPUT", 400);
      }

      if (!rawInput || rawInput.trim().length < 5) {
        return errorJson(
          "Please enter a valid M-Pesa transaction confirmation message or reference code.",
          "INVALID_INPUT",
          400,
        );
      }

      // Automatically extract 10-character uppercase alphanumeric M-Pesa code from pasted text or code
      const codeRegexMatch = rawInput.match(/\b([A-Z0-9]{10})\b/i);
      const extractedCode = codeRegexMatch?.[1]
        ? codeRegexMatch[1].toUpperCase()
        : rawInput.trim().toUpperCase();

      const result = await OrderService.submitMpesaCode({
        orderId,
        checkoutToken,
        mpesaCode: extractedCode,
        mpesaMessage: rawInput.trim(),
      });

      if (!result.success || !result.order) {
        return json(result, result.code === "NOT_FOUND" ? 404 : 400);
      }

      const order = result.order;
      const targetEmail = (order.buyerEmail || "").trim().toLowerCase();

      // Email failures must not undo the submitted payment claim.
      let buyerEmailStatus = "not_requested";
      if (targetEmail) {
        try {
          const emailResult = await NotificationOutbox.enqueueAndDispatch({
            channel: "email",
            type: "mpesa_ack",
            recipient: targetEmail,
            payload: {
              to: targetEmail,
              customerName: order.buyerName || "Valued Attendee",
              orderNumber: order.orderNumber,
              mpesaCode: extractedCode,
              ticketTier: order.ticketName,
              quantity: order.quantity,
              totalKes: order.totalKes,
              orderId: order.id,
              checkoutToken: order.checkoutToken,
            },
          }, `mpesa-ack:${order.id}:${extractedCode}`);
          buyerEmailStatus = emailResult.status;
          if (emailResult.status !== "accepted") {
            console.error(
              "[Email Service] M-Pesa acknowledgment outbox status:",
              emailResult.lastError,
            );
          }
        } catch (error) {
          buyerEmailStatus = "enqueue_failed";
          console.error("[Email Service] M-Pesa acknowledgment could not be queued:", error);
        }
      }

      let organizerEmailStatus = "enqueue_failed";
      try {
        const organizerEmail =
          process.env["ORGANIZER_EMAIL"] ||
          process.env["SMTP_USER"] ||
          "verve.n.co.ke@gmail.com";
        const organizerResult = await NotificationOutbox.enqueueAndDispatch({
          channel: "email",
          type: "organizer_mpesa",
          recipient: organizerEmail,
          payload: {
            orderNumber: order.orderNumber,
            orderId: order.id,
            mpesaCode: extractedCode,
            customerName: order.buyerName || "Attendee",
            customerEmail: targetEmail || "Not provided",
            customerPhone: order.buyerPhone || "Not provided",
            ticketTier: order.ticketName,
            quantity: order.quantity,
            totalKes: order.totalKes,
            rawMessage: rawInput.trim(),
          },
        }, `organizer-mpesa:${order.id}:${extractedCode}`);
        organizerEmailStatus = organizerResult.status;
        if (organizerResult.status !== "accepted") {
          console.error(
            "[Email Service] Organizer notification outbox status:",
            organizerResult.lastError,
          );
        }
      } catch (error) {
        console.error("[Email Service] Organizer notification could not be queued:", error);
      }

      return json({
        success: true,
        orderId,
        mpesaCode: extractedCode,
        status: "pending_approval",
        message: "M-Pesa code submitted and is awaiting organizer review.",
        buyerEmailStatus,
        organizerEmailStatus,
        order: result.order,
      });
    }

    // --------------------------------------------------------------------------
    // 3. GET /api/orders/:id (Lookup order status with secure session token)
    // --------------------------------------------------------------------------
    const orderMatch = pathname.match(/^\/api\/orders\/([a-zA-Z0-9_-]+)$/);
    if (orderMatch && method === "GET") {
      const orderId = orderMatch[1];
      const token =
        url.searchParams.get("token") ||
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

      if (!token) {
        return errorJson("Authorization token required for order lookup.", "UNAUTHORIZED", 401);
      }

      const order = await OrderService.getOrder(orderId, token);
      if (!order) {
        return errorJson("Order not found or authorization token invalid.", "UNAUTHORIZED", 401);
      }

      return json(order);
    }

    // --------------------------------------------------------------------------
    // 4. POST /api/orders/cancel
    // --------------------------------------------------------------------------
    if (pathname === "/api/orders/cancel" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const orderId = String(body["order_id"] || body["orderId"] || "");
      const token = String(body["token"] || body["checkoutToken"] || "");

      if (!orderId || !token) {
        return errorJson("order_id and token are required.", "INVALID_INPUT", 400);
      }

      const cancelResult = await OrderService.cancelOrder(orderId, token);
      if (!cancelResult.success) {
        let status = 400;
        if (cancelResult.code === "UNAUTHORIZED") status = 401;
        if (cancelResult.code === "NOT_FOUND") status = 404;
        if (cancelResult.code === "ORDER_EXPIRED") status = 410;
        return json(cancelResult, status);
      }

      return json({ success: true, message: "Reservation released successfully." });
    }

    // --------------------------------------------------------------------------
    // 5. POST /api/pay/verify (Idempotency Gate for Verified Orders)
    // --------------------------------------------------------------------------
    if (pathname === "/api/pay/verify" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const idempotencyKey = String(body["idempotency_key"] || body["idempotencyKey"] || "");
      const orderId = String(body["order_id"] || body["orderId"] || "");
      const token = String(body["token"] || body["checkout_token"] || body["checkoutToken"] || "");
      const mpesaReceipt = body["mpesa_receipt"] ? String(body["mpesa_receipt"]) : undefined;

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const verifyResult = await TicketsServerService.verifyPayment({
        idempotencyKey,
        orderId,
        token,
        clientIp,
      });

      if (!verifyResult.success) {
        let status = 400;
        if (verifyResult.code === "TRANSACTION_PENDING") status = 409;
        if (verifyResult.code === "ORDER_NOT_FOUND") status = 404;
        return json(verifyResult, status);
      }

      return json(verifyResult, 200);
    }

    // --------------------------------------------------------------------------
    // 9. GET /api/tickets/recover/verify (Verify Recovery Token & List Tickets)
    // --------------------------------------------------------------------------
    if (pathname === "/api/tickets/recover/verify" && method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) {
        return errorJson("Recovery token parameter required.", "TOKEN_REQUIRED", 400);
      }

      const verifyResult = await TicketsServerService.verifyRecoveryToken(token);
      if (!verifyResult.valid) {
        return json(
          {
            success: false,
            expired: verifyResult.expired,
            message: verifyResult.expired
              ? "This recovery link has expired. Please request a new link."
              : "Invalid or forged recovery token.",
          },
          401,
        );
      }

      return json({
        success: true,
        email: verifyResult.email,
        tickets: verifyResult.tickets,
      });
    }

    // --------------------------------------------------------------------------
    // 10. POST /api/tickets/recover (Initiate Recovery Link Dispatch)
    // --------------------------------------------------------------------------
    if (pathname === "/api/tickets/recover" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const email = body["email"] ? String(body["email"]).trim() : undefined;
      const phone = body["phone"] ? String(body["phone"]).trim() : undefined;

      if (!email && !phone) {
        return errorJson("Please provide an email address or phone number.", "INPUT_REQUIRED", 400);
      }

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const baseUrl =
        process.env.APP_URL || `${url.protocol}//${request.headers.get("host") || url.host}`;

      const recoveryResult = await TicketsServerService.recoverTicket({
        email,
        phone,
        clientIp,
        baseUrl,
      });

      if (!recoveryResult.success) {
        return json(recoveryResult, recoveryResult.code === "RATE_LIMITED" ? 429 : 400);
      }

      return json(recoveryResult, 200);
    }

    // --------------------------------------------------------------------------
    // 11. GET /api/tickets/:code (Signature-Verified Digital Ticket Lookup)
    // --------------------------------------------------------------------------
    const ticketMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9_-]+)$/);
    if (ticketMatch && method === "GET") {
      const code = ticketMatch[1];
      const lookupResult = await TicketsServerService.getTicketByCode(code);

      if (!lookupResult.success || !lookupResult.ticket) {
        return errorJson(lookupResult.message || "Ticket not found.", "TICKET_NOT_FOUND", 404);
      }

      return json({
        success: true,
        ticket: lookupResult.ticket,
      });
    }

    // --------------------------------------------------------------------------
    // 11b. GET /api/tickets/:code/pdf (Stream/Download Official PDF Ticket Pass)
    // --------------------------------------------------------------------------
    const ticketPdfMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9_-]+)\/pdf$/);
    if (ticketPdfMatch && method === "GET") {
      const code = ticketPdfMatch[1];
      const lookupResult = await TicketsServerService.getTicketByCode(code);

      const ticket = lookupResult?.ticket;
      if (!lookupResult?.success || !ticket) {
        return errorJson("Ticket not found.", "TICKET_NOT_FOUND", 404);
      }
      try {
        const pdfBuffer = await generateTicketPdfBuffer({
          ticketCode: code,
          customerName: ticket.attendeeName,
          tierName: ticket.tierName,
          admitsCount: ticket.admitsCount,
          orderNumber: ticket.orderNumber,
          totalKes: ticket.priceKes,
          qrHash: ticket.qrHash,
          eventDate: ticket.venue.date,
          venueName: ticket.venue.name,
          venueAddress: ticket.venue.address,
        });

        return new Response(pdfBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="Ticket-${code}.pdf"`,
            "Content-Length": String(pdfBuffer.length),
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (pdfErr) {
        console.error("Failed to generate PDF pass on route:", pdfErr);
        return errorJson("Failed to generate PDF pass.", "PDF_GENERATION_FAILED", 500);
      }
    }

    // --------------------------------------------------------------------------
    // 11c. GET /api/tickets/:code/image (Stream High-Res Ticket Pass Image)
    // --------------------------------------------------------------------------
    const ticketImageMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9_-]+)\/image$/);
    if (ticketImageMatch && method === "GET") {
      const code = ticketImageMatch[1];
      const lookupResult = await TicketsServerService.getTicketByCode(code);

      const ticket = lookupResult?.ticket;
      if (!lookupResult?.success || !ticket) {
        return errorJson("Ticket not found.", "TICKET_NOT_FOUND", 404);
      }
      try {
        const imageBuffer = await generateTicketPassImageBuffer({
          ticketCode: code,
          customerName: ticket.attendeeName,
          tierName: ticket.tierName,
          admitsCount: ticket.admitsCount,
          orderNumber: ticket.orderNumber,
          totalKes: ticket.priceKes,
          qrHash: ticket.qrHash,
          eventDate: ticket.venue.date,
          venueName: ticket.venue.name,
        });

        return new Response(imageBuffer, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename="Ticket-${code}.jpg"`,
            "Content-Length": String(imageBuffer.length),
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (imgErr) {
        console.error("Failed to generate pass image on route:", imgErr);
        return errorJson("Failed to generate ticket image.", "IMAGE_GENERATION_FAILED", 500);
      }
    }

    // --------------------------------------------------------------------------
    // 12. POST /api/tickets/validate & POST /api/tickets/checkin (Authoritative Gate Validation)
    // --------------------------------------------------------------------------
    if (
      (pathname === "/api/tickets/validate" || pathname === "/api/tickets/checkin") &&
      method === "POST"
    ) {
      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      // Rate limit: 60 checks per minute per IP for scanner protection
      const rateCheck = SlidingWindowRateLimiter.check(clientIp, "ticket_validate", {
        windowMs: 60000,
        maxRequests: 60,
      });

      if (!rateCheck.allowed) {
        return errorJson("Scanner rate limit exceeded. Please wait a moment.", "RATE_LIMITED", 429);
      }

      let rawBody: Record<string, unknown>;
      try {
        rawBody = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const body = sanitizeObject(rawBody);
      const parseResult = validateTicketSchema.safeParse({
        ticket_code: body["ticket_code"] || body["code"] || body["ticket_number"],
        qr_hash: body["qr_hash"] || body["qrHash"],
        event_id: body["event_id"] || body["eventId"] || "hauntings-of-the-rift-2026",
        staff_name: body["staff_name"] || body["staffName"] || "Gate Security Staff",
        gate_location: body["gate_location"] || body["gateLocation"] || "Main Top Cliff Entrance",
      });

      if (!parseResult.success) {
        return errorJson(
          parseResult.error.errors[0]?.message || "Invalid ticket payload",
          "VALIDATION_ERROR",
          400,
        );
      }

      const { ticket_code, qr_hash, event_id, staff_name, gate_location } = parseResult.data;

      const checkInResult = await TicketsServerService.validateAndCheckinTicket({
        ticket_code,
        qr_hash,
        event_id,
        staff_name,
        gate_location,
        clientIp,
      });

      return json(checkInResult, checkInResult.httpStatus);
    }

    // --------------------------------------------------------------------------
    // 12b. GET /api/tickets/stats (Live Gate Check-in Stats)
    // --------------------------------------------------------------------------
    if (pathname === "/api/tickets/stats" && method === "GET") {
      const stats = TicketsServerService.getCheckinStats();
      return json({ success: true, ...stats });
    }

    // --------------------------------------------------------------------------
    // 12c. GET /api/ticket-tiers (Authoritative Ticket Tiers & Current Prices)
    // --------------------------------------------------------------------------
    if (
      (pathname === "/api/ticket-tiers" || pathname === "/api/admin/ticket-tiers") &&
      method === "GET"
    ) {
      const tiers = OrderService.getTicketTypes();
      return json({ success: true, count: tiers.length, tiers });
    }

    // --------------------------------------------------------------------------
    // 12d. POST /api/admin/ticket-tiers/update (Organizer Changes Tier Price & Limits)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/ticket-tiers/update" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const slug = String(body["slug"] || "").trim();
      if (!slug) {
        return errorJson("Tier slug is required.", "INVALID_INPUT", 400);
      }

      const result = OrderService.updateTicketType(slug, {
        name: body["name"] !== undefined ? String(body["name"]) : undefined,
        priceKes: body["priceKes"] !== undefined ? Number(body["priceKes"]) : undefined,
        admitsCount: body["admitsCount"] !== undefined ? Number(body["admitsCount"]) : undefined,
        totalInventory:
          body["totalInventory"] !== undefined
            ? body["totalInventory"] === null
              ? null
              : Number(body["totalInventory"])
            : undefined,
        active: body["active"] !== undefined ? Boolean(body["active"]) : undefined,
      });

      if (!result.success || !result.tier) {
        return errorJson(result.message || "Failed to update ticket tier.", "NOT_FOUND", 404);
      }

      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      await AdminServerService.recordAuditLog({
        actorEmail,
        action: "ticket_tier.updated",
        targetTable: "ticket_tiers",
        targetId: slug,
        metadata: {
          slug,
          newPriceKes: result.tier.priceKes,
          name: result.tier.name,
          active: result.tier.active,
        },
      });

      return json({
        success: true,
        message: `Ticket tier '${result.tier.name}' updated successfully.`,
        tier: result.tier,
      });
    }

    // --------------------------------------------------------------------------
    // 12e. POST /api/admin/ticket-tiers/create (Add New Ticket Tier)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/ticket-tiers/create" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const slug = String(body["slug"] || "").trim();
      const name = String(body["name"] || "").trim();
      const priceKes = Number(body["priceKes"] || body["price_kes"] || 0);
      const admitsCount = Number(body["admitsCount"] || body["admits_count"] || 1);
      const totalInventory =
        body["totalInventory"] !== undefined && body["totalInventory"] !== null
          ? Number(body["totalInventory"])
          : null;

      if (!slug || !name) {
        return errorJson("Slug and name are required for new ticket tier.", "INVALID_INPUT", 400);
      }

      const result = OrderService.createTicketType({
        slug,
        name,
        priceKes,
        admitsCount,
        totalInventory,
      });

      if (!result.success || !result.tier) {
        return errorJson(result.message || "Failed to create ticket tier.", "CONFLICT", 409);
      }

      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      await AdminServerService.recordAuditLog({
        actorEmail,
        action: "ticket_tier.created",
        targetTable: "ticket_tiers",
        targetId: slug,
        metadata: {
          slug,
          priceKes: result.tier.priceKes,
          name: result.tier.name,
        },
      });

      return json({
        success: true,
        message: `Ticket tier '${result.tier.name}' created successfully.`,
        tier: result.tier,
      });
    }

    // --------------------------------------------------------------------------
    // 13. GET /api/admin/overview (Dashboard Metrics & Analytics)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/overview" && method === "GET") {
      const overview = await AdminServerService.getOverviewMetrics();
      return json({ success: true, ...overview });
    }

    // --------------------------------------------------------------------------
    // 14. GET /api/admin/tickets (Ticket Management Data Table)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/tickets" && method === "GET") {
      const search = url.searchParams.get("search") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const tier = url.searchParams.get("tier") || undefined;

      const tickets = await AdminServerService.getTickets({ search, status, tier });
      return json({ success: true, count: tickets.length, tickets });
    }

    // --------------------------------------------------------------------------
    // 15. POST /api/admin/tickets/revoke (Manually Invalidate Pass)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/tickets/revoke" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const code = String(body["code"] || "");
      const reason = String(body["reason"] || "Manual organizer revocation");
      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      const actorId = body["actor_id"] ? String(body["actor_id"]) : undefined;

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const result = await AdminServerService.revokeTicket({
        code,
        reason,
        actorEmail,
        actorId,
        clientIp,
      });

      return json(result, result.success ? 200 : 400);
    }

    // --------------------------------------------------------------------------
    // 16. POST /api/admin/tickets/resend (Resend Ticket Email to Buyer)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/tickets/resend" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const code = String(body["code"] || "");
      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      const actorId = body["actor_id"] ? String(body["actor_id"]) : undefined;

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const result = await AdminServerService.resendTicketEmail({
        code,
        actorEmail,
        actorId,
        clientIp,
      });

      return json(result, result.success ? 200 : 400);
    }

    // --------------------------------------------------------------------------
    // 16b. GET /api/admin/orders/pending (Fetch orders awaiting M-Pesa verification)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/orders/pending" && method === "GET") {
      const pendingOrders = await OrderService.getPendingOrders();
      return json({
        success: true,
        count: pendingOrders.length,
        orders: pendingOrders,
      });
    }

    // --------------------------------------------------------------------------
    // 16c. POST /api/admin/orders/approve (Admin approves order, issues tickets & sends email)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/orders/approve" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const orderId = String(body["order_id"] || body["orderId"] || "");
      const adminEmail = apiRequestUserId || "authenticated-admin";
      const verifiedReceiptReference = String(
        body["verified_receipt_reference"] || body["verifiedReceiptReference"] || "",
      ).trim();
      const receivedAmountKes = Number(body["received_amount_kes"] ?? body["receivedAmountKes"]);
      const receivedAt = String(body["received_at"] || body["receivedAt"] || "");
      const evidenceNote = String(body["evidence_note"] || body["evidenceNote"] || "").trim();

      if (!orderId) {
        return errorJson("order_id is required.", "INVALID_INPUT", 400);
      }
      if (
        !/^[A-Z0-9]{5,32}$/i.test(verifiedReceiptReference) ||
        !Number.isSafeInteger(receivedAmountKes) ||
        receivedAmountKes <= 0 ||
        !Number.isFinite(Date.parse(receivedAt)) ||
        Date.parse(receivedAt) > Date.now() ||
        !evidenceNote
      ) {
        return errorJson(
          "Verified receipt reference, positive statement amount, receipt date, and evidence note are required.",
          "INVALID_VERIFICATION_EVIDENCE",
          400,
        );
      }

      // 1. Approve order state in authoritative service
      const existingOrder = await OrderService._getOrderByIdInternal(orderId);
      const hasRecordedReceipt =
        existingOrder?.status === "approved" &&
        (await PaymentOperationsStore.hasReceiptForOrder(orderId));
      const approveResult = hasRecordedReceipt
        ? {
            success: true,
            order: existingOrder,
            message: "Verified order is already approved; retrying ticket issuance.",
          }
        : await OrderService.approveOrder({
            orderId,
            adminEmail,
            verifiedReceiptReference,
            receivedAmountKes,
            receivedAt,
            evidenceNote,
          });

      if (!approveResult.success || !approveResult.order) {
        const status =
          approveResult.code === "NOT_FOUND"
            ? 404
            : approveResult.code === "DUPLICATE_PAYMENT_REFERENCE" ||
                approveResult.code === "PAYMENT_AMOUNT_MISMATCH"
              ? 409
              : 400;
        return json(approveResult, status);
      }

      const order = approveResult.order;

      // 2. Issue authoritative tickets for order
      let tickets: Awaited<ReturnType<typeof TicketsServerService.issueTicketsForApprovedOrder>> =
        [];
      try {
        tickets = await TicketsServerService.issueTicketsForApprovedOrder(orderId);
      } catch (err) {
        console.error("Failed to issue tickets for order:", err);
        return errorJson(
          "Payment approval was saved, but ticket issuance failed. Retry ticket issuance before confirming this order.",
          "TICKET_ISSUANCE_FAILED",
          503,
        );
      }
      if (tickets.length !== order.quantity) {
        return errorJson(
          "Payment approval was saved, but the expected tickets are not available yet.",
          "TICKET_ISSUANCE_INCOMPLETE",
          503,
        );
      }
      const firstTicket = tickets[0];
      if (!firstTicket) {
        return errorJson(
          "Payment approval was saved, but no ticket record is available yet.",
          "TICKET_ISSUANCE_INCOMPLETE",
          503,
        );
      }

      // 3. Send ticket confirmation email to buyer if email provided
      let emailDelivery: {
        status: string;
        providerStatus: string;
        providerMessageId?: string;
        lastError?: string;
      } = { status: "not_requested", providerStatus: "no_recipient" };
      const recipientEmail = order.buyerEmail;

      if (recipientEmail) {
        const siteBase = getSiteBaseUrl();
        try {
          const outboxRecord = await NotificationOutbox.enqueueAndDispatch(
            {
              channel: "email",
              type: "ticket_confirmation",
              recipient: recipientEmail,
              payload: {
                to: recipientEmail,
                buyerName: order.buyerName,
                orderNumber: order.orderNumber,
                totalKes: order.totalKes,
                ticketTier: order.ticketName,
                quantity: order.quantity,
                ticketUrl: `${siteBase}/ticket/${firstTicket.ticketNumber}`,
                tickets: tickets.map((ticket) => ({
                  ticketNumber: ticket.ticketNumber,
                  tierName: ticket.tierName,
                  attendeeName: ticket.attendeeName,
                  admitsCount: ticket.admitsCount,
                  qrHash: ticket.qrHash,
                  ticketUrl: `${siteBase}/ticket/${ticket.ticketNumber}`,
                  qrDataUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                    JSON.stringify({
                      code: ticket.ticketNumber,
                      hash: ticket.qrHash,
                      event: "HALLOWEEN_RIFT_2026",
                      admits: ticket.admitsCount,
                    }),
                  )}`,
                })),
              },
            },
            `ticket-confirmation:${order.id}`,
          );
          emailDelivery = {
            status: outboxRecord.status,
            providerStatus: outboxRecord.providerStatus || "unknown",
            ...(outboxRecord.providerMessageId
              ? { providerMessageId: outboxRecord.providerMessageId }
              : {}),
            ...(outboxRecord.lastError ? { lastError: outboxRecord.lastError } : {}),
          };
        } catch (error) {
          console.error("Could not enqueue ticket confirmation email:", error);
          emailDelivery = {
            status: "enqueue_failed",
            providerStatus: "not_attempted",
            lastError: error instanceof Error ? error.message : "Email could not be queued.",
          };
        }
      }

      return json({
        success: true,
        message: `Order ${order.orderNumber} successfully approved and ${tickets.length} ticket(s) issued.`,
        order,
        tickets,
        emailDelivery,
      });
    }

    // --------------------------------------------------------------------------
    // 16d. POST /api/admin/orders/reject (Admin rejects order with reason)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/orders/reject" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const orderId = String(body["order_id"] || body["orderId"] || "");
      const reason = String(
        body["reason"] || "M-Pesa transaction reference could not be verified.",
      );
      const adminEmail = String(body["admin_email"] || body["adminEmail"] || "admin@verve.co.ke");

      if (!orderId) {
        return errorJson("order_id is required.", "INVALID_INPUT", 400);
      }

      const rejectResult = await OrderService.rejectOrder({
        orderId,
        reason,
        adminEmail,
      });

      if (!rejectResult.success) {
        return json(rejectResult, rejectResult.code === "NOT_FOUND" ? 404 : 400);
      }

      return json({
        success: true,
        message: `Order ${orderId} marked as rejected.`,
        order: rejectResult.order,
      });
    }

    // --------------------------------------------------------------------------
    // --------------------------------------------------------------------------
    // 17. GET /api/admin/promotions (Promotion Codes List)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/promotions" && method === "GET") {
      const promotions = AdminServerService.getPromotions();
      return json({ success: true, count: promotions.length, promotions });
    }

    // --------------------------------------------------------------------------
    // 18. POST /api/admin/promotions (Create New Promotion Code)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/promotions" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const code = String(body["code"] || "");
      const name = body["name"] ? String(body["name"]) : undefined;
      const discountType = String(body["discount_type"] || body["discountType"] || "percentage") as
        "percentage" | "fixed";
      const discountValue = Number(body["discount_value"] ?? body["discountValue"] ?? 0);
      const maxUses = Number(body["max_uses"] ?? body["maxUses"] ?? 100);
      const expiresAt =
        body["expires_at"] || body["expiresAt"]
          ? String(body["expires_at"] || body["expiresAt"])
          : null;
      const isActive = body["is_active"] !== false && body["isActive"] !== false;
      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      const actorId = body["actor_id"] ? String(body["actor_id"]) : undefined;

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const result = await AdminServerService.createPromotion({
        code,
        name,
        discountType,
        discountValue,
        maxUses,
        expiresAt,
        isActive,
        actorEmail,
        actorId,
        clientIp,
      });

      return json(result, result.success ? 201 : 400);
    }

    // --------------------------------------------------------------------------
    // 19. POST /api/admin/promotions/toggle (Quick Toggle Status)
    // --------------------------------------------------------------------------
    if (
      (pathname === "/api/admin/promotions/toggle" ||
        (pathname.startsWith("/api/admin/promotions/") && pathname.endsWith("/toggle"))) &&
      (method === "POST" || method === "PATCH")
    ) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        // body could be empty for URL route
      }

      let codeOrId = String(body["code"] || body["id"] || "");
      if (!codeOrId && pathname.includes("/toggle")) {
        const parts = pathname.split("/");
        codeOrId = parts[parts.indexOf("toggle") - 1] || "";
      }

      const isActive = Boolean(body["is_active"] ?? body["isActive"] ?? true);
      const actorEmail = String(body["actor_email"] || body["actorEmail"] || "admin@verve.co.ke");
      const actorId = body["actor_id"] ? String(body["actor_id"]) : undefined;

      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "127.0.0.1";

      const result = await AdminServerService.togglePromotion({
        codeOrId,
        isActive,
        actorEmail,
        actorId,
        clientIp,
      });

      return json(result, result.success ? 200 : 400);
    }

    // --------------------------------------------------------------------------
    // 20. POST /api/admin/promotions/delete (Delete Promo)
    // --------------------------------------------------------------------------
    if (
      (pathname === "/api/admin/promotions/delete" ||
        (pathname.startsWith("/api/admin/promotions/") && method === "DELETE")) &&
      (method === "POST" || method === "DELETE")
    ) {
      let codeOrId = "";
      if (method === "DELETE") {
        codeOrId = pathname.split("/").pop() || "";
      } else {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        codeOrId = String(body["code"] || body["id"] || "");
      }

      const actorEmail = "admin@verve.co.ke";
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

      const result = await AdminServerService.deletePromotion({
        codeOrId,
        actorEmail,
        clientIp,
      });

      return json(result, result.success ? 200 : 400);
    }

    // --------------------------------------------------------------------------
    // 21. POST /api/promotions/validate (Customer Checkout Promo Validation)
    // --------------------------------------------------------------------------
    if (pathname === "/api/promotions/validate" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const code = String(body["code"] || "");
      const subtotalKes = Number(body["subtotal_kes"] || body["subtotalKes"] || 0);

      const result = AdminServerService.validatePromoCode(code, subtotalKes);
      return json(result, result.valid ? 200 : 400);
    }

    // --------------------------------------------------------------------------
    // 21b. GET /api/promotions (Active Public Promotions)
    // --------------------------------------------------------------------------
    if (pathname === "/api/promotions" && method === "GET") {
      const allPromos = AdminServerService.getPromotions();
      const now = new Date();
      const activePromos = allPromos.filter((p) => {
        if (!p.isActive) return false;
        if (p.maxUses && p.currentUses >= p.maxUses) return false;
        if (p.expiresAt && new Date(p.expiresAt) < now) return false;
        return true;
      });
      return json({ success: true, count: activePromos.length, promotions: activePromos });
    }

    // --------------------------------------------------------------------------
    // 22. GET /api/admin/audit-logs (Audit Trail)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/audit-logs" && method === "GET") {
      const logs = AdminServerService.getAuditLogs();
      return json({ success: true, count: logs.length, logs });
    }

    // --------------------------------------------------------------------------
    // 23. GET /api/admin/scanners (Scanner Fleet & Gate Stats)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/scanners" && method === "GET") {
      const scanners = AdminServerService.getScanners();
      return json({ success: true, count: scanners.length, scanners });
    }

    if (pathname === "/api/admin/scanners" && method === "POST") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const name = String(body["name"] || "").trim();
        const operatorName = String(
          body["operatorName"] || body["operator_name"] || "Gate Staff",
        ).trim();
        const gateLocation = String(
          body["gateLocation"] || body["gate_location"] || "Main Gate",
        ).trim();
        if (!name) {
          return errorJson("Scanner device name is required.", "MISSING_NAME", 400);
        }
        const scanner = AdminServerService.registerScanner({
          name,
          operatorName,
          gateLocation,
          status: (body["status"] as "active" | "standby" | "offline") || "active",
        });
        return json({ success: true, scanner });
      } catch (err: unknown) {
        return errorJson(
          err instanceof Error ? err.message : "Failed to register scanner",
          "REGISTRATION_FAILED",
          500,
        );
      }
    }

    if (pathname === "/api/admin/scanners/delete" && method === "POST") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const id = String(body["id"] || "").trim();
        if (!id) return errorJson("Scanner ID required", "MISSING_ID", 400);
        const deleted = AdminServerService.deleteScanner(id);
        return json({ success: deleted });
      } catch (err: unknown) {
        return errorJson(
          err instanceof Error ? err.message : "Failed to delete scanner",
          "DELETE_FAILED",
          500,
        );
      }
    }

    // --------------------------------------------------------------------------
    // 24. POST /api/admin/refunds/process (Disabled pending external verification)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/refunds/process" && method === "POST") {
      return errorJson(
        "Refund recording is disabled until external M-Pesa reversals can be independently verified. This app does not initiate reversals.",
        "REVERSAL_VERIFICATION_UNAVAILABLE",
        503,
      );
    }

    // --------------------------------------------------------------------------
    // 24b. POST /api/admin/payments/settlements (Record External Statement Evidence)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/payments/settlements" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }
      const settlementReference = String(
        body["settlementReference"] || body["settlement_reference"] || "",
      ).trim();
      const amountKes = Number(body["amountKes"] ?? body["amount_kes"]);
      const settledAt = String(body["settledAt"] || body["settled_at"] || "");
      const evidenceNote = String(body["evidenceNote"] || body["evidence_note"] || "").trim();
      if (
        !/^[A-Z0-9][A-Z0-9-]{4,39}$/i.test(settlementReference) ||
        !Number.isSafeInteger(amountKes) ||
        amountKes <= 0 ||
        !Number.isFinite(Date.parse(settledAt)) ||
        Date.parse(settledAt) > Date.now() ||
        !evidenceNote
      ) {
        return errorJson(
          "Statement reference, positive settlement amount, settlement date, and evidence note are required.",
          "INVALID_SETTLEMENT_EVIDENCE",
          400,
        );
      }
      const result = await PaymentOperationsStore.recordSettlement({
        settlementReference,
        amountKes,
        settledAt,
        recordedBy: apiRequestUserId || "authenticated-admin",
        evidenceNote,
      });
      if (result.duplicate) {
        return errorJson(
          "This settlement reference has already been recorded.",
          "DUPLICATE_SETTLEMENT_REFERENCE",
          409,
        );
      }
      return json({ success: true, settlement: result.settlement });
    }

    // --------------------------------------------------------------------------
    // 25. GET /api/admin/reconciliation (Financial Reconciliation Ledger & Metrics)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/reconciliation" && method === "GET") {
      const reconciliationData = await RefundService.getReconciliationData();
      return json({ success: true, ...reconciliationData });
    }

    // --------------------------------------------------------------------------
    // 26. POST /api/notifications/whatsapp (Dispatch Transactional WhatsApp Message)
    // --------------------------------------------------------------------------
    if (pathname === "/api/notifications/whatsapp" && method === "POST") {
      let rawBody: Record<string, unknown>;
      try {
        rawBody = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const body = sanitizeObject(rawBody);
      const parseResult = sendWhatsAppNotificationSchema.safeParse({
        phone: body["phone"] || body["recipientPhone"] || body["recipient_phone"],
        templateType: body["templateType"] || body["template"] || "booking_confirmation",
        customerName:
          body["customerName"] ||
          body["customer_name"] ||
          body["attendeeName"] ||
          body["attendee_name"],
        passTierAndQuantity:
          body["passTierAndQuantity"] ||
          body["pass_tier_quantity"] ||
          (body["tierName"] ? `${body["tierName"]} (x1)` : undefined),
        orderId: body["orderId"] || body["order_id"] || body["orderNumber"] || body["order_number"],
        ticketAccessUrl:
          body["ticketAccessUrl"] ||
          body["ticket_access_url"] ||
          body["directTicketUrl"] ||
          body["direct_ticket_url"],
        venueNameOrLocation:
          body["venueNameOrLocation"] ||
          body["venue_name"] ||
          "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
        gateOpeningTime:
          body["gateOpeningTime"] || body["gate_opening_time"] || "4:00 PM till late",
        fastPassLink: body["fastPassLink"] || body["fast_pass_link"],
        refundAmountKes:
          body["refundAmountKes"] || body["refund_amount_kes"] || body["refund_amount"],
        paymentProviderRef:
          body["paymentProviderRef"] || body["payment_ref"] || body["payment_provider_ref"],
        reasonOrDetails: body["reasonOrDetails"] || body["reason"] || body["refund_reason"],
        attendeeName: body["attendeeName"] || body["customerName"],
        ticketCode: body["ticketCode"] || body["ticket_code"],
        tierName: body["tierName"] || body["tier_name"],
        orderNumber: body["orderNumber"] || body["order_number"],
        totalKes: body["totalKes"] ? Number(body["totalKes"]) : undefined,
        directTicketUrl: body["directTicketUrl"] || body["ticketAccessUrl"],
      });

      if (!parseResult.success) {
        return errorJson(
          parseResult.error.errors[0]?.message || "Invalid WhatsApp notification payload",
          "VALIDATION_ERROR",
          400,
        );
      }

      const data = parseResult.data;
      if (apiRequestRole === "scanner" && data.templateType !== "gate_alert") {
        return errorJson("Scanners may only dispatch gate alerts.", "FORBIDDEN", 403);
      }
      if (data.templateType !== "gate_alert") {
        return errorJson(
          "Customer notifications must be generated from a verified order or ticket record.",
          "VERIFIED_RECORD_REQUIRED",
          409,
        );
      }
      if (!data.ticketCode) {
        return errorJson("Gate alerts require a ticket code.", "VERIFIED_RECORD_REQUIRED", 400);
      }
      const ticketResult = await TicketsServerService.getTicketByCode(data.ticketCode);
      const ticket = ticketResult.ticket;
      if (!ticket || !ticketResult.success) {
        return errorJson("No ticket found for this gate alert.", "TICKET_NOT_FOUND", 404);
      }
      const normalizePhone = (phone: string) => phone.replace(/\D/g, "").replace(/^0/, "254");
      if (
        ticket.status !== "used" ||
        !ticket.buyerPhone ||
        normalizePhone(ticket.buyerPhone) !== normalizePhone(data.phone)
      ) {
        return errorJson(
          "A gate alert requires a checked-in ticket and its verified buyer phone number.",
          "VERIFIED_RECORD_REQUIRED",
          409,
        );
      }
      const outboxRecord = await NotificationOutbox.enqueueAndDispatch({
        channel: "whatsapp",
        type: "whatsapp",
        recipient: ticket.buyerPhone,
        payload: {
          recipientPhone: ticket.buyerPhone,
          template: data.templateType,
          params: {
            customerName: ticket.attendeeName,
            ticketCode: ticket.ticketNumber,
          },
        },
      });

      return json(
        {
          success: outboxRecord.status === "accepted",
          status: outboxRecord.status,
          providerStatus: outboxRecord.providerStatus,
          providerMessageId: outboxRecord.providerMessageId,
          attempts: outboxRecord.attempts,
          nextAttemptAt: outboxRecord.availableAt,
          error: outboxRecord.lastError,
          deliveryNote:
            outboxRecord.status === "accepted"
              ? "Provider accepted the request; recipient delivery is not confirmed."
              : "The message was not accepted by the provider and remains eligible for retry.",
        },
        outboxRecord.status === "accepted" ? 200 : 503,
      );
    }

    if (pathname === "/api/admin/notifications/outbox" && method === "GET") {
      const outbox = await NotificationOutbox.list();
      return json({ success: true, outbox });
    }

    if (pathname === "/api/admin/notifications/outbox/process" && method === "POST") {
      const processed = await NotificationOutbox.processDue();
      return json({ success: true, processed });
    }

    // --------------------------------------------------------------------------
    // 27. POST /api/notifications/email (Dispatch Transactional HTML Email)
    // --------------------------------------------------------------------------
    if (pathname === "/api/notifications/email" && method === "POST") {
      return errorJson(
        "Customer emails must be generated from a verified order or ticket record.",
        "VERIFIED_RECORD_REQUIRED",
        409,
      );
    }

    // --------------------------------------------------------------------------
    // 28. POST /api/notifications/reminder-24h (Batch 24h Reminder Dispatch)
    // --------------------------------------------------------------------------
    if (pathname === "/api/notifications/reminder-24h" && method === "POST") {
      return errorJson(
        "Bulk reminders are disabled until event timing and delivery status can be verified.",
        "REMINDERS_UNAVAILABLE",
        503,
      );
    }

    // --------------------------------------------------------------------------
    // 29. GET /api/notifications/preview (HTML & Plaintext Preview Engine)
    // --------------------------------------------------------------------------
    if (pathname === "/api/notifications/preview" && method === "GET") {
      return errorJson(
        "Server-generated notification previews are disabled; use the clearly labeled local preview.",
        "PREVIEW_UNAVAILABLE",
        503,
      );
    }

    // --------------------------------------------------------------------------
    // 30. GET /api/admin/audience (Aggregated Buyers & Subscribers Email List)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/audience" && method === "GET") {
      const buyers = await OrderService.getTicketBuyersEmailList();
      const tickets = await TicketsServerService.getAllTickets();

      // Aggregate counts
      const totalPurchasers = buyers.length;
      const totalTicketsIssued = tickets.length;
      const checkedInCount = tickets.filter((t) => t.status === "used").length;

      return json({
        success: true,
        summary: {
          totalPurchasers,
          totalTicketsIssued,
          checkedInCount,
        },
        audience: buyers,
      });
    }

    // --------------------------------------------------------------------------
    // 31. POST /api/admin/audience/broadcast (Send Batch Broadcast Email)
    // --------------------------------------------------------------------------
    if (pathname === "/api/admin/audience/broadcast" && method === "POST") {
      let rawBody: Record<string, unknown>;
      try {
        rawBody = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const body = sanitizeObject(rawBody);
      const subject = String(body["subject"] || "").trim();
      const headline = String(body["headline"] || "").trim() || subject;
      const message = String(body["message"] || "").trim();
      const targetFilter = String(body["targetFilter"] || "all"); // 'all' | 'approved' | 'tier:slug'
      const ctaText = body["ctaText"] ? String(body["ctaText"]).trim() : undefined;
      const ctaUrl = body["ctaUrl"] ? String(body["ctaUrl"]).trim() : undefined;
      const testRecipient = body["testRecipient"]
        ? String(body["testRecipient"]).trim()
        : undefined;

      if (!subject || !message) {
        return errorJson("Subject and Message body are required.", "VALIDATION_ERROR", 400);
      }

      // If test recipient requested, dispatch single email
      if (testRecipient) {
        const testResult = await NotificationOutbox.enqueueAndDispatch({
          channel: "email",
          type: "broadcast",
          recipient: testRecipient,
          payload: {
            subject: `[TEST PREVIEW] ${subject}`,
            headline,
            message,
            ...(ctaText ? { ctaText } : {}),
            ...(ctaUrl ? { ctaUrl } : {}),
          },
        });

        return json({
          success: true,
          mode: "test",
          recipientCount: 1,
          testRecipient,
          providerStatus: testResult.providerStatus,
          outboxStatus: testResult.status,
          providerMessageId: testResult.providerMessageId,
          lastError: testResult.lastError,
        });
      }

      // Collect target recipients based on filter
      const allBuyers = await OrderService.getTicketBuyersEmailList();
      let recipients: string[] = [];

      if (targetFilter === "all") {
        recipients = allBuyers.map((b) => b.email);
      } else if (targetFilter === "completed" || targetFilter === "approved") {
        recipients = allBuyers
          .filter((b) => b.status === "completed" || b.status === "approved")
          .map((b) => b.email);
      } else if (targetFilter.startsWith("tier:")) {
        const tierSlug = targetFilter.replace("tier:", "").toLowerCase();
        recipients = allBuyers
          .filter((b) => (b.ticketTier || "").toLowerCase().includes(tierSlug))
          .map((b) => b.email);
      } else {
        recipients = allBuyers.map((b) => b.email);
      }

      // Deduplicate emails
      const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean)));

      if (uniqueRecipients.length === 0) {
        return errorJson(
          "No recipients matched the specified audience filter.",
          "NO_RECIPIENTS",
          400,
        );
      }

      // Dispatch in batches or iterate
      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];

      for (const email of uniqueRecipients) {
        const res = await NotificationOutbox.enqueueAndDispatch({
          channel: "email",
          type: "broadcast",
          recipient: email,
          payload: {
            subject,
            headline,
            message,
            ...(ctaText ? { ctaText } : {}),
            ...(ctaUrl ? { ctaUrl } : {}),
          },
        });

        if (res.status === "accepted") {
          successCount++;
        } else {
          failureCount++;
          if (res.lastError) errors.push(`${email}: ${res.lastError}`);
        }
      }

      // Record in audit log if available
      try {
        await AdminServerService.recordAuditLog({
          actorEmail: request.headers.get("x-user-email") || "admin@verve.co.ke",
          actorRole: "admin",
          action: "DISPATCH_EMAIL_BROADCAST",
          targetTable: "email_broadcasts",
          targetId: subject,
          metadata: {
            details: `Provider accepted ${successCount} of ${uniqueRecipients.length} outbox notification(s) for "${subject}". Filter: ${targetFilter}`,
          },
        });
      } catch {
        // ignore
      }

      return json({
        success: true,
        mode: "live_broadcast",
        totalTargeted: uniqueRecipients.length,
        providerAcceptedCount: successCount,
        recipientDeliveryConfirmedCount: 0,
        queuedOrFailedCount: failureCount,
        failedCount: failureCount,
        errors: errors.slice(0, 5),
      });
    }

    // --------------------------------------------------------------------------
    // 32. POST /api/newsletter/subscribe (Public Audience Sign-Up)
    // --------------------------------------------------------------------------
    if (pathname === "/api/newsletter/subscribe" && method === "POST") {
      let rawBody: Record<string, unknown>;
      try {
        rawBody = (await request.json()) as Record<string, unknown>;
      } catch {
        return errorJson("Invalid JSON request body.", "INVALID_JSON", 400);
      }

      const body = sanitizeObject(rawBody);
      const email = String(body["email"] || "")
        .trim()
        .toLowerCase();
      const name = String(body["name"] || "").trim();

      if (!email || !email.includes("@")) {
        return errorJson("Valid email address is required.", "INVALID_EMAIL", 400);
      }

      const welcomeEmail = await NotificationOutbox.enqueueAndDispatch({
        channel: "email",
        type: "broadcast",
        recipient: email,
        payload: {
          subject: "Welcome to Verve & Co. — Hauntings of the Rift Updates",
          headline: "You're on the Guest List for Rift Updates",
          message: `Greetings ${name || "guest"},\n\nYou have subscribed to updates for Hauntings of the Rift on 31 October 2026 at Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru.`,
          ctaText: "Explore Event & Passes",
          ctaUrl: `${getSiteBaseUrl()}/checkout`,
        },
      });

      return json({
        success: true,
        message:
          welcomeEmail.status === "accepted"
            ? "The email provider accepted the welcome message; recipient delivery is not confirmed."
            : `The welcome message was not accepted; outbox status is ${welcomeEmail.status}.`,
        outboxStatus: welcomeEmail.status,
        providerStatus: welcomeEmail.providerStatus,
      });
    }

    // --------------------------------------------------------------------------
    // 404 For Unrecognized API routes
    // --------------------------------------------------------------------------
    return errorJson(`API route ${method} ${pathname} not found.`, "NOT_FOUND", 404);
  } catch (error) {
    console.error("Unhandled API Error:", error);
    return errorJson("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
  }
}
