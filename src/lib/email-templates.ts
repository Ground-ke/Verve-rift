export interface TicketEmailItem {
  ticketNumber: string;
  tierName: string;
  attendeeName: string;
  admitsCount: number;
  ticketUrl: string;
  qrHash?: string;
  qrDataUrl?: string;
}

// -----------------------------------------------------------------------------
// 1. Booking Confirmation Email Template (Matches User's Official Template)
// -----------------------------------------------------------------------------
export function generateBookingConfirmationEmailHtml(params: {
  customer_name: string;
  ticket_tier: string;
  quantity: number | string;
  total_amount: number | string;
  order_id: string;
  event_date?: string;
  ticket_url: string;
  pdf_url?: string;
  qr_code_cid?: string;
  qr_data_url?: string;
  banner_cid?: string;
  banner_url?: string;
  venue_name?: string;
  calendar_url?: string;
}): string {
  const {
    customer_name,
    ticket_tier,
    quantity,
    total_amount,
    order_id,
    event_date = "Saturday, 31 October 2026",
    ticket_url,
    pdf_url,
    qr_code_cid,
    qr_data_url,
    banner_cid,
    banner_url,
    venue_name = "The Lawns Restaurant, Nakuru",
    calendar_url,
  } = params;

  // Primary action button targets either dedicated PDF view/download or the digital ticket pass
  const primaryButtonUrl = pdf_url || ticket_url;

  // Add to Calendar Link (Google Calendar direct prefill)
  const defaultCalendarUrl =
    calendar_url ||
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      "Hauntings of the Rift: Halloween Experience by Verve & Co.",
    )}&dates=20261031T130000Z/20261101T010000Z&details=${encodeURIComponent(
      `Official Admission Pass: ${order_id}\nGuest: ${customer_name}\nTier: ${ticket_tier} (x${quantity})\nTotal: KES ${total_amount}\nVenue: ${venue_name}\nStrictly 18+ with Valid ID. Present your QR code at the gate.`,
    )}&location=${encodeURIComponent("The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru, Kenya")}`;

  // Banner image source (CID for offline/embedded, fallback to hosted or static URL)
  const bannerSrc = banner_cid
    ? `cid:${banner_cid}`
    : banner_url || "https://verve-hauntings.vercel.app/event-banner.jpg";

  // QR code image source
  const qrSrc = qr_code_cid
    ? `cid:${qr_code_cid}`
    : qr_data_url ||
      `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        JSON.stringify({
          order: order_id,
          holder: customer_name,
          tier: ticket_tier,
          event: "HALLOWEEN_RIFT_2026",
        }),
      )}`;

  // Google Schema.org EventReservation JSON-LD microdata
  const jsonLd = JSON.stringify({
    "@context": "http://schema.org",
    "@type": "EventReservation",
    reservationNumber: order_id,
    reservationStatus: "http://schema.org/Confirmed",
    underName: {
      "@type": "Person",
      name: customer_name,
    },
    reservationFor: {
      "@type": "Event",
      name: "Hauntings of the Rift: Halloween Experience by Verve & Co.",
      startDate: "2026-10-31T16:00:00+03:00",
      endDate: "2026-11-01T04:00:00+03:00",
      location: {
        "@type": "Place",
        name: venue_name,
        address: {
          "@type": "PostalAddress",
          streetAddress: "Nakuru-Nairobi Highway",
          addressLocality: "Nakuru",
          addressCountry: "KE",
        },
      },
    },
    ticketToken: order_id,
    ticketDownloadUrl: primaryButtonUrl,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Ticket for Hauntings of the Rift by Verve &amp; Co.</title>
  <script type="application/ld+json">
    ${jsonLd}
  </script>
</head>
<body style="margin: 0; padding: 0; background-color: #0b090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f2eb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b090e; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #15121b; border: 1px solid #282030; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.7);">
          
          <!-- 1. Full-Width Event Artwork Banner -->
          <tr>
            <td style="padding: 0; line-height: 0; background-color: #000000;">
              <img src="${bannerSrc}" alt="Hauntings of the Rift Banner" width="560" style="width: 100%; max-width: 560px; height: auto; display: block; border-top-left-radius: 12px; border-top-right-radius: 12px;" />
            </td>
          </tr>

          <!-- 2. Dark Event Subtitle Header Bar -->
          <tr>
            <td style="background-color: #1c1824; padding: 18px 24px; border-bottom: 1px solid #2c2336;">
              <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #f5f2eb; line-height: 1.4; letter-spacing: -0.01em;">
                Your Ticket &ndash; Hauntings of the Rift by Verve &amp; Co.
              </h2>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #9ca3af; line-height: 1.4;">
                Sat, Oct 31 2026 &bull; 16:00 &bull; ${venue_name}
              </p>
            </td>
          </tr>

          <!-- 3. Ticket Confirmation Body -->
          <tr>
            <td style="padding: 24px 24px 8px 24px;">
              <p style="margin: 0 0 8px 0; font-size: 15px; color: #f5f2eb;">
                Hi ${customer_name},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                Your ticket is ready. Show this QR at entry or download the PDF below.
              </p>

              <!-- RSVP Code Field -->
              <div style="margin-bottom: 14px;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; display: block; margin-bottom: 3px;">RSVP Code</span>
                <span style="font-size: 17px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Consolas, Menlo, monospace; color: #f5f2eb; letter-spacing: 0.05em;">${order_id}</span>
              </div>

              <!-- Status Field -->
              <div style="margin-bottom: 24px;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; display: block; margin-bottom: 3px;">Status</span>
                <span style="font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 0.05em;">CONFIRMED</span>
              </div>

              <!-- Pass Selection Quick Info -->
              <div style="background-color: #100d16; border: 1px dashed #2f253a; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #9ca3af; display: flex; justify-content: space-between;">
                <div>
                  <span style="color: #6b7280; text-transform: uppercase; font-size: 10px;">Pass Selection:</span>
                  <strong style="color: #f5f2eb; margin-left: 4px;">${ticket_tier} (x${quantity})</strong>
                </div>
                <div>
                  <span style="color: #6b7280; text-transform: uppercase; font-size: 10px;">Total Paid:</span>
                  <strong style="color: #22c55e; margin-left: 4px;">KES ${total_amount}</strong>
                </div>
              </div>

              <!-- 4. Crisp High-Contrast Centered QR Code Box -->
              <div style="text-align: center; margin: 28px 0 24px 0;">
                <div style="background-color: #ffffff; padding: 16px; border-radius: 10px; display: inline-block; box-shadow: 0 6px 20px rgba(0,0,0,0.5);">
                  <img src="${qrSrc}" alt="Admission Pass QR Code" width="220" height="220" style="display: block; margin: 0 auto;" />
                </div>
              </div>

              <!-- 5. Blue Primary Action Button (Matches Template) -->
              <div style="text-align: center; margin: 20px 0 12px 0;">
                <a href="${primaryButtonUrl}" style="background-color: #2563eb; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 6px; display: inline-block; font-size: 14px; letter-spacing: 0.02em;">
                  View Ticket PDF
                </a>
              </div>

              <!-- 6. Add to Calendar Link -->
              <div style="text-align: center; margin-bottom: 20px;">
                <a href="${defaultCalendarUrl}" target="_blank" style="color: #60a5fa; font-size: 13px; text-decoration: underline;">
                  Add to calendar
                </a>
              </div>

              <!-- 7. Fallback Subtitle Guidance -->
              <p style="text-align: center; font-size: 11px; color: #9ca3af; margin: 0 auto 16px auto; max-width: 400px; line-height: 1.4;">
                If the QR code doesn't display, the PDF has a copy you can present at the door.
              </p>
            </td>
          </tr>

          <!-- 8. Subtle Footer -->
          <tr>
            <td style="border-top: 1px solid #231b2a; padding: 16px 24px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; color: #6b7280;">
                Sent by Verve &amp; Co. &bull; Please do not reply to this automated message.
              </p>
              <p style="margin: 0; font-size: 10px; color: #4b5563;">
                The Lawns Restaurant, Nakuru &bull; Strictly 18+ with Valid Government ID
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// -----------------------------------------------------------------------------
// 2. 24-Hour Event Reminder Email Template
// -----------------------------------------------------------------------------
export function generateEventReminder24hEmailHtml(params: {
  customer_name: string;
  venue_name: string;
  gate_opening_time: string;
  ticket_tier: string;
  ticket_url: string;
}): string {
  const { customer_name, venue_name, gate_opening_time, ticket_tier, ticket_url } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>24 Hours Until Hauntings of the Rift</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0d0d0d; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px;">
          
          <!-- Alert Banner -->
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <span style="background-color: rgba(249, 115, 22, 0.15); border: 1px solid #f97316; color: #f97316; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 6px 14px; border-radius: 20px; letter-spacing: 0.1em;">24 Hours Remaining</span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Tomorrow is the Night</h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom: 24px; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
              Hi <strong>${customer_name}</strong>,<br><br>
              We are finalizing preparations for <strong>Hauntings of the Rift</strong>. Here is everything you need to know for a seamless arrival tomorrow.
            </td>
          </tr>

          <!-- Logistics Info Table -->
          <tr>
            <td style="padding-bottom: 24px;">
              <table role="presentation" width="100%" style="background-color: #0d0d0d; border: 1px solid #262626; border-radius: 8px; padding: 16px;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #1f1f23;">
                    <span style="color: #71717a; font-size: 12px;">Venue:</span><br>
                    <strong style="color: #ffffff; font-size: 14px;">${venue_name}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #1f1f23;">
                    <span style="color: #71717a; font-size: 12px;">Gate Opening:</span><br>
                    <strong style="color: #ffffff; font-size: 14px;">${gate_opening_time}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #71717a; font-size: 12px;">Your Pass Type:</span><br>
                    <strong style="color: #f97316; font-size: 14px;">${ticket_tier}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pass Access -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <a href="${ticket_url}" style="background-color: #f97316; color: #000000; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 6px; display: inline-block; font-size: 14px; text-transform: uppercase;">Pre-load Your QR Pass</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px; border-top: 1px solid #262626; font-size: 11px; color: #52525b;">
              &copy; 2026 Hauntings of the Rift. Managed by Verve & Co.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// -----------------------------------------------------------------------------
// 3. Refund Notice Email Template
// -----------------------------------------------------------------------------
export function generateRefundNoticeEmailHtml(params: {
  customer_name: string;
  refund_amount: number | string;
  payment_ref: string;
  refund_reason: string;
  order_id: string;
}): string {
  const { customer_name, refund_amount, payment_ref, refund_reason, order_id } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Processed - Hauntings of the Rift</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0d0d0d; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px;">
          
          <!-- Status Icon / Header -->
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <span style="background-color: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 6px 14px; border-radius: 20px; letter-spacing: 0.1em;">Order Reversal</span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Refund Confirmation</h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom: 24px; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
              Hi <strong>${customer_name}</strong>,<br><br>
              This email confirms that a refund has been issued for your booking with <strong>Hauntings of the Rift</strong>.
            </td>
          </tr>

          <!-- Financial Breakdown Box -->
          <tr>
            <td style="padding-bottom: 24px;">
              <table role="presentation" width="100%" style="background-color: #0d0d0d; border: 1px solid #262626; border-radius: 8px; padding: 20px;">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #71717a;">Amount Reversed</span><br>
                    <strong style="font-size: 18px; color: #ef4444;">KES ${refund_amount}</strong>
                  </td>
                  <td align="right" style="padding-bottom: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #71717a;">Gateway Ref</span><br>
                    <span style="font-size: 13px; font-family: monospace; color: #d4d4d8;">${payment_ref}</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 12px; border-top: 1px solid #1f1f23;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #71717a;">Reason for Reversal</span><br>
                    <span style="font-size: 13px; color: #d4d4d8;">${refund_reason}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notice on Invalidation -->
          <tr>
            <td style="padding-bottom: 24px;">
              <div style="background-color: rgba(249, 115, 22, 0.08); border-left: 3px solid #f97316; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #d4d4d8;">
                <strong>Note:</strong> Associated admission passes (Order ID: <span style="font-family: monospace;">${order_id}</span>) have been cryptographically revoked and will be rejected at gate scanners.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px; border-top: 1px solid #262626; font-size: 11px; color: #52525b;">
              If you did not request this refund or believe this is an error, please contact Support at <a href="mailto:support@verve.co.ke" style="color: #f97316; text-decoration: none;">support@verve.co.ke</a>.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// -----------------------------------------------------------------------------
// 4. M-Pesa Payment Received Acknowledgment Template
// -----------------------------------------------------------------------------
export function generateMpesaReceivedEmailHtml(params: {
  customer_name: string;
  order_number: string;
  mpesa_code: string;
  ticket_tier: string;
  quantity: number | string;
  total_amount: number | string;
  order_url?: string;
  event_date?: string;
  venue_name?: string;
}): string {
  const {
    customer_name,
    order_number,
    mpesa_code,
    ticket_tier,
    quantity,
    total_amount,
    order_url = "https://verve-hauntings.vercel.app",
    event_date = "Saturday, 31 October 2026",
    venue_name = "The Lawns Restaurant, Nakuru",
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M-Pesa Payment Received — Hauntings of the Rift</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09080D; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F2EB;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #09080D; min-height: 100vh; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #120E17; border: 1px solid #332338; border-radius: 12px; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.7);">
          
          <!-- Header Banner Strip -->
          <tr>
            <td style="background: linear-gradient(135deg, #1A0D18 0%, #2A101C 100%); padding: 28px 24px; text-align: center; border-bottom: 2px solid #8A1C2C;">
              <p style="margin: 0 0 6px 0; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #C9A84C; font-weight: 700;">
                VERVE &amp; CO. PRESENTS
              </p>
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #F5F2EB; letter-spacing: -0.02em;">
                HAUNTINGS OF THE RIFT
              </h1>
              <p style="margin: 0; font-size: 12px; color: #A09BA8; font-mono;">
                ${event_date} • ${venue_name}
              </p>
            </td>
          </tr>

          <!-- Status Indicator Card -->
          <tr>
            <td style="padding: 24px 28px 12px 28px;">
              <div style="background-color: rgba(201, 168, 76, 0.1); border: 1px solid rgba(201, 168, 76, 0.35); border-radius: 8px; padding: 14px 18px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #E5C365;">
                  ⏳ Payment Received • Verification in Progress
                </span>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #D5CFDE;">
                  Standard Processing SLA: Within 24 hours of submission
                </p>
              </div>
            </td>
          </tr>

          <!-- Greeting Body -->
          <tr>
            <td style="padding: 12px 28px 20px 28px;">
              <p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.6; color: #F5F2EB;">
                Hi <strong>${customer_name}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #C4BFCC;">
                We have successfully received your M-Pesa transaction reference for order <strong style="color: #F5F2EB;">#${order_number}</strong>. Our finance desk is cross-referencing your transaction code against our official Safaricom statement.
              </p>
            </td>
          </tr>

          <!-- Transaction Summary Table -->
          <tr>
            <td style="padding: 0 28px 20px 28px;">
              <table role="presentation" width="100%" style="background-color: #0B0910; border: 1px solid #28212D; border-radius: 8px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 12px; color: #8F8799; text-transform: uppercase; letter-spacing: 0.05em;">M-Pesa Reference Code</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 14px; font-weight: 700; color: #E5C365; font-family: monospace;">${mpesa_code}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 12px; color: #8F8799; text-transform: uppercase; letter-spacing: 0.05em;">Pass Tier</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 13px; font-weight: 600; color: #F5F2EB;">${ticket_tier}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 12px; color: #8F8799; text-transform: uppercase; letter-spacing: 0.05em;">Quantity</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #1E1824; font-size: 13px; color: #F5F2EB;">${quantity} Pass(es)</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; color: #8F8799; text-transform: uppercase; letter-spacing: 0.05em;">Amount Submitted</td>
                  <td align="right" style="padding: 12px 16px; font-size: 15px; font-weight: 800; color: #10B981;">KES ${typeof total_amount === "number" ? total_amount.toLocaleString() : total_amount}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What Happens Next Guide -->
          <tr>
            <td style="padding: 0 28px 24px 28px;">
              <h3 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.15em; color: #C9A84C;">
                What Happens Next:
              </h3>
              <ol style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.7; color: #C4BFCC;">
                <li style="margin-bottom: 8px;">
                  <strong style="color: #F5F2EB;">Verification:</strong> Our team checks the reference against our merchant statement within 24 hours.
                </li>
                <li style="margin-bottom: 8px;">
                  <strong style="color: #F5F2EB;">Automated Ticket Delivery:</strong> The moment payment is verified, your official cryptographically signed admission pass with QR code, downloadable PDF, and calendar invite will be automatically delivered to this email address.
                </li>
                <li>
                  <strong style="color: #F5F2EB;">Gate Entry:</strong> Simply display your digital QR pass on your phone upon arrival on 31 October 2026.
                </li>
              </ol>
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td align="center" style="padding: 0 28px 28px 28px;">
              <a href="${order_url}" style="background-color: #8A1C2C; color: #FFFFFF; padding: 13px 30px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block; letter-spacing: 0.05em; text-transform: uppercase;">
                View Order Status &rarr;
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0B0910; border-top: 1px solid #231C28; padding: 20px 24px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #7F778A;">
                Questions or corrections? Reply directly to this email or write to <a href="mailto:verve.n.co.ke@gmail.com" style="color: #C9A84C; text-decoration: none;">verve.n.co.ke@gmail.com</a>.
              </p>
              <p style="margin: 0; font-size: 10px; color: #5B5466;">
                Hauntings of the Rift • Official Event Operations • The Lawns Restaurant, Nakuru
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
