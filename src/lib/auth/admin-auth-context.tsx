import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase/config";

export type UserRole = "admin" | "scanner" | "customer";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  token?: string;
  avatarUrl?: string;
  isFirebase?: boolean;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isScanner: boolean;
  firebaseUser: FirebaseUser | null;
  isFirebaseConfigured: boolean;
  authToken: string | null;
  signInWithEmail: (
    email: string,
    password?: string,
  ) => Promise<{ success: boolean; message?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const STORAGE_KEY = "rift_auth_session";

// Helper to determine if an email is an authorized organizer superadmin
export const isOrganizerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === "verve.n.co.ke@gmail.com" ||
    normalized === "erastus.n.gathungu@gmail.com" ||
    normalized.endsWith("@verve.co.ke")
  );
};

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AdminUser;
          if (parsed && parsed.email) {
            return parsed;
          }
        }
      } catch {
        // ignore parse error
      }
    }
    return null;
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("rift_auth_token") || null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session from Firebase Auth
  useEffect(() => {
    let isMounted = true;
    let unsubscribeFirebase: (() => void) | null = null;

    if (isFirebaseConfigured && auth) {
      try {
        unsubscribeFirebase = onAuthStateChanged(auth, async (fbUser) => {
          if (!isMounted) return;
          setFirebaseUser(fbUser);

          if (fbUser && fbUser.email) {
            const normalizedEmail = fbUser.email.toLowerCase();
            let role: UserRole = "customer";

            // Determine role by email and Firestore admin record
            if (isOrganizerEmail(normalizedEmail)) {
              role = "admin";
            } else if (normalizedEmail.includes("scanner")) {
              role = "scanner";
            } else {
              try {
                const adminDoc = await getDoc(doc(db, "admins", fbUser.uid));
                if (adminDoc.exists()) {
                  role = adminDoc.data().role || "admin";
                }
              } catch {
                // non-admin
              }
            }

            const token = await fbUser.getIdToken().catch(() => "");
            setAuthToken(token);
            if (typeof window !== "undefined") {
              sessionStorage.setItem("rift_auth_token", token);
            }

            const activeUser: AdminUser = {
              id: fbUser.uid,
              email: normalizedEmail,
              name: fbUser.displayName || normalizedEmail.split("@")[0],
              role,
              token,
              avatarUrl: fbUser.photoURL || undefined,
              isFirebase: true,
            };

            setUser(activeUser);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(activeUser));
            } catch {
              // ignore
            }

            // Sync user profile in Firestore
            setDoc(
              doc(db, "users", fbUser.uid),
              {
                uid: fbUser.uid,
                email: normalizedEmail,
                displayName: activeUser.name,
                role,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            ).catch(() => {});

            setIsLoading(false);
            return;
          }

          // No active Firebase user
          setUser(null);
          setAuthToken(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem("rift_auth_token");
          }
          setIsLoading(false);
        });
      } catch (err) {
        console.warn("[Auth] Firebase Auth initialization note:", err);
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, []);

  /**
   * Genuine Firebase Google Sign-In Popup
   */
  const signInWithGoogle = async (): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      if (!isFirebaseConfigured || !auth) {
        return {
          success: false,
          message: "Firebase authentication is not configured in this environment.",
        };
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      setFirebaseUser(fbUser);

      const email = (fbUser.email || "").toLowerCase();
      const role: UserRole = isOrganizerEmail(email)
        ? "admin"
        : email.includes("scanner")
          ? "scanner"
          : "customer";

      const token = await fbUser.getIdToken().catch(() => "");
      setAuthToken(token);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("rift_auth_token", token);
      }

      const activeUser: AdminUser = {
        id: fbUser.uid,
        email,
        name: fbUser.displayName || email.split("@")[0],
        role,
        token,
        avatarUrl: fbUser.photoURL || undefined,
        isFirebase: true,
      };

      setUser(activeUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeUser));

      return { success: true };
    } catch (err: unknown) {
      console.error("[Auth] Google Sign-In error:", err);
      const msg = err instanceof Error ? err.message : "Google authentication failed.";
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Real Organizer & Staff Sign In with Email & Password
   */
  const signInWithEmail = async (
    email: string,
    password?: string,
  ): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const enteredPassword = (password || "").trim();

      if (!normalizedEmail || !enteredPassword) {
        return { success: false, message: "Please enter both email and password." };
      }

      if (!isFirebaseConfigured || !auth) {
        return {
          success: false,
          message: "Authentication service is not configured.",
        };
      }

      const userCred = await signInWithEmailAndPassword(auth, normalizedEmail, enteredPassword);
      const fbUser = userCred.user;
      setFirebaseUser(fbUser);

      const token = await fbUser.getIdToken().catch(() => "");
      setAuthToken(token);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("rift_auth_token", token);
      }

      const role: UserRole = isOrganizerEmail(normalizedEmail)
        ? "admin"
        : normalizedEmail.includes("scanner")
          ? "scanner"
          : "customer";

      const activeUser: AdminUser = {
        id: fbUser.uid,
        email: normalizedEmail,
        name: fbUser.displayName || normalizedEmail.split("@")[0],
        role,
        token,
        isFirebase: true,
      };

      setUser(activeUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeUser));

      return { success: true };
    } catch (err: unknown) {
      console.error("[Auth] Sign-in error:", err);
      const msg =
        err instanceof Error ? err.message : "Authentication failed. Invalid email or password.";
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (auth && auth.currentUser) {
        await firebaseSignOut(auth);
      }
    } catch (err) {
      console.debug("[Auth] Sign out note:", err);
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem("rift_auth_token");
    }
    setUser(null);
    setFirebaseUser(null);
    setAuthToken(null);
  };

  const role = user ? user.role : null;
  const isAuthenticated = Boolean(user);
  const isAdmin = role === "admin";
  const isScanner = role === "scanner" || role === "admin";

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        role,
        isLoading,
        isAuthenticated,
        isAdmin,
        isScanner,
        firebaseUser,
        isFirebaseConfigured,
        authToken,
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
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
