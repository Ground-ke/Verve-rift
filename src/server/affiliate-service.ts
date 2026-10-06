import { randomUUID } from "crypto";
import { getSharedPool } from "../db/index.ts";
import { validateAndNormalizeKenyanPhone } from "../lib/validation/phone";
import { AFFILIATE_TERMS, normalizeReferralCode } from "./order-service";
import { SlidingWindowRateLimiter } from "./rate-limiter";
import { AdminServerService } from "./admin-service";

export const RESERVED_AFFILIATE_HANDLES = new Set([
  "asiti",
  "rane",
  "dj_asiti",
  "dj_rane",
  "verve",
  "verve_co",
  "serve",
  "admin",
  "staff",
  "organizer",
  "official",
  "hauntings",
  "rift",
  "tickets",
  "support",
  "test",
]);

export interface AffiliateWithStats {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsent: boolean;
  consentAt: string | null;
  unsubscribedAt: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  appliedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  visitsAllTime: number;
  visitsLast7Days: number;
  ordersStarted: number;
  approvedOrders: number;
  admittedPeople: number;
  peopleAdmitted: number;
  pendingPeople: number;
  totalRevenueKes: number;
  conversionRate: number;
  commissionPerPersonKes: number;
  commissionKes: number;
  totalPayoutKes: number;
  paidKes: number;
  owedKes: number;
  compsEarned: number;
  compsIssued: number;
  compsOutstanding: number;
}

export interface AffiliateLeaderboardResponse {
  terms: typeof AFFILIATE_TERMS;
  affiliates: AffiliateWithStats[];
  summary: {
    activeAffiliatesCount: number;
    pendingApplicationsCount: number;
    totalAffiliatesCount: number;
    totalReferredPeople: number;
    totalPendingPeople: number;
    totalReferredRevenueKes: number;
    totalCommissionKes: number;
    totalCommissionPaidKes: number;
    totalCommissionOwedKes: number;
    totalCommissionDueKes: number;
    totalCompsEarned: number;
    totalCompsIssued: number;
    totalCompsOutstanding: number;
  };
}

export function generateAffiliateCodeBase(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 28);
  if (cleaned.length >= 2) return cleaned;
  return "affiliate";
}

async function writeAffiliateAuditLog(params: {
  actorEmail: string;
  actorId?: string | undefined;
  action:
    | "affiliate.created"
    | "affiliate.updated"
    | "affiliate.deactivated"
    | "affiliate.payout_recorded"
    | "affiliate.applied"
    | "affiliate.approved"
    | "affiliate.rejected";
  targetTable: "affiliates" | "affiliate_payouts";
  code: string;
  changedFields?: string[] | undefined;
}): Promise<void> {
  const metadata =
    params.changedFields && params.changedFields.length > 0
      ? { code: params.code, changedFields: params.changedFields }
      : { code: params.code };
  const auditId = randomUUID();
  const actorEmail = (params.actorEmail || "admin@verve.co.ke").trim();
  const actorId = (params.actorId || actorEmail).trim();

  try {
    await getSharedPool().query(
      `INSERT INTO public.audit_logs
        (id, actor_id, actor_email, actor_role, action, target_table, target_id, metadata, ip_address)
       VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7::jsonb, NULL)`,
      [
        auditId,
        actorId,
        actorEmail,
        params.action,
        params.targetTable,
        params.code,
        JSON.stringify(metadata),
      ],
    );
  } catch {
    try {
      await getSharedPool().query(
        `INSERT INTO public.audit_logs
          (id, actor_id, action, target_table, target_id, metadata, ip_address)
         VALUES ($1::uuid, $2, $3, $4, NULL, $5::jsonb, NULL)`,
        [
          auditId,
          actorEmail,
          params.action,
          params.targetTable,
          JSON.stringify(metadata),
        ],
      );
    } catch {
      // Fallback to in-memory admin audit store if DB schema differs
      await AdminServerService.recordAuditLog({
        actorId,
        actorEmail,
        actorRole: "admin",
        action: params.action,
        targetTable: params.targetTable,
        targetId: params.code,
        metadata,
      });
    }
  }
}

