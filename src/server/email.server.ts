import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import {
  generateBookingConfirmationEmailHtml,
  generateEventReminder24hEmailHtml,
  generateRefundNoticeEmailHtml,
  generateMpesaReceivedEmailHtml,
  type TicketEmailItem,
} from "../lib/email-templates";
import { generateTicketPdfBuffer, generatePureJsPdfTicket } from "./pdf-ticket";

export {
  generateBookingConfirmationEmailHtml,
  generateEventReminder24hEmailHtml,
  generateRefundNoticeEmailHtml,
  generateMpesaReceivedEmailHtml,
  type TicketEmailItem,
};

type SmtpTransporter = ReturnType<typeof nodemailer.createTransport>;
let smtpTransporter: SmtpTransporter | null = null;
let smtpConfigKey = "";

export function resolveSmtpCredentials(): { user: string; pass: string } | null {
  const rawUser =
    process.env["SMTP_USER"] ||
    process.env["SMTP_USERNAME"] ||
    process.env["GMAIL_USER"] ||
    process.env["GMAIL_EMAIL"] ||
    process.env["EMAIL_USER"] ||
    process.env["VITE_SMTP_USER"] ||
    process.env["VITE_GMAIL_USER"] ||
    "verve.n.co.ke@gmail.com";
  const rawPass =
    process.env["SMTP_PASS"] ||
    process.env["SMTP_PASSWORD"] ||
    process.env["GMAIL_APP_PASSWORD"] ||
    process.env["GMAIL_PASS"] ||
    process.env["GMAIL_PASSWORD"] ||
    process.env["GOOGLE_APP_PASSWORD"] ||
    process.env["EMAIL_PASS"] ||
    process.env["EMAIL_PASSWORD"] ||
    process.env["APP_PASSWORD"] ||
    process.env["VITE_GMAIL_APP_PASSWORD"] ||
    process.env["VITE_SMTP_PASS"];

  if (!rawPass || !rawPass.trim()) return null;

  return {
    user: rawUser.trim(),
    // Strip whitespace from passwords (Google App Passwords frequently have spaces like 'xxxx yyyy zzzz wwww')
    pass: rawPass.replace(/\s+/g, ""),
  };
}

export function isGmailSmtpConfigured(): boolean {
  return resolveSmtpCredentials() !== null;
}

/**
 * Configure Nodemailer SMTP Transporter
 * Supports standard Vercel environment variables:
 * - SMTP_USER / SMTP_USERNAME / GMAIL_USER / EMAIL_USER (defaults to verve.n.co.ke@gmail.com)
 * - SMTP_PASS / SMTP_PASSWORD / GMAIL_APP_PASSWORD / GMAIL_PASSWORD / EMAIL_PASS
 * - SMTP_HOST / EMAIL_HOST (defaults to smtp.gmail.com)
 * - SMTP_PORT / EMAIL_PORT (defaults to 465)
 * - SMTP_SECURE
 */
export function getSmtpTransporter(): SmtpTransporter | null {
  const creds = resolveSmtpCredentials();
  if (!creds) return null;

  const host = process.env["SMTP_HOST"] || process.env["EMAIL_HOST"] || "smtp.gmail.com";
  const port = Number(process.env["SMTP_PORT"] || process.env["EMAIL_PORT"]) || 465;
  const isExplicitSecure = process.env["SMTP_SECURE"] !== undefined;
  const secure = isExplicitSecure ? process.env["SMTP_SECURE"] === "true" : port === 465;
  const currentKey = `${host}:${port}:${secure}:${creds.user}:${creds.pass}`;

  if (!smtpTransporter || smtpConfigKey !== currentKey) {
    smtpConfigKey = currentKey;
    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    });
  }
  return smtpTransporter;
}

/**
 * Helper to get the canonical base URL for emails and links
 */
export function getSiteBaseUrl(): string {
  const configuredUrl =
    process.env["SITE_URL"] || process.env["PUBLIC_SITE_URL"] || process.env["APP_URL"];
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (process.env["VERCEL_PROJECT_PRODUCTION_URL"]) {
    return `https://${process.env["VERCEL_PROJECT_PRODUCTION_URL"]}`;
  }
  if (process.env["VERCEL_URL"]) return `https://${process.env["VERCEL_URL"]}`;
  return "https://verve-rift.vercel.app";
}

