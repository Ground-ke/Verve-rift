import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type IssuedTicketRow = {
  ticket_code: string;
  tier: string;
  holder_name: string;
  is_used: boolean;
};

const EVENT_NAME = "Hauntings of the Rift";
const EVENT_DATE = "2026-10-31T13:00:00.000Z"; // 4 PM EAT
const EVENT_VENUE = "Top Cliff Lodge, Nakuru";

function secret(): string {
  const value = process.env["TICKET_HMAC_SECRET"];
  if (!value) throw new Error("TICKET_HMAC_SECRET is not configured");
  return value;
}

/** Deterministic, tamper-evident signature for a ticket code. */
export function signTicketCode(ticketCode: string): string {
  return createHmac("sha256", secret()).update(ticketCode).digest("hex");
}

export function verifyTicketSignature(ticketCode: string, signature: string): boolean {
  const expected = Buffer.from(signTicketCode(ticketCode));
  const provided = Buffer.from(signature || "");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function generateTicketCode(): string {
  return `HRT-${randomBytes(16).toString("base64url").toUpperCase()}`;
}

export async function issueTicketsForTransaction(input: {
  transactionId: string;
  quantity: number;
  tier: string;
  holderName: string;
  holderEmail: string;
  holderPhone: string;
  userId?: string | null;
}): Promise<IssuedTicketRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: alreadyIssued } = await supabaseAdmin
    .from("tickets")
    .select("ticket_code, tier, holder_name, is_used")
    .eq("order_id", input.transactionId);

  if (alreadyIssued && alreadyIssued.length > 0) {
    return alreadyIssued as IssuedTicketRow[];
  }

  const rows = Array.from({ length: input.quantity }, () => {
    const ticketCode = generateTicketCode();
    return {
      order_id: input.transactionId,
      user_id: input.userId ?? null,
      event_name: EVENT_NAME,
      event_date: EVENT_DATE,
      venue: EVENT_VENUE,
      tier: input.tier,
      holder_name: input.holderName,
      holder_email: input.holderEmail,
      holder_phone: input.holderPhone,
      ticket_code: ticketCode,
      qr_hash: signTicketCode(ticketCode),
    };
  });

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .insert(rows)
    .select("ticket_code, tier, holder_name, is_used");

  if (error) {
    console.error("[issueTicketsForTransaction]", error);
    return [];
  }
  return (data ?? []) as IssuedTicketRow[];
}
