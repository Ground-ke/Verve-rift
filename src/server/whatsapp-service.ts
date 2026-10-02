/**
 * Automated WhatsApp Customer Notification Engine
 * Dispatches transactional notifications with template variables via Meta / WhatsApp Business API.
 */

export type WhatsAppTemplateType =
  "booking_confirmation" | "event_reminder_24h" | "refund_notice" | "gate_alert";

export interface BookingConfirmationParams {
  customerName: string;
  passTierAndQuantity: string;
  orderId: string;
  ticketAccessUrl: string;
}

export interface EventReminder24hParams {
  customerName: string;
  venueNameOrLocation: string;
  gateOpeningTime: string;
  fastPassLink: string;
}

export interface RefundNoticeParams {
  customerName: string;
  refundAmountKes: number | string;
  paymentProviderRef: string;
  reasonOrDetails: string;
  orderId?: string;
}

export interface GateAlertParams {
  customerName: string;
  ticketCode: string;
}

export interface WhatsAppNotificationPayload {
  recipientPhone: string;
  template: WhatsAppTemplateType;
  // Generic or typed variables
  params?: {
    // 1. booking_confirmation
    customerName?: string;
    passTierAndQuantity?: string;
    orderId?: string;
    ticketAccessUrl?: string;

    // 2. event_reminder_24h
    venueNameOrLocation?: string;
    gateOpeningTime?: string;
    fastPassLink?: string;

    // 3. refund_notice
    refundAmountKes?: number | string;
    paymentProviderRef?: string;
    reasonOrDetails?: string;

    // Legacy / optional aliases
    attendeeName?: string;
    ticketCode?: string;
    tierName?: string;
    orderNumber?: string;
    totalKes?: number;
    directTicketUrl?: string;
    venueName?: string;
    eventDate?: string;
    eventTime?: string;
  };
}

export interface WhatsAppDispatchResult {
  success: boolean;
  messageId?: string;
  status: "accepted" | "failed";
  providerStatus: string;
  error?: string;
  recipient: string;
  template: WhatsAppTemplateType;
  metaParameters: string[];
  formattedMessage: string;
  timestamp: string;
}

export class WhatsAppNotificationService {
  /**
   * Get Meta API parameters array: {{1}}, {{2}}, {{3}}, {{4}}
   */
  static getMetaParameters(
    template: WhatsAppTemplateType,
    params: NonNullable<WhatsAppNotificationPayload["params"]>,
  ): string[] {
    const customerName = params.customerName || params.attendeeName || "";

    switch (template) {
      case "booking_confirmation": {
        // Meta API Parameters: {{1}} = Customer Name, {{2}} = Pass Tier & Quantity, {{3}} = Order ID, {{4}} = Ticket Access URL
        const passDetails =
          params.passTierAndQuantity || (params.tierName ? `${params.tierName} (x1)` : "");
        const orderId = params.orderId || params.orderNumber || "";
        const ticketUrl = params.ticketAccessUrl || params.directTicketUrl || "";
        return [customerName, passDetails, orderId, ticketUrl];
      }

      case "event_reminder_24h": {
        // Meta API Parameters: {{1}} = Customer Name, {{2}} = Venue Name/Location, {{3}} = Gate Opening Time, {{4}} = Fast Pass Link
        const venue = params.venueNameOrLocation || params.venueName || "";
        const gateTime = params.gateOpeningTime || "";
        const fastPassLink =
          params.fastPassLink || params.directTicketUrl || params.ticketAccessUrl || "";
        return [customerName, venue, gateTime, fastPassLink];
      }

      case "refund_notice": {
        // Meta API Parameters: {{1}} = Customer Name, {{2}} = Refund Amount (KES), {{3}} = Payment Provider Ref / M-Pesa Receipt Number, {{4}} = Reason/Details
        const amount = String(
          params.refundAmountKes !== undefined ? params.refundAmountKes : params.totalKes || "",
        );
        const ref = params.paymentProviderRef || params.orderNumber || "";
        const reason = params.reasonOrDetails || "";
        return [customerName, amount, ref, reason];
      }

      case "gate_alert": {
        return [customerName, params.ticketCode || ""];
      }

      default:
        return [customerName];
    }
  }

