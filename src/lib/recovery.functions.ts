import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GENERIC_MESSAGE =
  "If matching tickets exist, a recovery email will be attempted. Email delivery is not guaranteed.";

const RATE_LIMIT = 3;
const WINDOW_MINUTES = 60;

export type RecoveryResult = {
  status: "ok" | "rate_limited";
  message: string;
};

export const recoverTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(4).max(255),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<RecoveryResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signTicketCode } = await import("./tickets.server");
    const { NotificationOutbox } = await import("@/server/notification-outbox");

    const identifier = data.identifier.toLowerCase();
    const ip =
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      getRequestHeader("x-real-ip") ??
      "unknown";

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

    // ---------------------------------------------------------------
    // Rate limiting: 3 attempts per hour per identifier and per IP.
    // ---------------------------------------------------------------
    const { count: identifierCount } = await supabaseAdmin
      .from("recovery_requests")
      .select("id", { count: "exact", head: true })
      .eq("identifier", identifier)
      .gte("created_at", since);

    const { count: ipCount } = await supabaseAdmin
      .from("recovery_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", since);

    if ((identifierCount ?? 0) >= RATE_LIMIT || (ipCount ?? 0) >= RATE_LIMIT) {
      return {
        status: "rate_limited",
        message: "Too many recovery requests. Please try again in an hour.",
      };
    }

    await supabaseAdmin.from("recovery_requests").insert({ identifier, ip_address: ip });

    // ---------------------------------------------------------------
    // Look the buyer up by email, phone or payment reference.
    // ---------------------------------------------------------------
    const isEmail = identifier.includes("@");
    const digits = identifier.replace(/\D/g, "");

    let orderIds: string[] = [];
    if (!isEmail) {
      const { data: txRows } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .or(
          [
            `payment_provider_ref.eq.${data.identifier.trim().toUpperCase()}`,
            digits.length >= 9 ? `buyer_phone.ilike.%${digits.slice(-9)}` : "",
          ]
            .filter(Boolean)
            .join(","),
        )
        .eq("status", "completed");
      orderIds = (txRows ?? []).map((row) => String((row as Record<string, unknown>)["id"]));
    }

    const query = supabaseAdmin
      .from("tickets")
      .select("ticket_code, holder_email, holder_name, tier, event_name");

    const { data: tickets } = isEmail
      ? await query.eq("holder_email", identifier)
      : orderIds.length > 0
        ? await query.in("order_id", orderIds)
        : { data: [] as unknown[] };

    const rows = (tickets ?? []) as Array<Record<string, unknown>>;

    if (rows.length > 0) {
      const email = String(rows[0]?.["holder_email"] ?? "");
      const links = rows.map((row) => {
        const code = String(row["ticket_code"]);
        return {
          tier: String(row["tier"] ?? "General"),
          url: `/ticket/${encodeURIComponent(code)}?sig=${signTicketCode(code)}`,
        };
      });
      if (email) {
        try {
          await NotificationOutbox.enqueueAndDispatch({
            channel: "email",
            type: "recovery_links",
            recipient: email,
            payload: {
              to: email,
              name: String(rows[0]?.["holder_name"] ?? "Guest"),
              links,
            },
          });
        } catch (error) {
          console.error("Could not enqueue ticket recovery links:", error);
        }
      }
    }

    return { status: "ok", message: GENERIC_MESSAGE };
  });
