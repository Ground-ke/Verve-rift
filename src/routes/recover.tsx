import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  Mail,
  Send,
  Ticket,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  VerveBackButton,
  VervePresenterBadge,
  VerveErrorState,
} from "@/components/brand/verve-logo";
import { DigitalTicketData } from "@/components/event/digital-ticket";
import { useFaviconLoading } from "@/lib/dynamic-favicon";

const recoverSearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/recover")({
  validateSearch: (search) => recoverSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Recover Tickets — Hauntings of the Rift | Verve & Co." },
      {
        name: "description",
        content: "Look up and access your digital event passes for Hauntings of the Rift.",
      },
      { property: "og:title", content: "Ticket Recovery — Hauntings of the Rift" },
      { property: "og:description", content: "Locate and access your digital admission tickets." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: RecoverRouteComponent,
});

function RecoverRouteComponent() {
  const search = Route.useSearch();
  const token = search.token;

  // Form State
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  // Token Verification State
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [recoveredTickets, setRecoveredTickets] = useState<DigitalTicketData[]>([]);
  const [recoveredEmail, setRecoveredEmail] = useState<string | null>(null);

  // Dynamic favicon reflects ticket recovery lookup or email dispatch
  useFaviconLoading(isSubmitting || verifyingToken);

  // Verify recovery token if present in URL
  useEffect(() => {
    async function verifyToken() {
      if (!token) return;

      try {
        setVerifyingToken(true);
        setTokenError(null);
        setTokenExpired(false);

        const res = await fetch(`/api/tickets/recover/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (data.expired) {
            setTokenExpired(true);
          }
          setTokenError(data.message || "Invalid or expired recovery link.");
          return;
        }

        setRecoveredTickets(data.tickets || []);
        setRecoveredEmail(data.email);
      } catch {
        setTokenError("Network error validating recovery link. Please try again.");
      } finally {
        setVerifyingToken(false);
      }
    }

    verifyToken();
  }, [token]);

  // Handle Recovery Form Submit
  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/tickets/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await res.json();

      if (!res.ok && data.code === "RATE_LIMITED") {
        setRateLimited(true);
        setFormError(data.message || "Too many recovery attempts. Please try again in 1 hour.");
        return;
      }

      setSubmitted(true);
      setSubmittedEmail(trimmedEmail);
    } catch {
      setFormError("Network error initiating ticket recovery. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If verifying a recovery token from email
  if (token) {
    if (verifyingToken) {
      return (
        <div className="min-h-screen bg-background px-4 py-20 flex items-center justify-center">
          <div className="text-center space-y-4">
            <RefreshCw className="size-8 animate-spin text-oxblood-light mx-auto" />
            <p className="font-display text-lg text-bone">Verifying secure recovery link...</p>
          </div>
        </div>
      );
    }

    if (tokenError || tokenExpired) {
      return (
        <div className="min-h-screen bg-background px-4 py-12">
          <div className="mx-auto max-w-xl">
            <div className="mb-6 flex items-center justify-between">
              <VerveBackButton to="/" label="Back to Event" />
              <VervePresenterBadge />
            </div>
            <VerveErrorState
              code={tokenExpired ? "410" : "401"}
              title={tokenExpired ? "Link Expired" : "Invalid Link"}
              description={
                tokenError ||
                "This ticket recovery link is no longer valid. Security links expire after 1 hour."
              }
              actionLabel="Request New Recovery Link"
              actionTo="/recover"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-bone/15 pb-4 mb-8">
            <Button asChild variant="ghost" size="sm" className="text-bone-muted hover:text-bone">
              <Link to="/">
                <ArrowLeft className="mr-2 size-4" /> Return to Event
              </Link>
            </Button>
            <VervePresenterBadge />
          </div>

          <div className="mb-8">
            <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/30 px-3 py-1 text-xs font-bold text-emerald-300 uppercase tracking-widest mb-3">
              <ShieldCheck className="size-3.5" /> Identity Verified: {recoveredEmail}
            </div>
            <h1 className="text-3xl font-display text-bone sm:text-4xl">YOUR RECOVERED PASSES</h1>
            <p className="text-sm text-bone-muted mt-1">
              Select any ticket pass below to view its official QR code and event entry details.
            </p>
          </div>

          {/* Recovered Tickets List */}
          {recoveredTickets.length === 0 ? (
            <div className="border border-border bg-card p-8 text-center space-y-4">
              <p className="text-bone-muted">
                No active tickets found matching{" "}
                <strong className="text-bone">{recoveredEmail}</strong>.
              </p>
              <Button asChild variant="event">
                <Link to="/checkout">Browse Tickets &amp; Passes</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recoveredTickets.map((tkt) => (
                <div
                  key={tkt.ticketNumber}
                  className="border border-bone/20 bg-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-bone/40"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-oxblood-light text-sm">
                        {tkt.ticketNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                          tkt.status === "valid"
                            ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300"
                            : "border-amber-500/50 bg-amber-950/40 text-amber-300"
                        }`}
                      >
                        {tkt.status === "valid" ? "VALID PASS" : "USED"}
                      </span>
                    </div>
                    <h3 className="font-display text-xl text-bone">{tkt.tierName}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-3">
                      <span>
                        Attendee: <strong className="text-bone">{tkt.attendeeName}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {tkt.admitsCount} Admits
                      </span>
                    </p>
                  </div>

                  <div>
                    <Button asChild variant="event" size="default" className="w-full sm:w-auto">
                      <Link to="/ticket/$code" params={{ code: tkt.ticketNumber }}>
                        <Ticket className="mr-2 size-4" /> Open Digital Pass
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 border-t border-bone/15 pt-6 text-center">
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <Link to="/recover">Look up a different email address</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-xl">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-bone/15 pb-4 mb-8">
          <Button asChild variant="ghost" size="sm" className="text-bone-muted hover:text-bone">
            <Link to="/">
              <ArrowLeft className="mr-2 size-4" /> Back to Event
            </Link>
          </Button>
          <VervePresenterBadge />
        </div>

        {/* Form or Confirmation */}
        {!submitted ? (
          <div className="space-y-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-oxblood-light">
                Self-Service Security
              </p>
              <h1 className="text-3xl font-display text-bone sm:text-4xl mt-1">TICKET RECOVERY</h1>
              <p className="text-sm text-bone-muted mt-2">
                Lost your ticket email or link? Enter the email address you used when booking. We
                will dispatch a cryptographic one-time access link to your inbox.
              </p>
            </div>

            <form
              onSubmit={handleRecoverSubmit}
              className="space-y-4 border border-border bg-card p-6 sm:p-8"
            >
              <div className="space-y-2">
                <label
                  htmlFor="recovery-email"
                  className="text-xs uppercase tracking-widest text-muted-foreground block"
                >
                  Purchaser Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="recovery-email"
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting || rateLimited}
                    className="pl-10 h-12 bg-background border-border text-bone placeholder:text-muted-foreground/60 text-base"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2.5 border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="event"
                size="xl"
                className="w-full"
                disabled={isSubmitting || rateLimited}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" /> Verifying Records...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" /> Send Secure Recovery Link
                  </>
                )}
              </Button>

              <div className="border-t border-border pt-4 text-[11px] text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-oxblood-light shrink-0" />
                <span>Rate limited to 3 recovery requests per hour for guest privacy.</span>
              </div>
            </form>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="border border-bone/20 bg-card p-6 sm:p-8 space-y-6 text-center">
            <div className="mx-auto grid size-12 place-items-center bg-oxblood/20 text-oxblood-light border border-oxblood/40">
              <Mail className="size-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-display text-bone">REQUEST RECEIVED</h2>
              <p className="text-sm text-bone-muted max-w-md mx-auto">
                If active tickets exist for <strong className="text-bone">{submittedEmail}</strong>,
                a recovery email will be attempted. Email delivery is not guaranteed.
              </p>
            </div>

            <div className="border border-bone/10 bg-background/50 p-4 text-xs text-muted-foreground space-y-2 text-left">
              <div className="flex items-center gap-2 text-bone font-medium">
                <Clock className="size-4 text-oxblood-light" /> Security Notice
              </div>
              <p>
                The recovery link is cryptographically signed with HMAC SHA-256 and will
                automatically expire in 1 hour.
              </p>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                size="default"
                className="border-bone/20 text-bone hover:bg-bone/10"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                }}
              >
                Look Up Another Email
              </Button>
              <Button
                asChild
                variant="ghost"
                size="default"
                className="text-bone-muted hover:text-bone"
              >
                <Link to="/">
                  Return to Event <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
        {/* Footer legal links */}
        <div className="pt-6 border-t border-border/40 text-center text-xs font-mono text-muted-foreground flex justify-center gap-4">
          <Link to="/terms" className="hover:text-bone underline">
            Terms &amp; Conditions
          </Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-bone underline">
            Privacy Policy
          </Link>
          <span>·</span>
          <a href="mailto:verve.n.co.ke@gmail.com" className="hover:text-bone underline">
            Support
          </a>
        </div>
      </div>
    </div>
  );
}