  /**
   * Format plaintext message according to exact template specification
   */
  static formatMessage(payload: WhatsAppNotificationPayload): string {
    const { template, params = {} } = payload;
    const metaParams = this.getMetaParameters(template, params);

    switch (template) {
      case "booking_confirmation": {
        const [p1, p2, p3, p4] = metaParams;
        return [
          `🎃 *HAUNTINGS OF THE RIFT — TICKET CONFIRMED* 🎃`,
          ``,
          `Hey ${p1}! Your entry pass is secured. Get ready for an unforgettable night at the Rift.`,
          ``,
          `🎟️ *Pass Details:* ${p2}`,
          `🧾 *Order ID:* ${p3}`,
          ``,
          `👇 *Access Your Digital Pass & QR Code:*`,
          `${p4}`,
          ``,
          `⚠️ *Important Gate Rules:*`,
          `• Bring a valid ID matching your registration details.`,
          `• Keep your QR code saved offline or loaded before arrival at the gate.`,
          `• Passes are single-entry only.`,
          ``,
          `Need help? Reply directly to this message.`,
        ].join("\n");
      }

      case "event_reminder_24h": {
        const [p1, p2, p3, p4] = metaParams;
        return [
          `🔥 *24 HOURS TO HAUNTINGS OF THE RIFT* 🔥`,
          ``,
          `Hey ${p1}, tomorrow is the night! Gates open in less than 24 hours.`,
          ``,
          `📍 *Venue:* ${p2}`,
          `⏰ *Gates Open:* ${p3}`,
          ``,
          `⚡ *Fast-Track Gate Check-in:*`,
          `Have your digital pass open and saved on your phone before arriving at the security turnstiles:`,
          `${p4}`,
          ``,
          `🚗 *Gate Tip:* Traffic builds up quickly near the entrance. Arrive early to clear security and skip the queues.`,
          ``,
          `See you in the Rift!`,
        ].join("\n");
      }

      case "refund_notice": {
        const [p1, p2, p3, p4] = metaParams;
        return [
          `ℹ️ *EXTERNAL REVERSAL REFERENCE RECORDED*`,
          ``,
          `Hello ${p1},`,
          ``,
          `The organizer recorded an external M-Pesa reversal reference for your Hauntings of the Rift order.`,
          ``,
          `💰 *Recorded amount:* KES ${p2}`,
          `🧾 *Organizer-provided reference:* ${p3}`,
          `📌 *Reason:* ${p4}`,
          ``,
          `The reversal was processed outside this app; this message does not confirm receipt of funds. Contact the organizer or M-Pesa to verify its status.`,
        ].join("\n");
      }

      case "gate_alert": {
        const [p1, p2] = metaParams;
        return [
          `✅ *GATE CHECK-IN CONFIRMED*`,
          `Welcome to Hauntings of the Rift, *${p1}*!`,
          `Pass *${p2}* was verified at the entrance gate. Enjoy the night! 🍸`,
        ].join("\n");
      }

      default:
        return `Notification from Verve & Co. regarding Hauntings of the Rift.`;
    }
  }

  /**
   * Dispatch notification to recipient phone number
   */
  static async sendNotification(
    payload: WhatsAppNotificationPayload,
  ): Promise<WhatsAppDispatchResult> {
    const formattedMessage = this.formatMessage(payload);
    const metaParams = this.getMetaParameters(payload.template, payload.params || {});
    const cleanPhone = payload.recipientPhone.replace(/[^0-9+]/g, "");
    const timestamp = new Date().toISOString();

    const apiKey = process.env["WHATSAPP_API_KEY"];
    const endpoint = process.env["WHATSAPP_API_URL"];

    if (!apiKey || !endpoint) {
      return {
        success: false,
        status: "failed",
        providerStatus: "not_configured",
        error: "WhatsApp delivery is not configured.",
        recipient: cleanPhone,
        template: payload.template,
        metaParameters: metaParams,
        formattedMessage,
        timestamp,
      };
    }

    try {
      // Dispatch Meta Cloud API template payload if template specified
      const bodyPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: payload.template,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: metaParams.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      let providerResponse: {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      } = {};
      try {
        providerResponse = (await response.json()) as typeof providerResponse;
      } catch {
        providerResponse = {};
      }
      const messageId = providerResponse.messages?.[0]?.id;
      if (response.ok && messageId) {
        return {
          success: true,
          messageId,
          status: "accepted",
          providerStatus: `http_${response.status}`,
          recipient: cleanPhone,
          template: payload.template,
          metaParameters: metaParams,
          formattedMessage,
          timestamp,
        };
      }
      return {
        success: false,
        status: "failed",
        providerStatus: `http_${response.status}`,
        error: providerResponse.error?.message || "WhatsApp provider did not accept the message.",
        recipient: cleanPhone,
        template: payload.template,
        metaParameters: metaParams,
        formattedMessage,
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        status: "failed",
        providerStatus: "transport_error",
        error: error instanceof Error ? error.message : "WhatsApp provider request failed.",
        recipient: cleanPhone,
        template: payload.template,
        metaParameters: metaParams,
        formattedMessage,
        timestamp,
      };
    }
  }
}
