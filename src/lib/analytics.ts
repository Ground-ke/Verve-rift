import { logFirebaseAnalyticsEvent } from "./firebase/analytics-service";

/**
 * Central Analytics Helper Module
 * Supports event tracking across Firebase Firestore, GA4, Plausible, and local telemetry without blocking UI execution.
 */

declare global {
  interface Window {
    gtag?: (
      command: "event" | "config" | "set",
      action: string,
      params?: Record<string, unknown>,
    ) => void;
    plausible?: (eventName: string, options?: { props?: Record<string, unknown> }) => void;
    dataLayer?: unknown[];
  }
}

export interface AnalyticsEventPayload {
  eventName: string;
  properties?: Record<string, unknown>;
}

class AnalyticsService {
  private isInitialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.isInitialized = true;
    }
  }

  /**
   * Dispatch a generic analytics event to GA4, Plausible, and local telemetry
   */
  trackEvent(name: string, properties: Record<string, unknown> = {}): void {
    if (typeof window === "undefined") return;

    const payload = {
      ...properties,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };

    // 1. Google Analytics (GA4)
    if (typeof window.gtag === "function") {
      try {
        window.gtag("event", name, payload);
      } catch (err) {
        console.debug("[Analytics] GA4 dispatch error:", err);
      }
    }

    // 2. Firebase Firestore Real-Time Event Stream to Admin
    try {
      void logFirebaseAnalyticsEvent(name, payload);
    } catch (err) {
      console.debug("[Analytics] Firebase dispatch error:", err);
    }

    // 3. Plausible Analytics
    if (typeof window.plausible === "function") {
      try {
        window.plausible(name, { props: payload });
      } catch (err) {
        console.debug("[Analytics] Plausible dispatch error:", err);
      }
    }

    // 3. Structured Dev Telemetry Log
    if (process.env.NODE_ENV !== "production") {
      console.log(`%c[Analytics Event] ${name}`, "color: #e6a23c; font-weight: bold;", payload);
    }
  }

  /**
   * Track page navigation or initial entry
   */
  trackPageView(path?: string): void {
    this.trackEvent("page_view", {
      path: path || (typeof window !== "undefined" ? window.location.pathname : "/"),
      title: typeof document !== "undefined" ? document.title : "",
    });
  }

  /**
   * Track User viewing the event landing page or experience section
   */
  trackViewEvent(
    eventId = "hauntings-of-the-rift-2026",
    eventName = "Hauntings of the Rift",
  ): void {
    this.trackEvent("view_event", {
      event_id: eventId,
      event_name: eventName,
      location: "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
      date: "2026-10-31",
    });
  }

  /**
   * Track user entering the ticket checkout flow
   */
  trackBeginCheckout(tierSlug: string, quantity: number, totalKes: number): void {
    this.trackEvent("begin_checkout", {
      tier_slug: tierSlug,
      quantity,
      value_kes: totalKes,
      currency: "KES",
    });
  }

  /**
   * Track successful ticket purchase
   */
  trackPurchaseCompleted(
    orderId: string,
    totalKes: number,
    ticketCount: number,
    paymentMethod = "mpesa",
  ): void {
    this.trackEvent("purchase", {
      transaction_id: orderId,
      value_kes: totalKes,
      currency: "KES",
      items_count: ticketCount,
      payment_type: paymentMethod,
    });
  }

  /**
   * Track Gate Check-in Scan result
   */
  trackScanTicket(ticketCode: string, status: "valid" | "duplicate" | "invalid", tier = ""): void {
    this.trackEvent("scan_ticket", {
      ticket_code: ticketCode,
      scan_status: status,
      ticket_tier: tier,
    });
  }

  /**
   * Track Refund Processing
   */
  trackRefundIssued(orderId: string, amountKes: number, reason: string): void {
    this.trackEvent("refund_processed", {
      order_id: orderId,
      amount_kes: amountKes,
      reason,
      currency: "KES",
    });
  }
}

export const analytics = new AnalyticsService();
