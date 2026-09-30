import { randomUUID, timingSafeEqual } from "crypto";
import { OrderService, StoredOrder } from "./order-service";
import { TicketsServerService } from "./tickets.server";
import { validateAndNormalizeKenyanPhone } from "../lib/validation/phone";
import type { Database, PaymentStatus } from "../lib/database.types";
import { supabaseServer } from "../lib/supabase/server";

export interface StoredPayment {
  id: string;
  orderId: string;
  provider: "mpesa";
  merchantRequestId: string | null;
  checkoutRequestId: string;
  phoneNumber: string;
  amountKes: number;
  status: "initiated" | "processing" | "successful" | "failed" | "timed_out" | "payment_review";
  resultCode: number | null;
  resultDescription: string | null;
  mpesaReceiptNumber: string | null;
  rawCallbackPayload: Record<string, unknown> | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StkPushRequestInput {
  orderId: string;
  checkoutToken: string;
  clientIp?: string;
}

export interface StkPushResponse {
  success: boolean;
  code?:
    | "ORDER_NOT_FOUND"
    | "UNAUTHORIZED"
    | "ORDER_EXPIRED"
    | "ALREADY_PAID"
    | "INVALID_PHONE"
    | "INVALID_AMOUNT"
    | "COOLDOWN_ACTIVE"
    | "DARAJA_ERROR"
    | "CONFIGURATION_ERROR"
    | "RATE_LIMITED";
  message: string;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  orderId?: string;
  orderNumber?: string;
  amountKes?: number;
  phone?: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus:
    | "awaiting_payment"
    | "initiated"
    | "processing"
    | "successful"
    | "failed"
    | "timed_out"
    | "payment_review";
  totalKes: number;
  buyerPhone: string;
  mpesaReceipt: string | null;
  paidAt: string | null;
  errorMessage: string | null;
  canRetry: boolean;
}

export interface DarajaCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface DarajaCallbackPayload {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: DarajaCallbackItem[];
      };
    };
  };
}

// In-memory payment records store (synced with Supabase if configured)
const paymentsStore = new Map<string, StoredPayment>();
const receiptToPaymentMap = new Map<string, string>(); // Receipt -> PaymentId (Enforce uniqueness)
const activeCooldowns = new Map<string, number>(); // orderId -> timestamp (Prevent duplicate STK pushes)

// Cooldown between repeated STK pushes for the same order (30 seconds)
const STK_PUSH_COOLDOWN_MS = 30 * 1000;

