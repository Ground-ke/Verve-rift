import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabaseClient, isSupabaseConfigured } from "../supabase/client";
import { installStaffApiFetch } from "./staff-api-fetch";

installStaffApiFetch();

export type UserRole = "admin" | "scanner" | "customer";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isScanner: boolean;
  signInWithEmail: (
    email: string,
    password?: string,
  ) => Promise<{ success: boolean; message?: string }>;
  signInWithGoogle: (
    redirectPath?: "/admin/login" | "/tickets",
  ) => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

async function resolveUser(
  id: string,
  email: string | undefined,
  name: string | undefined,
): Promise<AdminUser> {
  let role: UserRole = "customer";

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", id);

    if (error) {
      console.error("Could not load authenticated user's role:", error);
      throw new Error("Your access role could not be verified. Please try again.");
    }

    const roles = new Set((data as unknown as Array<{ role: string }>).map((entry) => entry.role));
    if (roles.has("admin")) role = "admin";
    else if (roles.has("scanner")) role = "scanner";
  }

  const normalizedEmail = email?.trim().toLowerCase() || "";
  return {
    id,
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split("@")[0] || "Event staff",
    role,
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!isSupabaseConfigured || !supabaseClient) {
        setIsLoading(false);
        return;
      }

      try {
        const {
          data: { session },
          error,
        } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (session?.user) {
          const resolved = await resolveUser(
            session.user.id,
            session.user.email,
            session.user.user_metadata?.["name"] ?? session.user.user_metadata?.["full_name"],
          );
          if (mounted) setUser(resolved);
        }
      } catch (error) {
        console.error("Could not initialize the authenticated session:", error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void initialize();

    if (!isSupabaseConfigured || !supabaseClient) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        return;
      }

      window.setTimeout(() => {
        void resolveUser(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.["name"] ?? session.user.user_metadata?.["full_name"],
        )
          .then((resolved) => {
            if (mounted) setUser(resolved);
          })
          .catch((error: unknown) => {
            console.error("Could not verify the authenticated user's role:", error);
            if (mounted) setUser(null);
          });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password?: string) => {
    if (!isSupabaseConfigured || !supabaseClient) {
      return { success: false, message: "Organizer sign-in is not configured yet." };
    }
    if (!password) {
      return { success: false, message: "Enter your account password to continue." };
    }

    setIsLoading(true);
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return { success: false, message: error.message };
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session?.user) {
        return { success: false, message: "Sign-in completed without an active session." };
      }
      const resolved = await resolveUser(
        session.user.id,
        session.user.email,
        session.user.user_metadata?.["name"] ?? session.user.user_metadata?.["full_name"],
      );
      if (resolved.role === "customer") {
        await supabaseClient.auth.signOut();
        return { success: false, message: "This account is not assigned an event staff role." };
      }
      setUser(resolved);
      return { success: true };
    } catch (error) {
      console.error("Supabase sign-in failed:", error);
      await supabaseClient.auth.signOut();
      return {
        success: false,
        message: error instanceof Error ? error.message : "Sign-in failed.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (redirectPath: "/admin/login" | "/tickets" = "/admin/login") => {
    if (!isSupabaseConfigured || !supabaseClient) {
      return { success: false, message: "Organizer sign-in is not configured yet." };
    }

    setIsLoading(true);
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${redirectPath}` },
      });
      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (error) {
      console.error("Google sign-in could not be started:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Google sign-in failed.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    }
    setUser(null);
  };

  const role = user?.role ?? null;

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        role,
        isLoading,
        isAuthenticated: Boolean(user),
        isAdmin: role === "admin",
        isScanner: role === "scanner" || role === "admin",
        signInWithEmail,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return context;
}