const AFFILIATE_STATS_SQL = `
  WITH visit_stats AS (
    SELECT
      LOWER(code) AS code,
      COALESCE(SUM(visits), 0)::int AS visits_all_time,
      COALESCE(
        SUM(CASE WHEN day >= (CURRENT_DATE - INTERVAL '6 days')::date THEN visits ELSE 0 END),
        0
      )::int AS visits_last_7d
    FROM public.affiliate_visits
    GROUP BY LOWER(code)
  ),
  valid_ticket_admits AS (
    SELECT
      t.order_id,
      COALESCE(
        SUM(
          CASE
            WHEN t.status IN ('valid', 'used')
            THEN GREATEST(COALESCE((t.data->>'admitsCount')::int, 1), 1)
            ELSE 0
          END
        ),
        0
      )::int AS admitted_people,
      COALESCE(COUNT(*) FILTER (WHERE t.status IN ('valid', 'used')), 0)::int AS active_ticket_count
    FROM public.manual_ticket_records t
    GROUP BY t.order_id
  ),
  verified_orders AS (
    SELECT DISTINCT r.order_id
    FROM public.manual_payment_receipts r
  ),
  order_stats AS (
    SELECT
      LOWER(TRIM(o.data->>'referralCode')) AS code,
      COUNT(*)::int AS orders_started,
      COUNT(*) FILTER (
        WHERE o.status IN ('approved', 'paid', 'completed')
          AND vo.order_id IS NOT NULL
          AND COALESCE(vta.admitted_people, 0) > 0
      )::int AS approved_orders,
      COALESCE(
        SUM(
          CASE
            WHEN o.status IN ('approved', 'paid', 'completed')
              AND vo.order_id IS NOT NULL
            THEN COALESCE(vta.admitted_people, 0)
            ELSE 0
          END
        ),
        0
      )::int AS admitted_people,
      COALESCE(
        SUM(
          CASE
            WHEN o.status = 'pending_approval'
            THEN GREATEST(COALESCE(o.quantity, 1), 1) * GREATEST(COALESCE((o.data->>'admitsCount')::int, 1), 1)
            ELSE 0
          END
        ),
        0
      )::int AS pending_people,
      COALESCE(
        SUM(
          CASE
            WHEN o.status IN ('approved', 'paid', 'completed')
              AND vo.order_id IS NOT NULL
              AND COALESCE(vta.admitted_people, 0) > 0
            THEN COALESCE((o.data->>'totalKes')::numeric, 0)
            ELSE 0
          END
        ),
        0
      )::int AS total_revenue_kes
    FROM public.manual_ticket_orders o
    LEFT JOIN verified_orders vo ON vo.order_id = o.id
    LEFT JOIN valid_ticket_admits vta ON vta.order_id = o.id
    WHERE COALESCE((o.data->>'isComp')::boolean, false) = false
      AND COALESCE(o.mpesa_code, '') <> 'COMP'
      AND COALESCE(o.data->>'mpesaCode', '') <> 'COMP'
      AND NULLIF(TRIM(COALESCE(o.data->>'referralCode', '')), '') IS NOT NULL
    GROUP BY LOWER(TRIM(o.data->>'referralCode'))
  ),
  comp_stats AS (
    SELECT
      LOWER(TRIM(COALESCE(NULLIF(o.data->>'compForAffiliate', ''), o.data->>'referralCode'))) AS code,
      COALESCE(SUM(COALESCE(vta.active_ticket_count, 0)), 0)::int AS comps_issued
    FROM public.manual_ticket_orders o
    LEFT JOIN valid_ticket_admits vta ON vta.order_id = o.id
    WHERE (COALESCE((o.data->>'isComp')::boolean, false) = true OR COALESCE(o.mpesa_code, '') = 'COMP')
      AND o.data->>'compReason' = 'affiliate_milestone'
      AND NULLIF(TRIM(COALESCE(NULLIF(o.data->>'compForAffiliate', ''), o.data->>'referralCode', '')), '') IS NOT NULL
    GROUP BY LOWER(TRIM(COALESCE(NULLIF(o.data->>'compForAffiliate', ''), o.data->>'referralCode')))
  ),
  payout_stats AS (
    SELECT
      LOWER(affiliate_code) AS code,
      COALESCE(SUM(amount_kes), 0)::int AS paid_kes
    FROM public.affiliate_payouts
    GROUP BY LOWER(affiliate_code)
  )
  SELECT
    a.code,
    a.name,
    a.phone,
    a.email,
    a.marketing_consent AS "marketingConsent",
    a.consent_at AS "consentAt",
    a.unsubscribed_at AS "unsubscribedAt",
    a.notes,
    a.active,
    a.created_at AS "createdAt",
    a.applied_at AS "appliedAt",
    a.approved_at AS "approvedAt",
    a.rejected_at AS "rejectedAt",
    COALESCE(vs.visits_all_time, 0)::int AS "visitsAllTime",
    COALESCE(vs.visits_last_7d, 0)::int AS "visitsLast7Days",
    COALESCE(os.orders_started, 0)::int AS "ordersStarted",
    COALESCE(os.approved_orders, 0)::int AS "approvedOrders",
    COALESCE(os.admitted_people, 0)::int AS "admittedPeople",
    COALESCE(os.pending_people, 0)::int AS "pendingPeople",
    COALESCE(os.total_revenue_kes, 0)::int AS "totalRevenueKes",
    (COALESCE(os.admitted_people, 0) * $1::int)::int AS "commissionKes",
    COALESCE(ps.paid_kes, 0)::int AS "paidKes",
    ((COALESCE(os.admitted_people, 0) * $1::int) - COALESCE(ps.paid_kes, 0))::int AS "owedKes",
    FLOOR(COALESCE(os.admitted_people, 0)::numeric / $2::numeric)::int AS "compsEarned",
    COALESCE(cs.comps_issued, 0)::int AS "compsIssued",
    GREATEST(
      0,
      FLOOR(COALESCE(os.admitted_people, 0)::numeric / $2::numeric)::int - COALESCE(cs.comps_issued, 0)::int
    )::int AS "compsOutstanding"
  FROM public.affiliates a
  LEFT JOIN visit_stats vs ON vs.code = LOWER(a.code)
  LEFT JOIN order_stats os ON os.code = LOWER(a.code)
  LEFT JOIN comp_stats cs ON cs.code = LOWER(a.code)
  LEFT JOIN payout_stats ps ON ps.code = LOWER(a.code)
`;

interface RawAffiliateStatsRow {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsent: boolean;
  consentAt: string | null;
  unsubscribedAt: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  appliedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  visitsAllTime: number;
  visitsLast7Days: number;
  ordersStarted: number;
  approvedOrders: number;
  admittedPeople: number;
  pendingPeople: number;
  totalRevenueKes: number;
  commissionKes: number;
  paidKes: number;
  owedKes: number;
  compsEarned: number;
  compsIssued: number;
  compsOutstanding: number;
}

