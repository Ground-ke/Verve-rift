import nodemailer from "nodemailer";

type RecoveryLink = { tier: string; url: string };

/**
 * Sends the ticket recovery email using Gmail SMTP (Nodemailer).
 */
export async function sendRecoveryEmail(input: {
  to: string;
  name: string;
  links: RecoveryLink[];
}): Promise<{ success: boolean; id?: string; simulated?: boolean; error?: string }> {
  const rawUser =
    process.env["SMTP_USER"] ||
    process.env["SMTP_USERNAME"] ||
    process.env["GMAIL_USER"] ||
    process.env["EMAIL_USER"] ||
    "verve.n.co.ke@gmail.com";
  const rawPass =
    process.env["SMTP_PASS"] ||
    process.env["SMTP_PASSWORD"] ||
    process.env["GMAIL_APP_PASSWORD"] ||
    process.env["GMAIL_PASS"] ||
    process.env["GMAIL_PASSWORD"] ||
    process.env["GOOGLE_APP_PASSWORD"] ||
    process.env["EMAIL_PASS"] ||
    process.env["EMAIL_PASSWORD"];
  const siteUrl =
    process.env["SITE_URL"] ||
    process.env["PUBLIC_SITE_URL"] ||
    process.env["APP_URL"] ||
    "https://verve-rift.vercel.app";
  const user = rawUser.trim();
  const from = process.env["EMAIL_FROM"] || `"Verve & Co." <${user}>`;

  const list = input.links
    .map((link) => `<li><a href="${siteUrl}${link.url}">${link.tier} ticket</a></li>`)
    .join("");

  const html = `
    <p>Hi ${input.name},</p>
    <p>Here are your tickets for <strong>Hauntings of the Rift</strong>. Each link opens your digital ticket with its QR code.</p>
    <ul>${list}</ul>
    <p>These links are personal — please do not share them.</p>
  `;

  if (!rawPass) {
    return {
      success: false,
      simulated: false,
      error: "Email delivery is not configured; the recovery message was not sent.",
    };
  }

  const pass = rawPass.replace(/\s+/g, "");

  try {
    const transporter = nodemailer.createTransport({
      host: process.env["SMTP_HOST"] || "smtp.gmail.com",
      port: Number(process.env["SMTP_PORT"]) || 465,
      secure: process.env["SMTP_SECURE"] === "false" ? false : true,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: "Your Hauntings of the Rift tickets",
      html,
    });
    return { success: true, id: info.messageId };
  } catch (error) {
    console.error("[recovery] SMTP provider unreachable:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