/**
 * Standard Email Dispatcher
 * Exclusively routes through Gmail SMTP (Nodemailer) from verve.n.co.ke@gmail.com.
 * Supports inline CID attachments (images, QR) and documents (PDF, ICS).
 * Safely simulates/logs in development if credentials have not been configured yet.
 */
async function dispatchEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    encoding?: string;
    contentType?: string;
    cid?: string;
  }>;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const smtpUser =
    process.env["SMTP_USER"] ||
    process.env["SMTP_USERNAME"] ||
    process.env["GMAIL_USER"] ||
    process.env["EMAIL_USER"];
  const defaultFrom =
    process.env["EMAIL_FROM"] ||
    (smtpUser
      ? `"Verve & Co." <${smtpUser}>`
      : '"Verve & Co." <verve.n.co.ke@gmail.com>');

  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: defaultFrom,
        to,
        subject,
        html,
        attachments: attachments?.map((att) => {
          const encoding = att.encoding || (typeof att.content === "string" ? "base64" : undefined);
          return {
            filename: att.filename,
            content: att.content,
            ...(encoding ? { encoding } : {}),
            ...(att.contentType ? { contentType: att.contentType } : {}),
            ...(att.cid ? { cid: att.cid } : {}),
          };
        }),
      });
      return { success: true, id: info.messageId };
    } catch (smtpErr) {
      console.error("[SMTP Error] Failed sending via Gmail SMTP:", smtpErr);
      return {
        success: false,
        error: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
      };
    }
  }

  // Missing SMTP credentials are a delivery failure, not a preview mode.
  return {
    success: false,
    simulated: false,
    error: "Email delivery is not configured; the message was not sent.",
  };
}

// -----------------------------------------------------------------------------
// Calendar Utilities
// -----------------------------------------------------------------------------

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string for calendar apps
 */
export function generateEventIcs({
  ticketCode,
  customerName,
  ticketTier,
  venueName = "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
}: {
  ticketCode: string;
  customerName: string;
  ticketTier: string;
  venueName?: string;
}): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  // The event date and start time are confirmed; no end time has been supplied.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Verve & Co.//Hauntings of the Rift//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:hauntings-rift-${ticketCode}@verve.co.ke`,
    `DTSTAMP:${now}`,
    "DTSTART;VALUE=DATE:20261031",
    "DTEND;VALUE=DATE:20261101",
    "SUMMARY:Hauntings of the Rift",
    `DESCRIPTION:Event starts at 4 PM and runs till late. Ticket: ${ticketCode}\\nGuest: ${customerName}\\nTier: ${ticketTier}\\nVenue: ${venueName}\\nAge requirement: 18+.`,
    "LOCATION:Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru, Kenya",
    "STATUS:CONFIRMED",
    "ORGANIZER;CN=Verve & Co.:mailto:verve.n.co.ke@gmail.com",
    "SEQUENCE:0",
    "PRIORITY:5",
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Hauntings of the Rift takes place on 31 October 2026.",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// -----------------------------------------------------------------------------
// Dispatch Methods
// -----------------------------------------------------------------------------

/**
 * Sends official ticket confirmation email matching the exact template:
 * - Full-width event artwork banner
 * - Dark subtitle header strip
 * - Personalized greeting & RSVP code
 * - Centered high-contrast QR code
 * - [ View Ticket PDF ] primary action button
 * - Add to calendar link
 * - Attached real Ticket-[CODE].pdf
 * - Attached Event-[CODE].ics
 * - Embedded inline CID QR code and banner
 */
