import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Ticket,
  ShieldCheck,
  CheckCircle2,
  Users,
  Download,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  Mail,
  Search,
  LogIn,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerveBackButton, VervePresenterBadge, VerveLogo } from "@/components/brand/verve-logo";
import { useAdminAuth } from "@/lib/auth/admin-auth-context";
import { supabaseClient } from "@/lib/supabase/client";
import { useFaviconLoading } from "@/lib/dynamic-favicon";
import { toast } from "sonner";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [
      { title: "My Tickets & Passes — Hauntings of the Rift | Verve & Co." },
      {
        name: "description",
        content: "Access and manage your digital event passes for Hauntings of the Rift.",
      },
      { property: "og:title", content: "Attendee Passes — Hauntings of the Rift" },
      { property: "og:description", content: "Secure attendee ticket portal." },
      { property: "og:type", content: "website" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TicketsPortalPage,
});

interface AttendeeTicket {
  ticketNumber: string;
  orderNumber: string;
  tierName: string;
  admitsCount: number;
  attendeeName: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  priceKes: number;
  issuedAt: string;
  venue: {
    name: string;
    address: string;
    city: string;
    date: string;
    time: string;
  };
}

function TicketsPortalPage() {
  const { user, isAuthenticated, signInWithGoogle, isLoading: authLoading } = useAdminAuth();
  const [tickets, setTickets] = useState<AttendeeTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  useFaviconLoading(authLoading || isLoadingTickets);

  useEffect(() => {
    async function loadUserTickets() {
      if (!user?.email) {
        setTickets([]);
        setHasFetched(true);
        return;
      }

      setIsLoadingTickets(true);
      try {
        if (!supabaseClient) throw new Error("Account authentication is unavailable.");
        const {
          data: { session },
          error: sessionError,
        } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) {
          setTickets([]);
          return;
        }
        const res = await fetch("/api/user/tickets", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.tickets)) {
          throw new Error(data.message || "Unable to load your ticket records.");
        }
        setTickets(data.tickets);
      } catch (error) {
        console.error("[TicketsPortal] Error fetching tickets:", error);
        toast.error(error instanceof Error ? error.message : "Unable to load your ticket records.");
      } finally {
        setIsLoadingTickets(false);
        setHasFetched(true);
      }
    }

    if (!authLoading) {
      loadUserTickets();
    }
  }, [user?.email, authLoading]);

  const handleGoogleSignIn = async () => {
    const res = await signInWithGoogle("/tickets");
    if (res.success) {
      toast.success("Signed in successfully. Retrieving your event passes...");
    } else {
      toast.error(res.message || "Failed to sign in with Google.");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-bone/15 pb-4">
          <VerveBackButton to="/" label="Return to Event" />
          <VervePresenterBadge />
        </div>

        {/* Portal Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 border border-amber-500/30 bg-amber-950/20 px-3 py-1 text-xs font-bold text-amber-300 uppercase tracking-widest font-mono">
            <Ticket className="size-3.5" />
            Attendee Ticket Vault
          </div>
          <h1 className="font-display text-3xl sm:text-5xl text-bone tracking-tight">
            YOUR DIGITAL PASSES
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Authoritative ticket records tied to your attendee account. Valid passes can be
            presented at the gates on Saturday, 31 October 2026.
          </p>
        </div>

        {/* Not Logged In State: Sign-In Gateway & Guest Recovery */}
        {!isAuthenticated && !authLoading && (
          <div className="border border-bone/20 bg-card p-6 sm:p-8 space-y-6">
            <div className="max-w-xl space-y-2">
              <h2 className="font-display text-xl text-bone">Access Your Event Passes</h2>
              <p className="text-xs text-muted-foreground">
                Sign in with the Google account used during purchase, or request a secure one-time
                guest recovery email.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                className="bg-white text-stone-900 hover:bg-stone-100 font-sans h-11 px-6 border border-stone-300 flex items-center justify-center gap-3 font-semibold text-xs"
              >
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
                Sign in with Google
              </Button>

              <Button
                asChild
                variant="outline"
                className="border-border text-bone hover:border-amber-400 h-11 text-xs font-mono"
              >
                <Link to="/recover">
                  <Mail className="mr-2 size-4 text-amber-400" />
                  Guest Ticket Recovery (Email Link)
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* Authenticated State Header */}
        {isAuthenticated && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-emerald-500/30 bg-emerald-950/20 text-emerald-200">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-300">Signed In as Attendee</p>
                <p className="text-[11px] font-mono text-emerald-200/80">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-emerald-500/40 text-emerald-300 text-xs font-mono h-8"
              >
                <Link to="/recover">Send Backup Email Link</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoadingTickets && (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="size-8 animate-spin text-amber-400 mx-auto" />
            <p className="font-mono text-xs text-muted-foreground">
              Retrieving verified passes from ledger...
            </p>
          </div>
        )}

        {/* Tickets List */}
        {!isLoadingTickets && hasFetched && isAuthenticated && (
          <div className="space-y-4">
            {tickets.length === 0 ? (
              <div className="border border-border bg-card p-10 text-center space-y-4">
                <Ticket className="size-10 text-muted-foreground mx-auto" />
                <div className="space-y-1">
                  <h3 className="font-display text-lg text-bone">
                    No Passes Found for {user?.email}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    If you purchased tickets using a different email address or as a guest, please
                    use the guest recovery flow.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button asChild variant="event">
                    <Link to="/checkout">Buy Tickets &amp; Passes</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/recover">Find Passes by Email</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {tickets.map((tkt) => (
                  <div
                    key={tkt.ticketNumber}
                    className="border border-bone/20 bg-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition hover:border-bone/40"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {tkt.ticketNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                            tkt.status === "valid"
                              ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300"
                              : "border-amber-500/50 bg-amber-950/40 text-amber-300"
                          }`}
                        >
                          {tkt.status === "valid" ? "VALID ENTRY PASS" : tkt.status.toUpperCase()}
                        </span>
                      </div>

                      <h3 className="font-display text-2xl text-bone tracking-wide">
                        {tkt.tierName}
                      </h3>

                      <div className="text-xs text-muted-foreground font-mono flex flex-wrap items-center gap-3">
                        <span>
                          Attendee: <strong className="text-bone">{tkt.attendeeName}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> {tkt.admitsCount} Admits
                        </span>
                        <span>•</span>
                        <span>Order #{tkt.orderNumber}</span>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {tkt.venue.name} · {tkt.venue.date}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <Button asChild variant="event" size="sm" className="font-mono text-xs">
                        <Link to="/ticket/$code" params={{ code: tkt.ticketNumber }}>
                          <ExternalLink className="mr-1.5 size-3.5" />
                          View QR Pass
                        </Link>
                      </Button>
                      <a
                        href={`/api/tickets/${tkt.ticketNumber}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-border text-xs font-mono text-muted-foreground hover:text-bone"
                        >
                          <Download className="mr-1.5 size-3.5" />
                          PDF Pass
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
