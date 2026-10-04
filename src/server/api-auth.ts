import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { supabaseServer } from "../lib/supabase/server";

export type StaffRole = "admin" | "scanner";

export interface ApiIdentity {
  userId: string;
  role: StaffRole;
}

export function isStaffAuthConfigured(): boolean {
  const url = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "").trim();
  const serviceRoleKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] || "").trim();

  const missing: string[] = [];
  if (!url) {
    missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  }
  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    console.error(
      `[StaffAuth] Organizer authentication is not configured. Missing environment variable(s): ${missing.join(", ")}`,
    );
    return false;
  }

  return true;
}

export function readBearerToken(request: Request): string | null {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  return token || null;
}

export function resolveSupabaseUserId(
  userId: string | null | undefined,
  error?: unknown,
): string | null {
  if (error) {
    const status =
      typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    if (status === 400 || status === 401) return null;
    throw error;
  }
  return userId ?? null;
}

export async function getAuthenticatedApiUser(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase authentication is not configured.");
  }

  const client = createClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    const status =
      typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    if (status === 400 || status === 401) return null;
    throw error;
  }
  if (!data.user?.id || !data.user.email) return null;
  return { userId: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export function requiredApiRoles(pathname: string): readonly StaffRole[] | null {
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return ["admin"];
  if (
    pathname === "/api/tickets/validate" ||
    pathname === "/api/tickets/checkin" ||
    pathname === "/api/tickets/stats"
  ) {
    return ["admin", "scanner"];
  }
  if (pathname === "/api/notifications/whatsapp") return ["admin", "scanner"];
  if (pathname === "/api/notifications" || pathname.startsWith("/api/notifications/")) {
    return ["admin"];
  }
  return null;
}

interface ApiAuthDependencies {
  verifyAccessToken: (token: string) => Promise<string | null>;
  lookupRoles: (userId: string) => Promise<string[] | null>;
}

type AuthorizationResult =
  | { success: true; identity: ApiIdentity }
  | { success: false; status: 401 | 403 | 503; message: string };

export function createApiAuthorizer(dependencies: ApiAuthDependencies | null) {
  return async (
    request: Request,
    allowedRoles: readonly StaffRole[],
  ): Promise<AuthorizationResult> => {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      return { success: false, status: 401, message: "A valid bearer token is required." };
    }
    if (!dependencies) {
      return { success: false, status: 503, message: "Staff authorization is unavailable." };
    }
    const token = match[1];
    if (!token) {
      return { success: false, status: 401, message: "A valid bearer token is required." };
    }

    try {
      const userId = await dependencies.verifyAccessToken(token);
      if (!userId) {
        return { success: false, status: 401, message: "The access token is invalid or expired." };
      }
      const roles = await dependencies.lookupRoles(userId);
      if (!roles) {
        return { success: false, status: 503, message: "The staff role could not be verified." };
      }
      const role = allowedRoles.find((allowedRole) => roles.includes(allowedRole));
      if (!role) {
        return { success: false, status: 403, message: "This account is not authorized." };
      }
      return { success: true, identity: { userId, role } };
    } catch (error) {
      console.error("Staff API authorization failed:", error);
      return { success: false, status: 503, message: "Staff authorization is unavailable." };
    }
  };
}

const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
const supabaseKey =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["SUPABASE_ANON_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_ANON_KEY"];
const roleClient = supabaseServer;

const authorizationDependencies: ApiAuthDependencies | null =
  supabaseUrl && supabaseKey && roleClient
    ? {
        async verifyAccessToken(token) {
          const client = createClient<Database>(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { data, error } = await client.auth.getUser(token);
          return resolveSupabaseUserId(data.user?.id, error);
        },
        async lookupRoles(userId) {
          const { data, error } = await roleClient
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          if (error || !data) throw error || new Error("No role records returned");
          return data.map(({ role }) => role);
        },
      }
    : null;

export const authorizeStaffApiRequest = createApiAuthorizer(authorizationDependencies);
