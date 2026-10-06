import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Link2,
  MessageSquare,
  UserPlus,
  Wallet,
} from "lucide-react";
import { VerveBackButton, VerveLogo } from "@/components/brand/verve-logo";
import { toast } from "sonner";

export const AFFILIATE_TERMS = {
  commissionPerPersonKes: 140,
  peoplePerCompPass: 30,
} as const;

const RESERVED_HANDLES = new Set([
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

function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 32);
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback for restricted clipboard contexts
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    }
  } catch {
    return false;
  }
  return false;
}

export const Route = createFileRoute("/affiliate")({
  head: () => ({
    meta: [
      { title: "Be an Affiliate — Earn KES 140 Per Guest | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Join the Hauntings of the Rift affiliate program. Earn KES 140 for every guest you bring, plus a free pass for every 30 guests. Paid by M-Pesa.",
      },
      {
        property: "og:title",
        content: "Be an Affiliate — Hauntings of the Rift | Verve & Co.",
      },
      {
        property: "og:description",
        content:
          "Earn KES 140 for every guest you bring. Plus a free pass for every 30 guests. Paid by M-Pesa.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AffiliateProgramPage,
});

const EARNING_EXAMPLES = [10, 30, 60].map((guests) => {
  const cashKes = guests * AFFILIATE_TERMS.commissionPerPersonKes;
  const freePasses = Math.floor(guests / AFFILIATE_TERMS.peoplePerCompPass);
  return {
    guests,
    cashKes,
    freePasses,
  };
});

function AffiliateProgramPage() {
  const formSectionRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [siteOrigin, setSiteOrigin] = useState("https://verve-rift.vercel.app");
  const [isFormVisible, setIsFormVisible] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [handleEditedManually, setHandleEditedManually] = useState(false);
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [agreeRules, setAgreeRules] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  // Handle availability check state
  const [handleStatus, setHandleStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "reserved"
  >("idle");

  // Submission & Success state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteOrigin(window.location.origin);
    }
  }, []);

  // Hide sticky bottom CTA when form is on screen
  useEffect(() => {
    const target = formSectionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsFormVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Auto-fill handle from name until manually edited
  const handleNameChange = (value: string) => {
    setFullName(value);
    if (!handleEditedManually) {
      setHandleInput(normalizeHandle(value));
    }
  };

  const handleManualHandleChange = (value: string) => {
    setHandleEditedManually(true);
    setHandleInput(
      value
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32),
    );
  };

  const normalizedHandle = normalizeHandle(handleInput);
  const previewHandle = normalizedHandle || "your_handle";

  // Debounced handle availability check
  useEffect(() => {
    if (!normalizedHandle || normalizedHandle.length < 2) {
      setHandleStatus("idle");
      return;
    }

    if (RESERVED_HANDLES.has(normalizedHandle)) {
      setHandleStatus("reserved");
      return;
    }

    setHandleStatus("checking");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/affiliates/check?code=${encodeURIComponent(normalizedHandle)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setHandleStatus("idle");
          return;
        }
        const data = (await res.json()) as { available?: boolean };
        setHandleStatus(data.available ? "available" : "unavailable");
      } catch {
        if (!controller.signal.aborted) {
          setHandleStatus("idle");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedHandle]);

  const scrollToForm = () => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    formSectionRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      nameInputRef.current?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setSubmitError("Please enter your full name (2 to 80 characters).");
      return;
    }

    if (!mpesaPhone.trim()) {
      setSubmitError("Please enter your M-Pesa phone number.");
      return;
    }

    if (normalizedHandle.length < 2 || normalizedHandle.length > 32) {
      setSubmitError("Please choose a handle between 2 and 32 characters.");
      return;
    }

    if (RESERVED_HANDLES.has(normalizedHandle)) {
      setSubmitError("That handle is reserved. Please choose a different handle.");
      return;
    }

    if (!agreeRules) {
      setSubmitError("Please agree to the affiliate rules to join.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          phone: mpesaPhone.trim(),
          handle: normalizedHandle,
          email: email.trim() || undefined,
          marketingConsent,
          honeypot,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        message?: string;
      };

      if (!res.ok || !data.success) {
        setSubmitError(
          data.message || "Could not submit your application. Please check your details.",
        );
        return;
      }

      const finalCode = data.code || normalizedHandle;
      setAppliedCode(finalCode);
      toast.success("You're in! Your link is ready.");
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalReferralLink = appliedCode
    ? `${siteOrigin}/?ref=${appliedCode}`
    : `${siteOrigin}/?ref=${previewHandle}`;

  const handleCopyFinalLink = async () => {
    const ok = await copyTextSafe(finalReferralLink);
    if (ok) {
      setCopiedLink(true);
      toast.success("Link copied to clipboard");
      window.setTimeout(() => setCopiedLink(false), 2500);
    } else {
      toast.error("Could not copy automatically. Tap and hold the link to copy.");
    }
  };

  const whatsappMessage = `Come to Hauntings of the Rift, 31 Oct at Topcliff Lodge, Nakuru! Get tickets here: ${finalReferralLink}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-oxblood-darker text-bone pb-24">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-oxblood-darker/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <VerveBackButton to="/" label="Back to Event" />
          <VerveLogo size="sm" />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-6 space-y-10">
        {/* (a) HERO */}
        <section className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400">
            Hauntings of the Rift · Affiliate Program
          </p>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight text-bone">
            Earn KES {AFFILIATE_TERMS.commissionPerPersonKes} for every guest you bring.
          </h1>
          <p className="text-base text-bone-muted leading-relaxed">
            Plus a free pass for every {AFFILIATE_TERMS.peoplePerCompPass} guests. Paid by M-Pesa.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={scrollToForm}
              className="w-full min-h-[48px] bg-amber-400 hover:bg-amber-300 text-oxblood-darker font-semibold text-base px-5 py-3 transition-colors motion-reduce:transition-none"
            >
              Join in 1 minute
            </button>
          </div>
        </section>

        {/* (b) HOW IT WORKS */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-2xl text-bone">How it works</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3.5 border border-border/70 bg-card/60 p-4">
              <div className="grid size-10 shrink-0 place-items-center border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <UserPlus className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-bone">1. Join</h3>
                <p className="text-sm text-bone-muted mt-0.5 leading-relaxed">
                  Fill in your name, M-Pesa number, and pick a handle to get your personal link.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 border border-border/70 bg-card/60 p-4">
              <div className="grid size-10 shrink-0 place-items-center border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <Link2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-bone">2. Share your link</h3>
                <p className="text-sm text-bone-muted mt-0.5 leading-relaxed">
                  Send your link to friends or group chats. They can also type your handle at
                  checkout.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 border border-border/70 bg-card/60 p-4">
              <div className="grid size-10 shrink-0 place-items-center border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <Wallet className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-bone">3. Get paid</h3>
                <p className="text-sm text-bone-muted mt-0.5 leading-relaxed">
                  Earn KES {AFFILIATE_TERMS.commissionPerPersonKes} per guest on paid orders, sent
                  to your M-Pesa every week.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* (c) WHAT YOU COULD EARN */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-2xl text-bone">What you could earn</h2>
          <div className="grid grid-cols-1 gap-3">
            {EARNING_EXAMPLES.map(({ guests, cashKes, freePasses }) => (
              <div
                key={guests}
                className="flex items-center justify-between border border-border/70 bg-card/60 px-4 py-3.5"
              >
                <span className="font-mono text-sm text-bone-muted">{guests} guests</span>
                <span className="font-display text-lg text-amber-300 text-right">
                  KES {cashKes.toLocaleString()}
                  {freePasses > 0
                    ? ` + ${freePasses} free ${freePasses === 1 ? "pass" : "passes"}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="text-sm text-bone-muted leading-relaxed">
            Each person admitted counts: a Coven pass counts as 4 guests.
          </p>
        </section>

        {/* (d) THE FORM OR SUCCESS STATE */}
        <section ref={formSectionRef} id="apply" className="border-t border-border/60 pt-8">
          {appliedCode ? (
            <div className="border border-emerald-500/40 bg-card p-5 space-y-5">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="size-6 shrink-0" />
                <h2 className="font-display text-2xl text-bone">
                  You&apos;re in! Your link is ready.
                </h2>
              </div>

              <div className="border border-amber-500/40 bg-oxblood-darker p-3.5 space-y-1">
                <span className="block font-mono text-[11px] uppercase tracking-wider text-amber-400">
                  Your personal link
                </span>
                <p className="font-mono text-sm text-bone break-all select-all">
                  {finalReferralLink}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void handleCopyFinalLink()}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-oxblood-darker font-semibold text-base px-4 py-3 transition-colors motion-reduce:transition-none"
                >
                  {copiedLink ? <Check className="size-5" /> : <Copy className="size-5" />}
                  {copiedLink ? "Link copied" : "Copy link"}
                </button>

                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 border border-emerald-500/50 bg-emerald-950/50 hover:bg-emerald-950/80 text-emerald-200 font-semibold text-base px-4 py-3 transition-colors motion-reduce:transition-none"
                >
                  <MessageSquare className="size-5 text-emerald-400" />
                  Share on WhatsApp
                </a>
              </div>

              <p className="text-sm text-bone-muted leading-relaxed">
                Your link tracks right away. Earnings are confirmed once we approve your
                application, usually within 24 hours. Tip: ask friends to type your handle in the
                &apos;Who invited you?&apos; box at checkout too.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="border border-border/80 bg-card p-5 space-y-5"
              noValidate
            >
              <h2 className="font-display text-2xl text-bone">Join the program</h2>

              {submitError && (
                <div
                  role="alert"
                  className="border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200"
                >
                  {submitError}
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label htmlFor="affiliate-name" className="block text-sm font-medium text-bone">
                  Full name
                </label>
                <input
                  ref={nameInputRef}
                  id="affiliate-name"
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Wanjiru Kamau"
                  className="w-full min-h-[48px] border border-border bg-oxblood-darker px-3.5 py-2.5 text-base text-bone placeholder:text-muted-foreground focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* M-Pesa Number */}
              <div className="space-y-1.5">
                <label htmlFor="affiliate-phone" className="block text-sm font-medium text-bone">
                  M-Pesa number
                </label>
                <input
                  id="affiliate-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="w-full min-h-[48px] border border-border bg-oxblood-darker px-3.5 py-2.5 text-base text-bone placeholder:text-muted-foreground focus:border-amber-400 focus:outline-none"
                />
                <p className="text-xs text-bone-muted leading-relaxed">
                  We pay to this number. The M-Pesa name should match your name.
                </p>
              </div>

              {/* Handle */}
              <div className="space-y-1.5">
                <label htmlFor="affiliate-handle" className="block text-sm font-medium text-bone">
                  Handle
                </label>
                <input
                  id="affiliate-handle"
                  name="handle"
                  type="text"
                  required
                  minLength={2}
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={handleInput}
                  onChange={(e) => handleManualHandleChange(e.target.value)}
                  placeholder="wanjiru"
                  className="w-full min-h-[48px] border border-border bg-oxblood-darker px-3.5 py-2.5 font-mono text-base text-bone placeholder:text-muted-foreground focus:border-amber-400 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-amber-300 break-all">
                    Your link: verve-rift.vercel.app/?ref={previewHandle}
                  </span>
                  {handleStatus === "checking" && (
                    <span className="font-mono text-bone-muted">Checking...</span>
                  )}
                  {handleStatus === "available" && (
                    <span className="font-mono text-emerald-400">Available</span>
                  )}
                  {handleStatus === "unavailable" && (
                    <span className="font-mono text-red-300">Already taken</span>
                  )}
                  {handleStatus === "reserved" && (
                    <span className="font-mono text-red-300">Reserved handle</span>
                  )}
                </div>
              </div>

              {/* Optional Email */}
              <div className="space-y-1.5">
                <label htmlFor="affiliate-email" className="block text-sm font-medium text-bone">
                  Email <span className="text-xs font-normal text-bone-muted">(optional)</span>
                </label>
                <input
                  id="affiliate-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[48px] border border-border bg-oxblood-darker px-3.5 py-2.5 text-base text-bone placeholder:text-muted-foreground focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Hidden Honeypot Field */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="affiliate-website">Website</label>
                <input
                  id="affiliate-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-1">
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="size-5 shrink-0 accent-amber-400"
                  />
                  <span className="text-sm text-bone">Send me event updates</span>
                </label>

                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    required
                    checked={agreeRules}
                    onChange={(e) => setAgreeRules(e.target.checked)}
                    className="size-5 shrink-0 accent-amber-400"
                  />
                  <span className="text-sm text-bone">I agree to the affiliate rules</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-oxblood-darker font-semibold text-base px-5 py-3 transition-colors motion-reduce:transition-none"
              >
                {isSubmitting ? "Submitting..." : "Join the program"}
              </button>
              <p className="text-xs text-bone-muted leading-relaxed">
                We use your details only to run the affiliate program and pay you. Never shared or sold.
              </p>
            </form>
          )}
        </section>

        {/* (e) THE FINE PRINT (Collapsed Accordions) */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-2xl text-bone">The fine print</h2>

          <details className="group border border-border/70 bg-card/50">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-bone">
              <span>When does a guest count?</span>
              <ChevronDown className="size-4 shrink-0 text-bone-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-border/50 px-4 py-3 text-sm text-bone-muted leading-relaxed">
              A guest counts once their M-Pesa payment is verified and their ticket is active.
              Single passes count as 1 guest, couple passes as 2, Coven passes as 4, and Outcasts
              passes as 6. Cancelled or refunded tickets do not count.
            </div>
          </details>

          <details className="group border border-border/70 bg-card/50">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-bone">
              <span>How and when do payouts happen?</span>
              <ChevronDown className="size-4 shrink-0 text-bone-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-border/50 px-4 py-3 text-sm text-bone-muted leading-relaxed">
              Once your application is approved, we send commissions by M-Pesa to the number you
              registered. Every {AFFILIATE_TERMS.peoplePerCompPass} verified guests also earns 1
              complimentary pass.
            </div>
          </details>

          <details className="group border border-border/70 bg-card/50">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-bone">
              <span>Program rules</span>
              <ChevronDown className="size-4 shrink-0 text-bone-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-border/50 px-4 py-3 text-sm text-bone-muted leading-relaxed">
              All ticket payments must be made directly by the buyer to the official Paybill at
              checkout. Never collect cash or personal M-Pesa transfers for tickets. Do not post
              fake discount claims or spam. Hauntings of the Rift is an 18+ event.
            </div>
          </details>

          <div className="pt-2 text-xs text-bone-muted">
            <Link to="/terms" className="underline underline-offset-4 hover:text-bone">
              View Event Terms &amp; Privacy Policy
            </Link>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Button — hides when form is on screen or after applying */}
      {!isFormVisible && !appliedCode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-oxblood-darker/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={scrollToForm}
              className="w-full min-h-[48px] bg-amber-400 hover:bg-amber-300 text-oxblood-darker font-semibold text-base px-5 py-3 transition-colors motion-reduce:transition-none"
            >
              Join in 1 minute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