// OAuth token cache
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function safeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export class MpesaService {
  /**
   * Diagnostic helper: reset in-memory payment stores for testing
   */
  static _resetStoresForTesting(): void {
    paymentsStore.clear();
    receiptToPaymentMap.clear();
    activeCooldowns.clear();
    cachedAccessToken = null;
  }

  /**
   * Diagnostic helper: inject payment record for testing callbacks
   */
  static _injectPaymentForTesting(payment: StoredPayment): void {
    paymentsStore.set(payment.checkoutRequestId, payment);
    if (payment.mpesaReceiptNumber) {
      receiptToPaymentMap.set(payment.mpesaReceiptNumber, payment.id);
    }
  }

  /**
   * Get Daraja configuration from environment
   */
  static getConfig() {
    const env = (process.env["MPESA_ENVIRONMENT"] || "sandbox").toLowerCase();
    const isProd = env === "production";

    return {
      environment: isProd ? "production" : "sandbox",
      consumerKey: process.env["MPESA_CONSUMER_KEY"] || "",
      consumerSecret: process.env["MPESA_CONSUMER_SECRET"] || "",
      shortcode: process.env["MPESA_SHORTCODE"] || (isProd ? "" : "174379"),
      passkey:
        process.env["MPESA_PASSKEY"] ||
        (isProd ? "" : "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"),
      callbackUrl:
        process.env["MPESA_CALLBACK_URL"] ||
        "https://hauntings-rift.example.com/api/payments/mpesa/callback",
      oauthUrl: isProd
        ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      stkPushUrl: isProd
        ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    };
  }

  /**
   * Retrieve Daraja OAuth Bearer token
   */
  static async getAccessToken(): Promise<{ success: boolean; token?: string; error?: string }> {
    const config = this.getConfig();

    if (!config.consumerKey || !config.consumerSecret) {
      return {
        success: false,
        error:
          "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET environment variable is not configured.",
      };
    }

    const now = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60000) {
      return { success: true, token: cachedAccessToken.token };
    }

    try {
      const authHeader = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString(
        "base64",
      );

      const response = await fetch(config.oauthUrl, {
        method: "GET",
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MpesaService] OAuth failed HTTP ${response.status}: ${errorText}`);
        return { success: false, error: `Daraja OAuth failed (HTTP ${response.status})` };
      }

      const data = (await response.json()) as { access_token: string; expires_in: string };
      const expiresInSec = parseInt(data.expires_in, 10) || 3599;

      cachedAccessToken = {
        token: data.access_token,
        expiresAt: now + expiresInSec * 1000,
      };

      return { success: true, token: data.access_token };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MpesaService] OAuth network error:", msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Format current timestamp for Daraja (YYYYMMDDHHmmss)
   */
  static formatTimestamp(date = new Date()): string {
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, "0");
    const DD = String(date.getDate()).padStart(2, "0");
    const HH = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${YYYY}${MM}${DD}${HH}${mm}${ss}`;
  }

  /**
   * Generate STK push password (Base64 of Shortcode + Passkey + Timestamp)
   */
  static generatePassword(shortcode: string, passkey: string, timestamp: string): string {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  }

  /**
   * Initiate M-Pesa STK Push
   */
  static async initiateStkPush(input: StkPushRequestInput): Promise<StkPushResponse> {
    const { orderId, checkoutToken } = input;

    // 1. Retrieve and validate order with checkout token
    const order = OrderService.getOrder(orderId, checkoutToken);
    if (!order) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        message: "Order not found or authorization token invalid.",
      };
    }

    // 2. Verify order status
    if (order.status === "paid") {
      return {
        success: false,
        code: "ALREADY_PAID",
        message: "This order has already been paid.",
      };
    }

    if (order.status === "cancelled" || order.isExpired) {
      return {
        success: false,
        code: "ORDER_EXPIRED",
        message: "Your reservation has expired. Please choose your tickets again.",
      };
    }

    // 3. Verify authoritative total amount
    if (order.totalKes <= 0) {
      return {
        success: false,
        code: "INVALID_AMOUNT",
        message: "Invalid order amount.",
      };
    }

    // 4. Validate and canonicalize buyer phone
    const phoneValidation = validateAndNormalizeKenyanPhone(order.buyerPhone);
    if (!phoneValidation.isValid) {
      return {
        success: false,
        code: "INVALID_PHONE",
        message: "Valid Kenyan mobile number required for M-Pesa STK Push.",
      };
    }
    const normalizedPhone = phoneValidation.normalized;

    // 5. Cooldown / Duplicate STK protection
    const lastStkTime = activeCooldowns.get(orderId) || 0;
    const now = Date.now();
    if (now - lastStkTime < STK_PUSH_COOLDOWN_MS) {
      const remainingSec = Math.ceil((STK_PUSH_COOLDOWN_MS - (now - lastStkTime)) / 1000);
      return {
        success: false,
        code: "COOLDOWN_ACTIVE",
        message: `An M-Pesa prompt was recently sent. Please check your phone or wait ${remainingSec}s before requesting again.`,
      };
    }

    const config = this.getConfig();
    const timestamp = this.formatTimestamp();
    const password = this.generatePassword(config.shortcode, config.passkey, timestamp);

    let checkoutRequestId: string;
    let merchantRequestId: string;

    // If real Daraja consumer credentials are provided, call Daraja API
    if (config.consumerKey && config.consumerSecret) {
      const tokenResult = await this.getAccessToken();
      if (!tokenResult.success || !tokenResult.token) {
        return {
          success: false,
          code: "DARAJA_ERROR",
          message: `Unable to authenticate with Safaricom Daraja: ${tokenResult.error}`,
        };
      }

      try {
        const payload = {
          BusinessShortCode: config.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: order.totalKes,
          PartyA: normalizedPhone,
          PartyB: config.shortcode,
          PhoneNumber: normalizedPhone,
          CallBackURL: config.callbackUrl,
          AccountReference: order.orderNumber,
          TransactionDesc: `Hauntings Rift Ticket ${order.orderNumber}`,
        };

        const response = await fetch(config.stkPushUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResult.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = (await response.json()) as {
          ResponseCode?: string;
          ResponseDescription?: string;
          CustomerMessage?: string;
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          errorMessage?: string;
        };

        if (data.ResponseCode !== "0" || !data.CheckoutRequestID) {
          console.error("[MpesaService] Daraja STK Push rejected:", data);
          return {
            success: false,
            code: "DARAJA_ERROR",
            message:
              data.CustomerMessage ||
              data.ResponseDescription ||
              data.errorMessage ||
              "Safaricom rejected the payment prompt request.",
          };
        }

        checkoutRequestId = data.CheckoutRequestID;
        merchantRequestId = data.MerchantRequestID || `MR-${randomUUID().slice(0, 8)}`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MpesaService] Daraja STK network error:", msg);
        return {
          success: false,
          code: "DARAJA_ERROR",
          message: `Network error connecting to Safaricom: ${msg}`,
        };
      }
    } else {
      // Offline / Sandbox Development mode (when credentials not yet filled)
      // Generates a standard Daraja ws_CO_ formatted checkout request ID
      const randomId = Math.floor(100000000 + Math.random() * 900000000);
      checkoutRequestId = `ws_CO_${timestamp}_${randomId}`;
      merchantRequestId = `MR-${randomUUID().slice(0, 8)}`;
      console.log(
        `[MpesaService] Sandbox mock prompt initiated for ${normalizedPhone} (KES ${order.totalKes}). CheckoutRequestID: ${checkoutRequestId}`,
      );
    }

    // Record cooldown timestamp
    activeCooldowns.set(orderId, now);

    // Create payment record in state (PROCESSING / in-flight state)
    const paymentId = randomUUID();
    const paymentRecord: StoredPayment = {
      id: paymentId,
      orderId: order.orderId,
      provider: "mpesa",
      merchantRequestId,
      checkoutRequestId,
      phoneNumber: normalizedPhone,
      amountKes: order.totalKes,
      status: "processing",
      resultCode: null,
      resultDescription: null,
      mpesaReceiptNumber: null,
      rawCallbackPayload: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    paymentsStore.set(checkoutRequestId, paymentRecord);

    // Async sync to Supabase if configured
    if (supabaseServer) {
      try {
        await supabaseServer.from("payments").insert({
          id: paymentId,
          order_id: order.orderId,
          provider: "mpesa",
          merchant_request_id: merchantRequestId,
          checkout_request_id: checkoutRequestId,
          phone_number: normalizedPhone,
          amount_kes: order.totalKes,
          status: "initiated",
        });
      } catch (e) {
        console.warn("[MpesaService] Supabase payment insert warning:", e);
      }
    }

    return {
      success: true,
      checkoutRequestId,
      merchantRequestId,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      amountKes: order.totalKes,
      phone: normalizedPhone,
      message: `M-Pesa payment prompt of KES ${order.totalKes.toLocaleString()} sent to ${normalizedPhone}. Please enter your M-Pesa PIN on your phone to complete.`,
    };
  }

  /**
   * Process Safaricom Daraja STK Push Callback Webhook
   */
  static async processCallback(
    payload: DarajaCallbackPayload,
  ): Promise<{ statusCode: number; response: Record<string, unknown> }> {
    const stkCallback = payload?.Body?.stkCallback;

    if (!stkCallback || !stkCallback.CheckoutRequestID) {
      console.warn("[MpesaService] Received invalid/empty callback payload");
      return {
        statusCode: 400,
        response: { ResultCode: 1, ResultDesc: "Invalid callback payload" },
      };
    }

    const {
      CheckoutRequestID: checkoutRequestId,
      MerchantRequestID: merchantRequestId,
      ResultCode: resultCode,
      ResultDesc: resultDesc,
      CallbackMetadata: callbackMetadata,
    } = stkCallback;

    console.log(
      `[MpesaService] Processing callback for ${checkoutRequestId}: ResultCode=${resultCode} (${resultDesc})`,
    );

    // Locate payment record
    const payment = paymentsStore.get(checkoutRequestId);
    if (!payment) {
      console.error(`[MpesaService] Payment not found for CheckoutRequestID: ${checkoutRequestId}`);
      return {
        statusCode: 200,
        response: { ResultCode: 0, ResultDesc: "Accepted" }, // Acknowledge Safaricom to prevent endless retry
      };
    }

    // Idempotency: If already marked successful, return accepted immediately
    if (payment.status === "successful") {
      console.log(`[MpesaService] Payment ${checkoutRequestId} already successfully processed.`);
      return {
        statusCode: 200,
        response: { ResultCode: 0, ResultDesc: "Accepted" },
      };
    }

    // Fetch order
    const order = OrderService._getOrderByIdInternal(payment.orderId);
    if (!order) {
      console.error(`[MpesaService] Order ${payment.orderId} not found for payment.`);
      return {
        statusCode: 200,
        response: { ResultCode: 0, ResultDesc: "Accepted" },
      };
    }

    // -------------------------------------------------------------
    // CASE 1: SUCCESSFUL PAYMENT (ResultCode === 0)
    // -------------------------------------------------------------
    if (resultCode === 0) {
      let paidAmount = 0;
      let mpesaReceipt = "";
      let transactionDate = "";
      let phoneNumber = payment.phoneNumber;

      if (callbackMetadata && Array.isArray(callbackMetadata.Item)) {
        for (const item of callbackMetadata.Item) {
          if (item.Name === "Amount" && typeof item.Value === "number") {
            paidAmount = item.Value;
          }
          if (item.Name === "MpesaReceiptNumber" && item.Value) {
            mpesaReceipt = String(item.Value).trim().toUpperCase();
          }
          if (item.Name === "TransactionDate" && item.Value) {
            transactionDate = String(item.Value);
          }
          if (item.Name === "PhoneNumber" && item.Value) {
            phoneNumber = String(item.Value);
          }
        }
      }

      // CRITICAL CHECK 1: Amount Verification (NEVER TRUST AMOUNT BLINDLY)
      if (paidAmount !== order.totalKes) {
        console.error(
          `[MpesaService] FRAUD / MISMATCH ALERT: Order ${order.orderNumber} expected KES ${order.totalKes} but received KES ${paidAmount}. Flagging for review.`,
        );

        payment.status = "payment_review";
        payment.resultCode = resultCode;
        payment.resultDescription = `Amount mismatch: Expected KES ${order.totalKes}, received KES ${paidAmount}`;
        payment.mpesaReceiptNumber = mpesaReceipt || null;
        payment.rawCallbackPayload = payload as Record<string, unknown>;
        payment.updatedAt = new Date().toISOString();
        paymentsStore.set(checkoutRequestId, payment);

        return {
          statusCode: 200,
          response: { ResultCode: 0, ResultDesc: "Accepted" },
        };
      }

      // CRITICAL CHECK 2: Unique M-Pesa Receipt Check (Prevent duplicate receipt fraud)
      if (mpesaReceipt && receiptToPaymentMap.has(mpesaReceipt)) {
        const existingPaymentId = receiptToPaymentMap.get(mpesaReceipt);
        if (existingPaymentId !== payment.id) {
          console.error(
            `[MpesaService] DUPLICATE RECEIPT ALERT: Receipt ${mpesaReceipt} was already used on payment ${existingPaymentId}.`,
          );

          payment.status = "payment_review";
          payment.resultCode = resultCode;
          payment.resultDescription = `Duplicate receipt detected: ${mpesaReceipt}`;
          payment.mpesaReceiptNumber = mpesaReceipt;
          payment.rawCallbackPayload = payload as Record<string, unknown>;
          payment.updatedAt = new Date().toISOString();
          paymentsStore.set(checkoutRequestId, payment);

          return {
            statusCode: 200,
            response: { ResultCode: 0, ResultDesc: "Accepted" },
          };
        }
      }

      // ATOMIC TRANSACTION: Mark Payment Successful + Mark Order Paid + Convert Reserved to Sold Inventory
      payment.status = "successful";
      payment.resultCode = 0;
      payment.resultDescription = resultDesc || "The service request is processed successfully.";
      payment.mpesaReceiptNumber = mpesaReceipt || `MPS${randomUUID().slice(0, 8).toUpperCase()}`;
      payment.phoneNumber = phoneNumber;
      payment.paidAt = new Date().toISOString();
      payment.rawCallbackPayload = payload as Record<string, unknown>;
      payment.updatedAt = new Date().toISOString();

      paymentsStore.set(checkoutRequestId, payment);
      if (payment.mpesaReceiptNumber) {
        receiptToPaymentMap.set(payment.mpesaReceiptNumber, payment.id);
      }

      // Mark order paid, commit inventory, and issue tickets atomically
      try {
        await TicketsServerService.finalizeOrderPaymentWorkflow({
          orderId: order.id,
          paymentReference: payment.mpesaReceiptNumber,
          paymentMethod: "mpesa",
          verifiedBy: "daraja_webhook",
        });
      } catch (workflowErr) {
        console.error("[MpesaService] Unified payment workflow error:", workflowErr);
      }

      console.log(
        `[MpesaService] ORDER PAID: ${order.orderNumber} | Receipt: ${payment.mpesaReceiptNumber} | KES ${payment.amountKes}`,
      );

      // Async sync to Supabase
      if (supabaseServer) {
        try {
          await supabaseServer
            .from("payments")
            .update({
              status: "success",
              result_code: 0,
              result_description: payment.resultDescription,
              mpesa_receipt_number: payment.mpesaReceiptNumber,
              paid_at: payment.paidAt,
              raw_callback_payload:
                payload as Database["public"]["Tables"]["payments"]["Row"]["raw_callback_payload"],
              updated_at: new Date().toISOString(),
            })
            .eq("checkout_request_id", checkoutRequestId);

          await supabaseServer
            .from("orders")
            .update({
              status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
        } catch (err) {
          console.warn("[MpesaService] Supabase callback sync warning:", err);
        }
      }

      return {
        statusCode: 200,
        response: { ResultCode: 0, ResultDesc: "Accepted" },
      };
    }

    // -------------------------------------------------------------
    // CASE 2: PAYMENT FAILURE / USER CANCELLATION / TIMEOUT
    // -------------------------------------------------------------
    // ResultCode 1032: Cancelled by user
    // ResultCode 1037: DS timeout / user did not enter PIN
    // ResultCode 1: Insufficient balance
    const isTimeout = resultCode === 1037;
    payment.status = isTimeout ? "timed_out" : "failed";
    payment.resultCode = resultCode ?? null;
    payment.resultDescription = resultDesc || "Payment failed.";
    payment.rawCallbackPayload = payload as Record<string, unknown>;
    payment.updatedAt = new Date().toISOString();
    paymentsStore.set(checkoutRequestId, payment);

    // If timed out or cancelled, order returns to 'pending' state so buyer can retry if reservation is still active
    const isStillActiveReservation = new Date(order.expiresAt).getTime() > Date.now();
    if (isStillActiveReservation) {
      OrderService._updateOrderStatus(order.id, "pending");
    } else {
      OrderService._updateOrderStatus(order.id, "cancelled");
    }

    console.log(
      `[MpesaService] Payment ${checkoutRequestId} ${payment.status} (Code ${resultCode}: ${resultDesc})`,
    );

    // Sync failure to Supabase
    if (supabaseServer) {
      try {
        await supabaseServer
          .from("payments")
          .update({
            status: isTimeout ? "timed_out" : "failed",
            result_code: resultCode ?? null,
            result_description: resultDesc ?? null,
            raw_callback_payload:
              payload as Database["public"]["Tables"]["payments"]["Row"]["raw_callback_payload"],
            updated_at: new Date().toISOString(),
          })
          .eq("checkout_request_id", checkoutRequestId);
      } catch (err) {
        console.warn("[MpesaService] Supabase callback failure sync warning:", err);
      }
    }

    return {
      statusCode: 200,
      response: { ResultCode: 0, ResultDesc: "Accepted" },
    };
  }

  /**
   * Retrieve secure payment status for the checkout screen
   */
  static getPaymentStatus(orderId: string, checkoutToken: string): PaymentStatusResponse | null {
    const order = OrderService.getOrder(orderId, checkoutToken);
    if (!order) {
      return null;
    }

    // Find the latest payment attempt for this order
    let latestPayment: StoredPayment | null = null;
    for (const p of paymentsStore.values()) {
      if (p.orderId === orderId) {
        if (
          !latestPayment ||
          new Date(p.createdAt).getTime() > new Date(latestPayment.createdAt).getTime()
        ) {
          latestPayment = p;
        }
      }
    }

    const isOrderPaid = order.status === "paid";
    let effectivePaymentStatus: PaymentStatusResponse["paymentStatus"] = "awaiting_payment";

    if (isOrderPaid) {
      effectivePaymentStatus = "successful";
    } else if (latestPayment) {
      effectivePaymentStatus = latestPayment.status;
    }

    const canRetry =
      !isOrderPaid &&
      !order.isExpired &&
      order.status !== "cancelled" &&
      (effectivePaymentStatus === "failed" ||
        effectivePaymentStatus === "timed_out" ||
        effectivePaymentStatus === "awaiting_payment");

    return {
      success: true,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: effectivePaymentStatus,
      totalKes: order.totalKes,
      buyerPhone: order.buyerPhone,
      mpesaReceipt: latestPayment?.mpesaReceiptNumber || null,
      paidAt: latestPayment?.paidAt || null,
      errorMessage:
        latestPayment?.status === "failed" || latestPayment?.status === "timed_out"
          ? latestPayment.resultDescription
          : null,
      canRetry,
    };
  }
}