export async function sendTicketConfirmationEmail(params: {
  to: string;
  buyerName?: string;
  attendeeName?: string;
  customerName?: string;
  orderNumber?: string;
  ticketCode?: string;
  totalKes?: number;
  ticketTier?: string;
  tierName?: string;
  quantity?: number;
  admitsCount?: number;
  ticketUrl?: string;
  pdfUrl?: string;
  tickets?: TicketEmailItem[];
  venueName?: string;
  eventDate?: string;
  qrHash?: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const name = params.buyerName || params.attendeeName || params.customerName || "Valued Attendee";
  const firstTicket = params.tickets?.[0];
  const code = params.ticketCode || firstTicket?.ticketNumber;
  const tier = params.ticketTier || params.tierName || firstTicket?.tierName;
  const qty = params.quantity ?? params.tickets?.length ?? (params.ticketCode ? 1 : undefined);
  const admitsCount = params.admitsCount ?? firstTicket?.admitsCount;
  const total = params.totalKes;
  const qrHash = params.qrHash || firstTicket?.qrHash;
  if (
    !code ||
    !tier ||
    !Number.isInteger(qty) ||
    !qty ||
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total < 0 ||
    !Number.isInteger(admitsCount) ||
    !admitsCount ||
    !qrHash
  ) {
    return {
      success: false,
      error:
        "Ticket email requires an issued ticket code, QR signature, tier, quantity, admits count, and total.",
    };
  }
  const venue = params.venueName || "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru";
  const eventDate = params.eventDate || "Saturday, 31 October 2026";
  const siteUrl = getSiteBaseUrl();
  const primaryTicketUrl =
    params.ticketUrl ||
    (params.tickets && params.tickets[0]?.ticketUrl) ||
    `${siteUrl}/ticket/${code}`;
  const primaryPdfUrl = params.pdfUrl || `${siteUrl}/api/tickets/${code}/pdf`;

  // 1. Authoritatively Generate PDF Ticket Pass
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateTicketPdfBuffer({
      ticketCode: code,
      customerName: name,
      tierName: tier,
      admitsCount,
      orderNumber: params.orderNumber || code,
      totalKes: total,
      qrHash,
      eventDate,
      venueName: venue,
    });
  } catch (pdfErr) {
    console.warn("[PDF Gen] Using direct vector PDF fallback:", pdfErr);
    pdfBuffer = await generatePureJsPdfTicket({
      ticketCode: code,
      customerName: name,
      tierName: tier,
      admitsCount,
      orderNumber: params.orderNumber || code,
      totalKes: total,
      qrHash,
      eventDate,
      venueName: venue,
    });
  }

  // 2. Generate standard iCalendar (.ics) attachment
  const icsContent = generateEventIcs({
    ticketCode: code,
    customerName: name,
    ticketTier: tier,
    venueName: venue,
  });
  const icsBuffer = Buffer.from(icsContent, "utf-8");

  // 3. Generate high-resolution QR code PNG buffer for CID embedding
  const qrPayload = JSON.stringify({
    code,
    order: params.orderNumber || code,
    tier,
    holder: name,
    admits: admitsCount,
    hash: qrHash,
    event: "HALLOWEEN_RIFT_2026",
  });
  let qrBuffer: Buffer;
  let qrDataUrl = "";
  try {
    qrBuffer = await QRCode.toBuffer(qrPayload, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "H",
    });
    qrDataUrl = `data:image/png;base64,${qrBuffer.toString("base64")}`;
  } catch (qrErr) {
    console.warn("[QR Gen Warning]:", qrErr);
    qrBuffer = Buffer.from("");
  }

  // 4. Read hero banner image for CID embedding
  let bannerBuffer: Buffer | null = null;
  try {
    const bannerPath = path.resolve(process.cwd(), "public/event-banner.jpg");
    if (fs.existsSync(bannerPath)) {
      bannerBuffer = fs.readFileSync(bannerPath);
    }
  } catch {
    bannerBuffer = null;
  }

  // 5. Generate Email HTML matching template
  const emailHtml = generateBookingConfirmationEmailHtml({
    customer_name: name,
    ticket_tier: tier,
    quantity: qty,
    total_amount: total.toLocaleString(),
    order_id: code,
    event_date: eventDate,
    ticket_url: primaryTicketUrl,
    pdf_url: primaryPdfUrl,
    ...(bannerBuffer ? { banner_cid: "event-banner" } : {}),
    banner_url: `${siteUrl}/event-banner.jpg`,
    ...(qrBuffer.length > 0 ? { qr_code_cid: "ticket-qr" } : {}),
    qr_data_url: qrDataUrl,
    venue_name: venue,
  });

  // 6. Assemble attachments
  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    cid?: string;
  }> = [
    {
      filename: `Ticket-${code}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    },
    {
      filename: `Event-${code}.ics`,
      content: icsBuffer,
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    },
  ];

  if (bannerBuffer) {
    attachments.push({
      filename: "event-banner.jpg",
      content: bannerBuffer,
      contentType: "image/jpeg",
      cid: "event-banner",
    });
  }

  if (qrBuffer.length > 0) {
    attachments.push({
      filename: "ticket-qr.png",
      content: qrBuffer,
      contentType: "image/png",
      cid: "ticket-qr",
    });
  }

  return dispatchEmail({
    to: params.to,
    subject: "Your Ticket for Hauntings of the Rift",
    html: emailHtml,
    attachments,
  });
}

/**
 * Sends 24-Hour Event Reminder Email
 */
export async function sendEventReminder24hEmail({
  to,
  customerName,
  venueName = "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
  gateOpeningTime = "16:00 EAT",
  ticketTier = "General Admission Pass",
  ticketUrl = "https://hauntingsoftherift.co.ke",
}: {
  to: string;
  customerName: string;
  venueName?: string;
  gateOpeningTime?: string;
  ticketTier?: string;
  ticketUrl?: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const emailHtml = generateEventReminder24hEmailHtml({
    customer_name: customerName,
    venue_name: venueName,
    gate_opening_time: gateOpeningTime,
    ticket_tier: ticketTier,
    ticket_url: ticketUrl,
  });

  return dispatchEmail({
    to,
    subject: "24 Hours Until Hauntings of the Rift — Gate & Arrival Instructions",
    html: emailHtml,
  });
}

/**
 * Sends Refund Confirmation Email
 */
export async function sendRefundNoticeEmail({
  to,
  customerName,
  refundAmount,
  paymentRef,
  refundReason,
  orderId,
}: {
  to: string;
  customerName: string;
  refundAmount: number | string;
  paymentRef: string;
  refundReason: string;
  orderId: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const formattedAmount =
    typeof refundAmount === "number" ? refundAmount.toLocaleString() : refundAmount;

  const emailHtml = generateRefundNoticeEmailHtml({
    customer_name: customerName,
    refund_amount: formattedAmount,
    payment_ref: paymentRef,
    refund_reason: refundReason,
    order_id: orderId,
  });

  return dispatchEmail({
    to,
    subject: `Refund Processed — Hauntings of the Rift (${orderId})`,
    html: emailHtml,
  });
}

/**
 * Sends recovery link email with cryptographic access token
 */
export async function sendRecoveryEmail({
  to,
  recoveryUrl,
  ticketsCount,
  links,
}: {
  to: string;
  recoveryUrl?: string;
  ticketsCount?: number;
  name?: string;
  links?: Array<{ code?: string; tierName?: string; url: string }>;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const resolvedUrl = recoveryUrl || links?.[0]?.url || `${getSiteBaseUrl()}/recover`;
  const resolvedCount = ticketsCount ?? (links ? Math.max(1, links.length) : 1);
  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background:#09080D; font-family:sans-serif; color:#F5F2EB; margin:0; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#0F0D15; border:1px solid #28212D; padding:28px; border-radius:8px;">
          <div style="text-align:center; border-bottom:1px solid #28212D; padding-bottom:16px; margin-bottom:20px;">
            <p style="color:#C9A84C; font-size:11px; text-transform:uppercase; letter-spacing:0.2em; margin:0 0 6px 0;">Verve & Co.</p>
            <h1 style="color:#F5F2EB; font-size:22px; margin:0;">TICKET RECOVERY PORTAL</h1>
          </div>

          <p style="font-size:14px; line-height:1.6; color:#D5CFDE;">
            We received a request to access and recover digital event passes for <strong>Hauntings of the Rift</strong> associated with <strong>${to}</strong>.
          </p>

          <p style="font-size:14px; line-height:1.6; color:#A09BA8;">
            We found <strong style="color:#F5F2EB;">${resolvedCount}</strong> ticket pass(es) linked to your records. Click the button below to view and download your passes. This secure link is valid for 1 hour.
          </p>

          <div style="text-align:center; margin:28px 0;">
            <a href="${resolvedUrl}" style="background:#8A1C2C; color:#FFFFFF; padding:12px 28px; text-decoration:none; font-weight:bold; font-size:15px; border-radius:4px; display:inline-block; letter-spacing:0.05em;">
              ACCESS MY DIGITAL TICKETS
            </a>
          </div>

          <p style="font-size:12px; color:#787182; line-height:1.4;">
            If you did not request this recovery link, you can safely disregard this email. Your tickets remain secure and accessible only through your verified link.
          </p>

          <div style="text-align:center; margin-top:28px; border-top:1px solid #28212D; padding-top:16px;">
            <p style="color:#6A6372; font-size:11px; margin:0;">
              Hauntings of the Rift • Verve &amp; Co. Security
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return dispatchEmail({
    to,
    subject: "Access Your Event Tickets — Hauntings of the Rift",
    html: emailHtml,
  });
}

/**
 * Sends a custom email broadcast to a buyer or list of attendees
 */
export async function sendBroadcastEmail({
  to,
  subject,
  headline,
  message,
  ctaText,
  ctaUrl,
}: {
  to: string | string[];
  subject: string;
  headline: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const formattedMessage = message
    .split("\n\n")
    .map(
      (p) =>
        `<p style="font-size:15px; line-height:1.7; color:#D5CFDE; margin:0 0 16px 0;">${p.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background:#09080D; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#F5F2EB; margin:0; padding:24px;">
        <div style="max-width:580px; margin:0 auto; background:#120E17; border:1px solid #332338; padding:32px; border-radius:12px; box-shadow:0 12px 36px rgba(0,0,0,0.6);">
          <div style="text-align:center; border-bottom:1px dashed #3D2644; padding-bottom:20px; margin-bottom:24px;">
            <p style="color:#F59E0B; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.25em; margin:0 0 8px 0;">Official Event Broadcast</p>
            <h1 style="color:#F5F2EB; font-size:24px; font-weight:700; letter-spacing:-0.02em; margin:0 0 4px 0;">${headline}</h1>
            <p style="color:#9CA3AF; font-size:12px; margin:0;">Hauntings of the Rift • Verve &amp; Co.</p>
          </div>

          <div style="padding:4px 0;">
            ${formattedMessage}
          </div>

          ${
            ctaText && ctaUrl
              ? `
          <div style="text-align:center; margin:32px 0 24px 0;">
            <a href="${ctaUrl}" style="background:#991B1B; color:#FFFFFF; padding:14px 32px; text-decoration:none; font-weight:700; font-size:14px; border-radius:6px; display:inline-block; letter-spacing:0.06em; text-transform:uppercase;">
              ${ctaText}
            </a>
          </div>
          `
              : ""
          }

          <div style="margin-top:32px; border-top:1px solid #281D2E; padding-top:20px; text-align:center;">
            <p style="color:#71677A; font-size:11px; line-height:1.5; margin:0 0 6px 0;">
              You received this notice because you purchased a pass or subscribed to updates for Hauntings of the Rift.
            </p>
            <p style="color:#574E60; font-size:11px; margin:0;">
              Top Cliff Lodge, Nakuru • 31 October 2026 • 18+
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return dispatchEmail({
    to,
    subject,
    html: emailHtml,
  });
}

/**
 * Sends automated M-Pesa submission acknowledgment email to customer
 * Confirms receipt of a payment claim without implying that payment was verified.
 */
export async function sendMpesaReceivedAcknowledgmentEmail(params: {
  to: string;
  customerName?: string;
  orderNumber: string;
  mpesaCode: string;
  ticketTier?: string;
  quantity?: number;
  totalKes?: number;
  orderId?: string;
  checkoutToken?: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  if (
    !params.ticketTier ||
    !Number.isInteger(params.quantity) ||
    !params.quantity ||
    typeof params.totalKes !== "number" ||
    !Number.isFinite(params.totalKes) ||
    params.totalKes < 0
  ) {
    return {
      success: false,
      error:
        "Payment acknowledgment requires the server-calculated ticket tier, quantity, and order total.",
    };
  }

  const siteUrl = getSiteBaseUrl();
  const orderUrl = params.orderId
    ? `${siteUrl}/pay?order=${params.orderId}${params.checkoutToken ? `&token=${params.checkoutToken}` : ""}`
    : `${siteUrl}/recover`;

  const emailHtml = generateMpesaReceivedEmailHtml({
    customer_name: params.customerName || "Valued Attendee",
    order_number: params.orderNumber,
    mpesa_code: params.mpesaCode,
    ticket_tier: params.ticketTier,
    quantity: params.quantity,
    total_amount: params.totalKes,
    order_url: orderUrl,
    event_date: "Saturday, 31 October 2026",
    venue_name: "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
  });

  return dispatchEmail({
    to: params.to,
    subject: `M-Pesa payment claim received for order #${params.orderNumber} — Hauntings of the Rift`,
    html: emailHtml,
  });
}

/**
 * Notifies the organizer inbox (verve.n.co.ke@gmail.com) of an incoming M-Pesa transaction awaiting review
 */
export async function sendOrganizerNewMpesaNotification(params: {
  orderNumber: string;
  mpesaCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  ticketTier: string;
  quantity: number;
  totalKes: number;
  rawMessage?: string;
  orderId?: string;
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const organizerEmail =
    process.env["ORGANIZER_EMAIL"] || process.env["SMTP_USER"] || "verve.n.co.ke@gmail.com";
  const siteUrl = getSiteBaseUrl();
  const targetId = params.orderId || params.orderNumber;
  const adminUrl = `${siteUrl}/admin?tab=verifications&order=${encodeURIComponent(targetId)}`;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background:#09080D; font-family:monospace; color:#F5F2EB; margin:0; padding:20px;">
        <div style="max-width:540px; margin:0 auto; background:#120E17; border:1px solid #C9A84C; padding:24px; border-radius:8px;">
          <h2 style="color:#C9A84C; margin:0 0 12px 0; font-size:16px;">[ACTION REQUIRED] New M-Pesa Payment Submitted</h2>
          <p style="font-size:13px; color:#D5CFDE; margin:0 0 16px 0;">
            A customer submitted an M-Pesa transaction reference for verification in the admin console.
          </p>
          <div style="background:#0A080E; border:1px solid #28212D; padding:16px; border-radius:6px; font-size:13px; line-height:1.6; margin-bottom:20px;">
            <div><strong>Order:</strong> #${params.orderNumber}</div>
            <div><strong>M-Pesa Code:</strong> <span style="color:#E5C365; font-weight:bold;">${params.mpesaCode}</span></div>
            <div><strong>Customer:</strong> ${params.customerName} (${params.customerEmail})</div>
            <div><strong>Phone:</strong> ${params.customerPhone || "N/A"}</div>
            <div><strong>Pass:</strong> ${params.ticketTier} (x${params.quantity})</div>
            <div><strong>Expected Amount:</strong> KES ${params.totalKes.toLocaleString()}</div>
            ${params.rawMessage ? `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #332B3A; color:#A09BA8; font-size:11px;"><em>Raw Input:</em> ${params.rawMessage}</div>` : ""}
          </div>
          <div style="text-align:center;">
            <a href="${adminUrl}" style="background:#8A1C2C; color:#FFFFFF; padding:10px 24px; text-decoration:none; font-weight:bold; font-size:12px; border-radius:4px; display:inline-block;">
              OPEN M-PESA VERIFICATION QUEUE &rarr;
            </a>
          </div>
        </div>
      </body>
    </html>
  `;

  return dispatchEmail({
    to: organizerEmail,
    subject: `🔔 New M-Pesa Payment: ${params.mpesaCode} (Order #${params.orderNumber} - KES ${params.totalKes})`,
    html: emailHtml,
  });
}