function mapAffiliateRow(row: RawAffiliateStatsRow): AffiliateWithStats {
  const visitsAllTime = Number(row.visitsAllTime) || 0;
  const approvedOrders = Number(row.approvedOrders) || 0;
  const admittedPeople = Number(row.admittedPeople) || 0;
  const commissionKes = Number(row.commissionKes) || 0;
  const paidKes = Number(row.paidKes) || 0;
  const owedKes = Number(row.owedKes) || 0;
  const conversionRate =
    visitsAllTime > 0 ? Number(((approvedOrders / visitsAllTime) * 100).toFixed(1)) : 0;

  return {
    code: row.code,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    marketingConsent: Boolean(row.marketingConsent),
    consentAt: row.consentAt ? new Date(row.consentAt).toISOString() : null,
    unsubscribedAt: row.unsubscribedAt ? new Date(row.unsubscribedAt).toISOString() : null,
    notes: row.notes ?? null,
    active: Boolean(row.active),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : null,
    approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : null,
    rejectedAt: row.rejectedAt ? new Date(row.rejectedAt).toISOString() : null,
    visitsAllTime,
    visitsLast7Days: Number(row.visitsLast7Days) || 0,
    ordersStarted: Number(row.ordersStarted) || 0,
    approvedOrders,
    admittedPeople,
    peopleAdmitted: admittedPeople,
    pendingPeople: Number(row.pendingPeople) || 0,
    totalRevenueKes: Number(row.totalRevenueKes) || 0,
    conversionRate,
    commissionPerPersonKes: AFFILIATE_TERMS.commissionPerPersonKes,
    commissionKes,
    totalPayoutKes: commissionKes,
    paidKes,
    owedKes,
    compsEarned: Number(row.compsEarned) || 0,
    compsIssued: Number(row.compsIssued) || 0,
    compsOutstanding: Number(row.compsOutstanding) || 0,
  };
}

export class AffiliateService {
  /**
   * GET /api/admin/affiliates
   * Lists all affiliates with their stats from ONE SQL query on the server-side Postgres pool.
   */
  static async listAffiliatesWithStats(): Promise<AffiliateLeaderboardResponse> {
    const result = await getSharedPool().query<RawAffiliateStatsRow>(
      `${AFFILIATE_STATS_SQL}
       ORDER BY (a.applied_at IS NOT NULL AND a.approved_at IS NULL AND a.rejected_at IS NULL) DESC, "admittedPeople" DESC, "ordersStarted" DESC, a.created_at DESC`,
      [AFFILIATE_TERMS.commissionPerPersonKes, AFFILIATE_TERMS.peoplePerCompPass],
    );

    const affiliates = result.rows.map(mapAffiliateRow);
    const activeAffiliatesCount = affiliates.filter((a) => a.active).length;
    const pendingApplicationsCount = affiliates.filter(
      (a) => Boolean(a.appliedAt) && !a.approvedAt && !a.rejectedAt,
    ).length;
    const totalReferredPeople = affiliates.reduce((sum, a) => sum + a.admittedPeople, 0);
    const totalPendingPeople = affiliates.reduce((sum, a) => sum + a.pendingPeople, 0);
    const totalReferredRevenueKes = affiliates.reduce((sum, a) => sum + a.totalRevenueKes, 0);
    const totalCommissionKes = affiliates.reduce((sum, a) => sum + a.commissionKes, 0);
    const totalCommissionPaidKes = affiliates.reduce((sum, a) => sum + a.paidKes, 0);
    const totalCommissionOwedKes = affiliates.reduce(
      (sum, a) => sum + Math.max(0, a.owedKes),
      0,
    );
    const totalCompsEarned = affiliates.reduce((sum, a) => sum + a.compsEarned, 0);
    const totalCompsIssued = affiliates.reduce((sum, a) => sum + a.compsIssued, 0);
    const totalCompsOutstanding = affiliates.reduce((sum, a) => sum + a.compsOutstanding, 0);

    return {
      terms: AFFILIATE_TERMS,
      affiliates,
      summary: {
        activeAffiliatesCount,
        pendingApplicationsCount,
        totalAffiliatesCount: affiliates.length,
        totalReferredPeople,
        totalPendingPeople,
        totalReferredRevenueKes,
        totalCommissionKes,
        totalCommissionPaidKes,
        totalCommissionOwedKes,
        totalCommissionDueKes: totalCommissionOwedKes,
        totalCompsEarned,
        totalCompsIssued,
        totalCompsOutstanding,
      },
    };
  }

  /**
   * Fetch a single affiliate with stats by code using the same single SQL query.
   */
  static async getAffiliateWithStatsByCode(code: string): Promise<AffiliateWithStats | null> {
    const result = await getSharedPool().query<RawAffiliateStatsRow>(
      `${AFFILIATE_STATS_SQL}
       WHERE LOWER(a.code) = LOWER($3)
       LIMIT 1`,
      [AFFILIATE_TERMS.commissionPerPersonKes, AFFILIATE_TERMS.peoplePerCompPass, code.trim()],
    );
    const row = result.rows[0];
    return row ? mapAffiliateRow(row) : null;
  }

