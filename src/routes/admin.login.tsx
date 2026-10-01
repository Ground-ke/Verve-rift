import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAdminAuth } from "@/lib/auth/admin-auth-context";
import { VerveIcon } from "@/components/brand/verve-logo";
import {
  KeyRound,
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFaviconLoading } from "@/lib/dynamic-favicon";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Portal Sign In — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content: "Secure organizer and operations authentication gateway for Verve & Co.",
      },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const { signInWithEmail, signInWithGoogle, signOut, user, isAuthenticated, isAdmin, isLoading } =
    useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic favicon indicates authentication progress
  useFaviconLoading(isSubmitting || isGoogleSigningIn || isLoading);

  const getAdminRedirect = () => {
    if (typeof window !== "undefined" && window.location.search) {
      return `/admin${window.location.search}`;
    }
    return "/admin";
  };

  // Staff sessions go directly to the dashboard; customer sessions stay on this page.
  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin) {
      const timer = setTimeout(() => {
        window.location.href = getAdminRedirect();
      }, 300);
      return () => clearTimeout(timer);
    }
    if (!isLoading && isAuthenticated && user?.role === "customer") {
      setErrorMessage("This account is not assigned an event staff role.");
      void signOut();
    }
  }, [isLoading, isAuthenticated, isAdmin, user?.role, signOut]);

  // 1. Sign In with Google
  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      if (!res.success) {
        setErrorMessage(res.message || "Failed to sign in with Google.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Google authentication error.");
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  // 2. Sign In with Email & Password
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await signInWithEmail(email, password);
      if (res.success) {
        toast.success("Event staff sign-in successful", {
          description: `Logged in as ${email}`,
        });
        window.location.href = getAdminRedirect();
      } else {
        setErrorMessage(res.message || "Authentication failed. Please verify credentials.");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Authentication failed. Please check credentials.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-oxblood-darker flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[38rem] h-[38rem] bg-oxblood/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-64 h-64 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header Branding */}
      <div className="text-center mb-8 relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 mb-3 group">
          <VerveIcon className="w-8 h-8 text-amber-400 group-hover:scale-105 transition-transform" />
          <span className="font-display text-2xl text-bone tracking-wide">Verve &amp; Co.</span>
        </Link>
        <h1 className="font-display text-3xl sm:text-4xl text-bone tracking-tight">
          Admin Portal Authentication
        </h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mt-1">
          Hauntings of the Rift · Operations &amp; Access Control Gateway
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md border border-lavender/20 bg-card/90 backdrop-blur-md p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Already Logged In Banner */}
        {isAuthenticated && isAdmin && (
          <div className="p-4 border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Active Admin Session Detected
            </div>
            <p className="text-[11px] text-emerald-200/80 mb-3">
              Signed in as <span className="font-mono text-emerald-100">{user?.email}</span> (
              {user?.name || "Administrator"}).
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => navigate({ to: "/admin" })}
                className="bg-emerald-600 hover:bg-emerald-500 text-bone text-xs font-mono h-8 flex-1"
              >
                Go to Dashboard
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={signOut}
                className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/60 text-xs h-8"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 border border-red-500/50 bg-red-950/40 flex items-start gap-3 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-red-300">Authentication Alert</p>
              <p className="text-[11px] leading-relaxed text-red-200/90">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* METHOD 1: SIGN IN WITH GOOGLE */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-bone flex items-center gap-1.5 font-bold">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-[10px]">
                1
              </span>
              Sign In with Google
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">Recommended</span>
          </div>

          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSigningIn || isSubmitting}
            className="w-full bg-white text-stone-900 hover:bg-stone-100 font-sans tracking-normal h-11 border border-stone-300 shadow-sm flex items-center justify-center gap-3 transition-colors active:scale-[0.99]"
          >
            {isGoogleSigningIn ? (
              <span className="text-xs font-medium flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin" />
                Connecting with Google...
              </span>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-xs font-semibold">Sign in with Google</span>
              </>
            )}
          </Button>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3 my-2">
          <div className="h-px bg-border/80 flex-1" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            or sign in with email
          </span>
          <div className="h-px bg-border/80 flex-1" />
        </div>

        {/* ========================================================================= */}
        {/* METHOD 2: SIGN IN WITH EMAIL */}
        {/* ========================================================================= */}
        <form onSubmit={handleSubmitEmail} className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-bone flex items-center gap-1.5 font-bold">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-[10px]">
                2
              </span>
              Sign In with Email
            </span>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="admin-email"
              className="text-xs text-lavender uppercase font-mono tracking-wider"
            >
              Organizer Email
            </Label>
            <div className="relative">
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="verve.n.co.ke@gmail.com"
                required
                className="bg-background border-border text-bone font-mono text-sm pl-9"
              />
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="admin-pass"
                className="text-xs text-lavender uppercase font-mono tracking-wider"
              >
                Password
              </Label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-muted-foreground hover:text-bone font-mono inline-flex items-center gap-1"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3 h-3" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Show
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <Input
                id="admin-pass"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="bg-background border-border text-bone font-mono text-sm pl-9 pr-9"
              />
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || isGoogleSigningIn}
            className="w-full bg-oxblood text-bone hover:bg-oxblood/90 border border-amber-500/30 font-sans tracking-wide mt-2 h-11"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-bone border-t-transparent rounded-full animate-spin" />
                <span>Authenticating Organizer...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>Sign In with Email</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </form>

        {/* Security Notice */}
        <div className="pt-2 flex items-start gap-2 text-[11px] text-muted-foreground font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>Event staff access is verified against your authenticated account role.</span>
        </div>
      </div>

      {/* Return to Public Site */}
      <div className="mt-6 text-center relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-bone transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Hauntings of the Rift Ticket Experience</span>
        </Link>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground font-mono relative z-10">
        Verve &amp; Co. Operational Systems · Nakuru, Kenya · 2026
      </footer>
    </div>
  );
}