  /**
   * GET /api/affiliates/check?code=
   * Checks whether a referral handle is available using the same normalization & reserved list.
   * Reveals nothing about who owns a code.
   */
  static async checkHandleAvailability(rawCode: unknown): Promise<{ available: boolean }> {
    const cleaned = typeof rawCode === "string"
      ? rawCode
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_-]/g, "")
      : "";

    if (!/^[a-z0-9_-]{2,32}$/.test(cleaned)) {
      return { available: false };
    }

    if (RESERVED_AFFILIATE_HANDLES.has(cleaned)) {
      return { available: false };
    }

    try {
      const existing = await getSharedPool().query<{ exists: number }>(
        "SELECT 1 AS exists FROM public.affiliates WHERE LOWER(code) = LOWER($1) LIMIT 1",
        [cleaned],
      );
      return { available: existing.rows.length === 0 };
    } catch {
      return { available: true };
    }
  }

  /**
   * POST /api/affiliates/apply (and POST /api/affiliates/register)
   * Public application endpoint: inserts with active=false, applied_at=now(), approved_at=null.
   */
  static async submitApplication(params: {
    name: string;
    phone: string;
    handle: string;
    email?: string | null | undefined;
    marketingConsent?: boolean | undefined;
    honeypot?: string | null | undefined;
  }): Promise<
    | { success: true; code: string }
    | { success: false; status: 400 | 409 | 429 | 500; code: string; message: string }
  > {
    const cleanedHandle = (params.handle || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");

    // Honeypot filled: return fake success and insert nothing
    if (params.honeypot && String(params.honeypot).trim().length > 0) {
      return {
        success: true,
        code: /^[a-z0-9_-]{2,32}$/.test(cleanedHandle) ? cleanedHandle : "member",
      };
    }

    const trimmedName = (params.name || "").trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return {
        success: false,
        status: 400,
        code: "INVALID_NAME",
        message: "Please enter your full name (2 to 80 characters).",
      };
    }

    const rawPhone = (params.phone || "").trim();
    const phoneCheck = validateAndNormalizeKenyanPhone(rawPhone);
    if (!phoneCheck.isValid || !/^254[71]\d{8}$/.test(phoneCheck.normalized)) {
      return {
        success: false,
        status: 400,
        code: "INVALID_PHONE",
        message:
          phoneCheck.error ||
          "Please enter a valid Kenyan M-Pesa number (07XXXXXXXX or 01XXXXXXXX).",
      };
    }
    const normalizedPhone = phoneCheck.normalized;

    let normalizedEmail: string | null = null;
    if (params.email && params.email.trim()) {
      const candidateEmail = params.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
        return {
          success: false,
          status: 400,
          code: "INVALID_EMAIL",
          message: "Please enter a valid email address.",
        };
      }
      normalizedEmail = candidateEmail;
    }

    if (!/^[a-z0-9_-]{2,32}$/.test(cleanedHandle)) {
      return {
        success: false,
        status: 400,
        code: "INVALID_HANDLE",
        message:
          "Your handle must be 2 to 32 characters using lowercase letters, numbers, underscores, or hyphens.",
      };
    }

    if (RESERVED_AFFILIATE_HANDLES.has(cleanedHandle)) {
      return {
        success: false,
        status: 400,
        code: "RESERVED_HANDLE",
        message: "That handle is reserved. Please choose a different handle.",
      };
    }

    const pool = getSharedPool();

    // Rate / queue guard: > 20 applications in last hour OR > 100 pending
    const queueRes = await pool.query<{ recent_count: number; pending_count: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE applied_at >= NOW() - INTERVAL '1 hour')::int AS recent_count,
        COUNT(*) FILTER (WHERE applied_at IS NOT NULL AND approved_at IS NULL AND rejected_at IS NULL)::int AS pending_count
      FROM public.affiliates
    `);
    const recentCount = Number(queueRes.rows[0]?.recent_count) || 0;
    const pendingCount = Number(queueRes.rows[0]?.pending_count) || 0;
    if (recentCount > 20 || pendingCount > 100) {
      return {
        success: false,
        status: 429,
        code: "APPLICATIONS_BUSY",
        message: "Applications are busy, try again later or message us on WhatsApp",
      };
    }

    // Check duplicate phone or email first — never reveal the existing handle
    const dupContactRes = await pool.query<{ exists: number }>(
      normalizedEmail
        ? "SELECT 1 AS exists FROM public.affiliates WHERE phone = $1 OR LOWER(email) = LOWER($2) LIMIT 1"
        : "SELECT 1 AS exists FROM public.affiliates WHERE phone = $1 LIMIT 1",
      normalizedEmail ? [normalizedPhone, normalizedEmail] : [normalizedPhone],
    );
    if (dupContactRes.rows.length > 0) {
      return {
        success: false,
        status: 409,
        code: "DUPLICATE_CONTACT",
        message: "This number is already registered. Message us on WhatsApp to get your link.",
      };
    }

    // Check taken handle
    const dupHandleRes = await pool.query<{ exists: number }>(
      "SELECT 1 AS exists FROM public.affiliates WHERE LOWER(code) = LOWER($1) LIMIT 1",
      [cleanedHandle],
    );
    if (dupHandleRes.rows.length > 0) {
      return {
        success: false,
        status: 409,
        code: "HANDLE_TAKEN",
        message: "That handle is already taken. Try adding numbers or your initials.",
      };
    }

    const marketingConsent = Boolean(params.marketingConsent);

    try {
      await pool.query(
        `INSERT INTO public.affiliates
          (code, name, phone, email, marketing_consent, consent_at, unsubscribed_at, notes, active, created_at, applied_at, approved_at, rejected_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END, NULL, NULL, false, NOW(), NOW(), NULL, NULL)`,
        [cleanedHandle, trimmedName, normalizedPhone, normalizedEmail, marketingConsent],
      );
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string; detail?: string; message?: string };
      if (pgErr?.code === "23505") {
        const info = `${pgErr.constraint || ""} ${pgErr.detail || ""} ${pgErr.message || ""}`.toLowerCase();
        if (info.includes("phone") || info.includes("email")) {
          return {
            success: false,
            status: 409,
            code: "DUPLICATE_CONTACT",
            message: "This number is already registered. Message us on WhatsApp to get your link.",
          };
        }
        return {
          success: false,
          status: 409,
          code: "HANDLE_TAKEN",
          message: "That handle is already taken. Try adding numbers or your initials.",
        };
      }
      throw err;
    }

    await writeAffiliateAuditLog({
      actorEmail: "public-application",
      action: "affiliate.applied",
      targetTable: "affiliates",
      code: cleanedHandle,
    });

    return {
      success: true,
      code: cleanedHandle,
    };
  }

  /**
   * Approve a pending affiliate application (active=true, approved_at=now())
   * Audit-logs only the code in metadata.
   */
  static async approveApplication(
    targetCode: string,
    actorEmail: string,
    actorId?: string | undefined,
  ): Promise<
    | { success: true; affiliate: AffiliateWithStats }
    | { success: false; status: 400 | 404 | 500; code: string; message: string }
  > {
    const cleanCode = (targetCode || "").trim().toLowerCase();
    if (!cleanCode) {
      return {
        success: false,
        status: 400,
        code: "INVALID_CODE",
        message: "Affiliate code is required.",
      };
    }

    const pool = getSharedPool();
    const res = await pool.query<{ code: string }>(
      `UPDATE public.affiliates
       SET active = true,
           approved_at = NOW(),
           rejected_at = NULL
       WHERE LOWER(code) = LOWER($1)
       RETURNING code`,
      [cleanCode],
    );
    const updatedCode = res.rows[0]?.code;
    if (!updatedCode) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: "Affiliate application not found.",
      };
    }

    await writeAffiliateAuditLog({
      actorEmail,
      actorId,
      action: "affiliate.approved",
      targetTable: "affiliates",
      code: updatedCode,
    });

    const affiliate = await this.getAffiliateWithStatsByCode(updatedCode);
    if (!affiliate) {
      return {
        success: false,
        status: 500,
        code: "FETCH_ERROR",
        message: "Application approved, but record could not be loaded.",
      };
    }
    return { success: true, affiliate };
  }

  /**
   * Reject a pending affiliate application (rejected_at=now(), stays inactive)
   * Audit-logs only the code in metadata.
   */
  static async rejectApplication(
    targetCode: string,
    actorEmail: string,
    actorId?: string | undefined,
  ): Promise<
    | { success: true; affiliate: AffiliateWithStats }
    | { success: false; status: 400 | 404 | 500; code: string; message: string }
  > {
    const cleanCode = (targetCode || "").trim().toLowerCase();
    if (!cleanCode) {
      return {
        success: false,
        status: 400,
        code: "INVALID_CODE",
        message: "Affiliate code is required.",
      };
    }

    const pool = getSharedPool();
    const res = await pool.query<{ code: string }>(
      `UPDATE public.affiliates
       SET active = false,
           rejected_at = NOW()
       WHERE LOWER(code) = LOWER($1)
       RETURNING code`,
      [cleanCode],
    );
    const updatedCode = res.rows[0]?.code;
    if (!updatedCode) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: "Affiliate application not found.",
      };
    }

    await writeAffiliateAuditLog({
      actorEmail,
      actorId,
      action: "affiliate.rejected",
      targetTable: "affiliates",
      code: updatedCode,
    });

    const affiliate = await this.getAffiliateWithStatsByCode(updatedCode);
    if (!affiliate) {
      return {
        success: false,
        status: 500,
        code: "FETCH_ERROR",
        message: "Application rejected, but record could not be loaded.",
      };
    }
    return { success: true, affiliate };
  }

  /**
   * POST /api/admin/affiliates
   */
  static async createAffiliate(params: {
    name: string;
    phone?: string | null | undefined;
    email?: string | null | undefined;
    code?: string | null | undefined;
    marketingConsent?: boolean | undefined;
    notes?: string | null | undefined;
    actorEmail: string;
    actorId?: string | undefined;
  }): Promise<
    | { success: true; affiliate: AffiliateWithStats }
    | { success: false; status: 400 | 409 | 500; code: string; message: string }
  > {
    const trimmedName = (params.name || "").trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return {
        success: false,
        status: 400,
        code: "INVALID_NAME",
        message: "Affiliate name must be between 2 and 80 characters.",
      };
    }

    let normalizedPhone: string | null = null;
    if (params.phone && params.phone.trim()) {
      const phoneCheck = validateAndNormalizeKenyanPhone(params.phone.trim());
      if (!phoneCheck.isValid || !/^254[71]\d{8}$/.test(phoneCheck.normalized)) {
        return {
          success: false,
          status: 400,
          code: "INVALID_PHONE",
          message:
            phoneCheck.error ||
            "Please enter a valid Kenyan phone number (07XXXXXXXX or 01XXXXXXXX).",
        };
      }
      normalizedPhone = phoneCheck.normalized;
    }

    let normalizedEmail: string | null = null;
    if (params.email && params.email.trim()) {
      const candidateEmail = params.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
        return {
          success: false,
          status: 400,
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address.",
        };
      }
      normalizedEmail = candidateEmail;
    }

    const pool = getSharedPool();

    // Check explicit code or auto-generate from name with numeric suffix if taken
    let finalCode: string;
    const rawCodeInput = (params.code || "").trim();
    if (rawCodeInput) {
      const cleaned = rawCodeInput
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");
      if (!/^[a-z0-9_-]{2,32}$/.test(cleaned)) {
        return {
          success: false,
          status: 400,
          code: "INVALID_CODE",
          message:
            "Affiliate code must be 2 to 32 characters using lowercase letters, digits, underscores, or hyphens.",
        };
      }
      const existingCode = await pool.query<{ code: string }>(
        "SELECT code FROM public.affiliates WHERE LOWER(code) = LOWER($1) LIMIT 1",
        [cleaned],
      );
      if (existingCode.rows.length > 0) {
        return {
          success: false,
          status: 409,
          code: "DUPLICATE_CODE",
          message: `Affiliate code '${cleaned}' is already in use.`,
        };
      }
      finalCode = cleaned;
    } else {
      const baseCode = generateAffiliateCodeBase(trimmedName);
      const existingCodesRes = await pool.query<{ code: string }>(
        "SELECT LOWER(code) AS code FROM public.affiliates WHERE LOWER(code) LIKE $1",
        [`${baseCode}%`],
      );
      const taken = new Set(existingCodesRes.rows.map((r) => r.code));
      if (!taken.has(baseCode)) {
        finalCode = baseCode;
      } else {
        let suffix = 2;
        while (taken.has(`${baseCode.slice(0, 32 - String(suffix).length)}${suffix}`)) {
          suffix++;
        }
        finalCode = `${baseCode.slice(0, 32 - String(suffix).length)}${suffix}`;
      }
    }

    // Check duplicate email
    if (normalizedEmail) {
      const dupEmail = await pool.query<{ code: string }>(
        "SELECT code FROM public.affiliates WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [normalizedEmail],
      );
      if (dupEmail.rows.length > 0) {
        return {
          success: false,
          status: 409,
          code: "DUPLICATE_EMAIL",
          message: "An affiliate with this email address already exists.",
        };
      }
    }

    // Check duplicate phone
    if (normalizedPhone) {
      const dupPhone = await pool.query<{ code: string }>(
        "SELECT code FROM public.affiliates WHERE phone = $1 LIMIT 1",
        [normalizedPhone],
      );
      if (dupPhone.rows.length > 0) {
        return {
          success: false,
          status: 409,
          code: "DUPLICATE_PHONE",
          message: "An affiliate with this phone number already exists.",
        };
      }
    }

    const marketingConsent = Boolean(params.marketingConsent);
    const trimmedNotes = params.notes && params.notes.trim() ? params.notes.trim() : null;

    try {
      await pool.query(
        `INSERT INTO public.affiliates
          (code, name, phone, email, marketing_consent, consent_at, unsubscribed_at, notes, active, created_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END, NULL, $6, true, NOW())`,
        [finalCode, trimmedName, normalizedPhone, normalizedEmail, marketingConsent, trimmedNotes],
      );
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string; detail?: string; message?: string };
      if (pgErr?.code === "23505") {
        const info = `${pgErr.constraint || ""} ${pgErr.detail || ""} ${pgErr.message || ""}`.toLowerCase();
        if (info.includes("email")) {
          return {
            success: false,
            status: 409,
            code: "DUPLICATE_EMAIL",
            message: "An affiliate with this email address already exists.",
          };
        }
        if (info.includes("phone")) {
          return {
            success: false,
            status: 409,
            code: "DUPLICATE_PHONE",
            message: "An affiliate with this phone number already exists.",
          };
        }
        return {
          success: false,
          status: 409,
          code: "DUPLICATE_CODE",
          message: `Affiliate code '${finalCode}' is already in use.`,
        };
      }
      throw err;
    }

    const changedFields = ["code", "name", "active", "marketing_consent"];
    if (normalizedPhone) changedFields.push("phone");
    if (normalizedEmail) changedFields.push("email");
    if (trimmedNotes) changedFields.push("notes");

    await writeAffiliateAuditLog({
      actorEmail: params.actorEmail,
      actorId: params.actorId,
      action: "affiliate.created",
      targetTable: "affiliates",
      code: finalCode,
      changedFields,
    });

    const affiliate = await this.getAffiliateWithStatsByCode(finalCode);
    if (!affiliate) {
      return {
        success: false,
        status: 500,
        code: "FETCH_ERROR",
        message: "Affiliate was created, but its record could not be loaded.",
      };
    }

    return { success: true, affiliate };
  }

  /**
   * PATCH /api/admin/affiliates/:code
   */
  static async updateAffiliate(
    targetCode: string,
    params: {
      code?: string | undefined;
      name?: string | undefined;
      phone?: string | null | undefined;
      email?: string | null | undefined;
      notes?: string | null | undefined;
      active?: boolean | undefined;
      marketingConsent?: boolean | undefined;
      actorEmail: string;
      actorId?: string | undefined;
    },
  ): Promise<
    | { success: true; affiliate: AffiliateWithStats }
    | { success: false; status: 400 | 404 | 409 | 500; code: string; message: string }
  > {
    const cleanTargetCode = (targetCode || "").trim().toLowerCase();
    if (!cleanTargetCode) {
      return {
        success: false,
        status: 400,
        code: "INVALID_CODE",
        message: "Affiliate code is required.",
      };
    }

    if (
      params.code !== undefined &&
      String(params.code).trim().toLowerCase() !== cleanTargetCode
    ) {
      return {
        success: false,
        status: 400,
        code: "CODE_IMMUTABLE",
        message: "Affiliate code cannot be changed once created.",
      };
    }

    const pool = getSharedPool();
    const existingRes = await pool.query<{
      code: string;
      name: string;
      phone: string | null;
      email: string | null;
      marketing_consent: boolean;
      consent_at: string | null;
      unsubscribed_at: string | null;
      notes: string | null;
      active: boolean;
    }>(
      `SELECT code, name, phone, email, marketing_consent, consent_at, unsubscribed_at, notes, active
       FROM public.affiliates
       WHERE LOWER(code) = LOWER($1)
       LIMIT 1`,
      [cleanTargetCode],
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: `Affiliate '${cleanTargetCode}' was not found.`,
      };
    }

    let nextName = existing.name;
    let nextPhone = existing.phone;
    let nextEmail = existing.email;
    let nextNotes = existing.notes;
    let nextActive = existing.active;
    let nextMarketingConsent = existing.marketing_consent;
    const changedFields: string[] = [];

    if (params.name !== undefined) {
      const trimmedName = params.name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        return {
          success: false,
          status: 400,
          code: "INVALID_NAME",
          message: "Affiliate name must be between 2 and 80 characters.",
        };
      }
      if (trimmedName !== existing.name) {
        nextName = trimmedName;
        changedFields.push("name");
      }
    }

    if (params.phone !== undefined) {
      const rawPhone = params.phone ? params.phone.trim() : "";
      if (!rawPhone) {
        if (existing.phone !== null) {
          nextPhone = null;
          changedFields.push("phone");
        }
      } else {
        const phoneCheck = validateAndNormalizeKenyanPhone(rawPhone);
        if (!phoneCheck.isValid || !/^254[71]\d{8}$/.test(phoneCheck.normalized)) {
          return {
            success: false,
            status: 400,
            code: "INVALID_PHONE",
            message:
              phoneCheck.error ||
              "Please enter a valid Kenyan phone number (07XXXXXXXX or 01XXXXXXXX).",
          };
        }
        if (phoneCheck.normalized !== existing.phone) {
          const dupPhone = await pool.query<{ code: string }>(
            "SELECT code FROM public.affiliates WHERE phone = $1 AND LOWER(code) <> LOWER($2) LIMIT 1",
            [phoneCheck.normalized, existing.code],
          );
          if (dupPhone.rows.length > 0) {
            return {
              success: false,
              status: 409,
              code: "DUPLICATE_PHONE",
              message: "An affiliate with this phone number already exists.",
            };
          }
          nextPhone = phoneCheck.normalized;
          changedFields.push("phone");
        }
      }
    }

    if (params.email !== undefined) {
      const rawEmail = params.email ? params.email.trim().toLowerCase() : "";
      if (!rawEmail) {
        if (existing.email !== null) {
          nextEmail = null;
          changedFields.push("email");
        }
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
          return {
            success: false,
            status: 400,
            code: "INVALID_EMAIL",
            message: "Please provide a valid email address.",
          };
        }
        if (rawEmail !== (existing.email || "").toLowerCase()) {
          const dupEmail = await pool.query<{ code: string }>(
            "SELECT code FROM public.affiliates WHERE LOWER(email) = LOWER($1) AND LOWER(code) <> LOWER($2) LIMIT 1",
            [rawEmail, existing.code],
          );
          if (dupEmail.rows.length > 0) {
            return {
              success: false,
              status: 409,
              code: "DUPLICATE_EMAIL",
              message: "An affiliate with this email address already exists.",
            };
          }
          nextEmail = rawEmail;
          changedFields.push("email");
        }
      }
    }

    if (params.notes !== undefined) {
      const trimmedNotes = params.notes && params.notes.trim() ? params.notes.trim() : null;
      if (trimmedNotes !== (existing.notes ?? null)) {
        nextNotes = trimmedNotes;
        changedFields.push("notes");
      }
    }

    if (params.active !== undefined) {
      const boolActive = Boolean(params.active);
      if (boolActive !== existing.active) {
        nextActive = boolActive;
        changedFields.push("active");
      }
    }

    if (params.marketingConsent !== undefined) {
      const boolConsent = Boolean(params.marketingConsent);
      if (boolConsent !== existing.marketing_consent) {
        nextMarketingConsent = boolConsent;
        changedFields.push("marketing_consent");
      }
    }

    try {
      await pool.query(
        `UPDATE public.affiliates
         SET name = $2,
             phone = $3,
             email = $4,
             notes = $5,
             active = $6,
             marketing_consent = $7,
             consent_at = CASE
               WHEN $7 = true AND marketing_consent = false THEN COALESCE(consent_at, NOW())
               ELSE consent_at
             END,
             unsubscribed_at = CASE
               WHEN $7 = true AND marketing_consent = false THEN NULL
               ELSE unsubscribed_at
             END
         WHERE LOWER(code) = LOWER($1)`,
        [
          existing.code,
          nextName,
          nextPhone,
          nextEmail,
          nextNotes,
          nextActive,
          nextMarketingConsent,
        ],
      );
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string; detail?: string; message?: string };
      if (pgErr?.code === "23505") {
        const info = `${pgErr.constraint || ""} ${pgErr.detail || ""} ${pgErr.message || ""}`.toLowerCase();
        if (info.includes("email")) {
          return {
            success: false,
            status: 409,
            code: "DUPLICATE_EMAIL",
            message: "An affiliate with this email address already exists.",
          };
        }
        if (info.includes("phone")) {
          return {
            success: false,
            status: 409,
            code: "DUPLICATE_PHONE",
            message: "An affiliate with this phone number already exists.",
          };
        }
      }
      throw err;
    }

    if (changedFields.length > 0) {
      const wasDeactivated = existing.active === true && nextActive === false;
      await writeAffiliateAuditLog({
        actorEmail: params.actorEmail,
        actorId: params.actorId,
        action: wasDeactivated ? "affiliate.deactivated" : "affiliate.updated",
        targetTable: "affiliates",
        code: existing.code,
        changedFields,
      });
    }

    const updated = await this.getAffiliateWithStatsByCode(existing.code);
    if (!updated) {
      return {
        success: false,
        status: 500,
        code: "FETCH_ERROR",
        message: "Affiliate was updated, but its record could not be reloaded.",
      };
    }

    return { success: true, affiliate: updated };
  }

  /**
   * POST /api/admin/affiliates/:code/payouts
   */
  static async recordPayout(
    targetCode: string,
    params: {
      amountKes: number;
      mpesaReference: string;
      note?: string | null | undefined;
      confirmOverpay?: boolean | undefined;
      actorEmail: string;
      actorId?: string | undefined;
    },
  ): Promise<
    | {
        success: true;
        payout: {
          affiliateCode: string;
          amountKes: number;
          mpesaReference: string;
          note: string | null;
          paidAt: string;
        };
        affiliate: AffiliateWithStats;
      }
    | {
        success: false;
        status: 400 | 404 | 409 | 500;
        code: string;
        message: string;
        requiresConfirmation?: boolean;
        owedKes?: number;
      }
  > {
    const cleanCode = (targetCode || "").trim().toLowerCase();
    if (!cleanCode) {
      return {
        success: false,
        status: 400,
        code: "INVALID_CODE",
        message: "Affiliate code is required.",
      };
    }

    const amountKes = Number(params.amountKes);
    if (!Number.isSafeInteger(amountKes) || amountKes <= 0) {
      return {
        success: false,
        status: 400,
        code: "INVALID_AMOUNT",
        message: "Payout amount (amountKes) must be a positive integer.",
      };
    }

    const mpesaReference = (params.mpesaReference || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{8,12}$/.test(mpesaReference)) {
      return {
        success: false,
        status: 400,
        code: "INVALID_MPESA_REFERENCE",
        message: "M-Pesa reference must be 8 to 12 uppercase letters and digits.",
      };
    }

    const trimmedNote = params.note && params.note.trim() ? params.note.trim() : null;

    const affiliate = await this.getAffiliateWithStatsByCode(cleanCode);
    if (!affiliate) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: `Affiliate '${cleanCode}' was not found.`,
      };
    }

    const pool = getSharedPool();
    const dupRef = await pool.query<{ mpesa_reference: string }>(
      "SELECT mpesa_reference FROM public.affiliate_payouts WHERE UPPER(mpesa_reference) = $1 LIMIT 1",
      [mpesaReference],
    );
    if (dupRef.rows.length > 0) {
      return {
        success: false,
        status: 409,
        code: "DUPLICATE_MPESA_REFERENCE",
        message: `M-Pesa reference '${mpesaReference}' has already been recorded.`,
      };
    }

    const balanceOwed = Math.max(0, affiliate.owedKes);
    if (amountKes > balanceOwed && params.confirmOverpay !== true) {
      return {
        success: false,
        status: 409,
        code: "OVERPAY_CONFIRMATION_REQUIRED",
        requiresConfirmation: true,
        owedKes: balanceOwed,
        message: `Payout amount (KES ${amountKes.toLocaleString()}) exceeds the current balance owed (KES ${balanceOwed.toLocaleString()}). Confirm overpay to record this payout.`,
      };
    }

    let paidAtIso = new Date().toISOString();
    try {
      const insertRes = await pool.query<{ paid_at: string }>(
        `INSERT INTO public.affiliate_payouts
          (affiliate_code, amount_kes, mpesa_reference, note, paid_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING paid_at`,
        [affiliate.code, amountKes, mpesaReference, trimmedNote],
      );
      if (insertRes.rows[0]?.paid_at) {
        paidAtIso = new Date(insertRes.rows[0].paid_at).toISOString();
      }
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505") {
        return {
          success: false,
          status: 409,
          code: "DUPLICATE_MPESA_REFERENCE",
          message: `M-Pesa reference '${mpesaReference}' has already been recorded.`,
        };
      }
      throw err;
    }

    const changedFields = ["amount_kes", "mpesa_reference"];
    if (trimmedNote) changedFields.push("note");

    await writeAffiliateAuditLog({
      actorEmail: params.actorEmail,
      actorId: params.actorId,
      action: "affiliate.payout_recorded",
      targetTable: "affiliate_payouts",
      code: affiliate.code,
      changedFields,
    });

    const updatedAffiliate = (await this.getAffiliateWithStatsByCode(affiliate.code)) || affiliate;

    return {
      success: true,
      payout: {
        affiliateCode: affiliate.code,
        amountKes,
        mpesaReference,
        note: trimmedNote,
        paidAt: paidAtIso,
      },
      affiliate: updatedAffiliate,
    };
  }

  /**
   * POST /api/referrals/visit (public)
   * Upserts today's affiliate_visits row only when the code matches an ACTIVE affiliate.
   * Always returns cleanly and stores no personal data.
   */
  static async recordVisit(rawCode: unknown, clientIp: string): Promise<void> {
    const rateCheck = SlidingWindowRateLimiter.check(clientIp, "referral_visit", {
      windowMs: 60_000,
      maxRequests: 30,
    });
    if (!rateCheck.allowed) {
      return;
    }
    const normalized = normalizeReferralCode(rawCode);
    if (!normalized) {
      return;
    }
    try {
      await getSharedPool().query(
        `INSERT INTO public.affiliate_visits (code, day, visits)
         SELECT a.code, CURRENT_DATE, 1
         FROM public.affiliates a
         WHERE LOWER(a.code) = LOWER($1) AND a.active = true
         ON CONFLICT (code, day)
         DO UPDATE SET visits = public.affiliate_visits.visits + 1`,
        [normalized],
      );
    } catch {
      // Reveal nothing and never fail caller
    }
  }

  /**
   * Opted-in active affiliates for the "Affiliates (opted in)" broadcast audience
   */
  static async getOptedInAffiliates(): Promise<
    Array<{
      code: string;
      name: string;
      email: string;
      createdAt: string;
    }>
  > {
    try {
      const result = await getSharedPool().query<{
        code: string;
        name: string;
        email: string;
        created_at: string;
      }>(
        `SELECT code, name, TRIM(LOWER(email)) AS email, created_at
         FROM public.affiliates
         WHERE active = true
           AND marketing_consent = true
           AND email IS NOT NULL
           AND TRIM(email) <> ''
           AND unsubscribed_at IS NULL
         ORDER BY created_at DESC`,
      );
      return result.rows.map((r) => ({
        code: r.code,
        name: r.name,
        email: r.email,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
