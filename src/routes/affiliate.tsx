import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Ticket,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerveBackButton, VerveIcon, VerveLogo } from "@/components/brand/verve-logo";
import { toast } from "sonner";

const AFFILIATE_TERMS = {
  commissionPerPersonKes: 140,
  peoplePerCompPass: 30,
};

function sanitizeHandle(raw: string): string {
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
    // Fallback for sandboxed iframes where navigator.clipboard is restricted
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
          "Join the official Hauntings of the Rift affiliate program. Earn KES 140 per person admitted on verified orders plus 1 free pass for every 30 guests, paid weekly via M-Pesa.",
      },
      {
        property: "og:title",
        content: "Be an Affiliate — Hauntings of the Rift | Verve & Co.",
      },
      {
        property: "og:description",
        content:
          "Share your personal link, bring your crew to Top Cliff Lodge on 31 October 2026, and earn KES 140 per person admitted + free milestone passes.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AffiliateProgramPage,
});

type TierKey = "revenant" | "soulbound" | "coven" | "outcasts";

const TIER_EARNINGS: Array<{
  key: TierKey;
  tier: string;
  type: string;
  admits: number;
  priceKes: number;
  commissionKes: number;
}> = [
  {
    key: "revenant",
    tier: "Revenant",
    type: "Single Pass",
    admits: 1,
    priceKes: 1500,
    commissionKes: 1 * AFFILIATE_TERMS.commissionPerPersonKes,
  },
  {
    key: "soulbound",
    tier: "Soulbound",
    type: "Couple Pass",
    admits: 2,
    priceKes: 2800,
    commissionKes: 2 * AFFILIATE_TERMS.commissionPerPersonKes,
  },
  {
    key: "coven",
    tier: "Coven",
    type: "Squad of 4",
    admits: 4,
    priceKes: 5000,
    commissionKes: 4 * AFFILIATE_TERMS.commissionPerPersonKes,
  },
  {
    key: "outcasts",
    tier: "Outcasts",
    type: "Crew of 6",
    admits: 6,
    priceKes: 6900,
    commissionKes: 6 * AFFILIATE_TERMS.commissionPerPersonKes,
  },
];

function AffiliateProgramPage() {
  const handleInputRef = useRef<HTMLInputElement>(null);
  const startSectionRef = useRef<HTMLElement>(null);
  const perksSectionRef = useRef<HTMLElement>(null);
  const calculatorRef = useRef<HTMLDivElement>(null);

  const [siteOrigin, setSiteOrigin] = useState("https://verve-rift.vercel.app");
  const [rawName, setRawName] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [affiliateEmail, setAffiliateEmail] = useState("");
  const [highlightInput, setHighlightInput] = useState(false);

  // Interactive Calculator State
  const [guestEstimate, setGuestEstimate] = useState<number>(30);
  const [tierCounts, setTierCounts] = useState<Record<TierKey, number>>({
    revenant: 6,
    soulbound: 4,
    coven: 4,
    outcasts: 0,
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPitch, setCopiedPitch] = useState(false);

  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registeredAffiliate, setRegisteredAffiliate] = useState<{
    code: string;
    name: string;
    phone: string | null;
    message: string;
  } | null>(null);

  useEffect(() => {
    setSiteOrigin(window.location.origin);
    try {
      const savedCode = localStorage.getItem("rift_affiliate_own_code");
      const savedPhone = localStorage.getItem("rift_affiliate_own_phone");
      if (savedCode) setRawName(savedCode);
      if (savedPhone) setMpesaPhone(savedPhone);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const normalizedCode = sanitizeHandle(rawName);
  const activeCode = normalizedCode.length >= 2 ? normalizedCode : "wanjiru";
  const isCodeReady = normalizedCode.length >= 2;
  const referralLink = `${siteOrigin}/?ref=${activeCode}#tickets`;

  const clampGuests = (val: number) => {
    if (!Number.isFinite(val)) return 1;
    return Math.max(1, Math.min(300, Math.round(val)));
  };

  const applyGuestPreset = (guests: number) => {
    const safeGuests = clampGuests(guests);
    setGuestEstimate(safeGuests);
    const covenCount = Math.floor(safeGuests / 8);
    const remainingAfterCoven = safeGuests - covenCount * 4;
    const soulboundCount = Math.floor(remainingAfterCoven / 4);
    const revenantCount = Math.max(0, safeGuests - covenCount * 4 - soulboundCount * 2);
    setTierCounts({
      revenant: revenantCount,
      soulbound: soulboundCount,
      coven: covenCount,
      outcasts: 0,
    });
  };

  const adjustTierPassCount = (key: TierKey, delta: number, scrollCalc = false) => {
    setTierCounts((prev) => {
      const nextCount = Math.max(0, Math.min(50, prev[key] + delta));
      const next = { ...prev, [key]: nextCount };
      const totalPeople =
        next.revenant * 1 + next.soulbound * 2 + next.coven * 4 + next.outcasts * 6;
      setGuestEstimate(Math.max(1, totalPeople));
      return next;
    });
    if (scrollCalc && calculatorRef.current) {
      calculatorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const resetCalculator = () => {
    applyGuestPreset(30);
    toast.info("Calculator reset to 30 guests (1st milestone pass)");
  };

  const estimatedCommissionKes = guestEstimate * AFFILIATE_TERMS.commissionPerPersonKes;
  const estimatedFreePasses = Math.floor(guestEstimate / AFFILIATE_TERMS.peoplePerCompPass);
  const progressInCurrentCycle = guestEstimate % AFFILIATE_TERMS.peoplePerCompPass;
  const guestsToNextComp =
    AFFILIATE_TERMS.peoplePerCompPass - progressInCurrentCycle;
  const milestoneProgressPercent =
    progressInCurrentCycle === 0 && guestEstimate >= AFFILIATE_TERMS.peoplePerCompPass
      ? 100
      : Math.round((progressInCurrentCycle / AFFILIATE_TERMS.peoplePerCompPass) * 100);

  const whatsappSharePitch = `Hauntings of the Rift goes down on Saturday, 31 October 2026 at Top Cliff Lodge, Nakuru (4 PM till dawn).\n\nGrab your pass or squad bundle here using my link:\n${referralLink}\n\n(Or enter "${activeCode}" in the "Who invited you?" box at checkout.)`;

  const scrollToGeneratorAndFocus = () => {
    startSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightInput(true);
    window.setTimeout(() => {
      handleInputRef.current?.focus();
    }, 350);
    window.setTimeout(() => {
      setHighlightInput(false);
    }, 2000);
  };

  const scrollToPerks = () => {
    perksSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCopyLink = async () => {
    if (!isCodeReady) {
      setHighlightInput(true);
      handleInputRef.current?.focus();
      setTimeout(() => setHighlightInput(false), 2000);
      toast.info("Type your name or handle above first — or use this sample link:", {
        description: `Copied sample link: ${referralLink}`,
      });
    }
    const ok = await copyTextSafe(referralLink);
    if (ok) {
      setCopiedLink(true);
      if (isCodeReady) {
        toast.success(`Copied your personal link (?ref=${activeCode})`);
      }
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      toast.error("Could not copy automatically — select the link text above and copy.");
    }
  };

  const handleCopyPitch = async () => {
    if (!isCodeReady) {
      setHighlightInput(true);
      handleInputRef.current?.focus();
      setTimeout(() => setHighlightInput(false), 2000);
    }
    const ok = await copyTextSafe(whatsappSharePitch);
    if (ok) {
      setCopiedPitch(true);
      toast.success(
        isCodeReady
          ? `Copied WhatsApp pitch for ?ref=${activeCode}`
          : "Copied sample WhatsApp pitch (type your handle above to customize it)",
      );
      setTimeout(() => setCopiedPitch(false), 2500);
    } else {
      toast.error("Could not copy automatically.");
    }
  };

  const handleActivateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistrationError(null);

    if (!isCodeReady) {
      setRegistrationError("Please enter your name or handle (at least 2 characters).");
      setHighlightInput(true);
      handleInputRef.current?.focus();
      return;
    }

    const trimmedPhone = mpesaPhone.trim();
    if (!trimmedPhone) {
      setRegistrationError("Please enter your Kenyan M-Pesa phone number (07XX or 01XX) for payouts.");
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch("/api/affiliates/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rawName.trim(),
          code: normalizedCode,
          phone: trimmedPhone,
          email: affiliateEmail.trim() || undefined,
          marketingConsent: Boolean(affiliateEmail.trim()),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setRegistrationError(data.message || "Could not register affiliate code. Check your phone format.");
        return;
      }

      const finalCode = data.code || normalizedCode;
      try {
        localStorage.setItem("rift_affiliate_own_code", finalCode);
        localStorage.setItem("rift_affiliate_own_phone", trimmedPhone);
        localStorage.setItem("rift_referral_code", finalCode);
      } catch {
        /* ignore storage errors */
      }

      setRegisteredAffiliate({
        code: finalCode,
        name: data.name || rawName.trim(),
        phone: data.phone || trimmedPhone,
        message:
          data.message ||
          `Your referral code ?ref=${finalCode} is active and registered for weekly M-Pesa payouts.`,
      });
      await copyTextSafe(`${siteOrigin}/?ref=${finalCode}#tickets`);
      toast.success(`Affiliate code ?ref=${finalCode} activated & link copied!`);
    } catch {
      // Save locally even on offline network so user never hits a dead end
      try {
        localStorage.setItem("rift_affiliate_own_code", normalizedCode);
        localStorage.setItem("rift_referral_code", normalizedCode);
      } catch {
        /* ignore */
      }
      setRegisteredAffiliate({
        code: normalizedCode,
        name: rawName.trim(),
        phone: trimmedPhone,
        message: `Your referral code ?ref=${normalizedCode} is ready to share at checkout.`,
      });
      toast.success(`Your referral link ?ref=${normalizedCode} is ready!`);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-oxblood-darker text-bone flex flex-col">
      {/* Sticky Header */}
      <header className="border-b border-border/80 bg-card/70 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <VerveBackButton to="/" label="Event Home" />
            <div className="h-4 w-px bg-border/80 hidden sm:block" />
            <Link to="/" className="flex items-center gap-2">
              <VerveIcon className="size-6 text-amber-400" />
              <span className="font-display text-sm tracking-wide text-bone">Verve &amp; Co.</span>
            </Link>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <button
              type="button"
              onClick={scrollToGeneratorAndFocus}
              className="text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer"
            >
              Create My Link
            </button>
            <Link
              to="/checkout"
              search={isCodeReady ? { ref: activeCode } : {}}
              className="text-bone-muted hover:text-bone underline underline-offset-4"
            >
              Buy Tickets &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 py-14 sm:py-20 border-b border-border/60 bg-gradient-to-b from-card/90 to-background/40">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-300">
            <span>Official Ambassador &amp; Crew Program</span>
            <span aria-hidden="true">·</span>
            <span>31 October 2026</span>
            <span aria-hidden="true">·</span>
            <span>Top Cliff Lodge, Nakuru</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-bone tracking-tight leading-[0.95] max-w-4xl">
            Bring Your People to the Rift. Get Paid on Every Guest.
          </h1>

          <p className="text-base sm:text-lg text-bone-muted max-w-2xl leading-relaxed">
            Whether you are a campus rep, DJ, creator, or the friend who organizes the group chat:
            share your personal referral code and earn{" "}
            <strong className="text-bone font-semibold">
              KES {AFFILIATE_TERMS.commissionPerPersonKes} for every person admitted
            </strong>{" "}
            plus{" "}
            <strong className="text-bone font-semibold">
              1 free pass for every {AFFILIATE_TERMS.peoplePerCompPass} people
            </strong>{" "}
            you bring. Paid weekly straight to your M-Pesa.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="event"
              size="xl"
              onClick={scrollToGeneratorAndFocus}
            >
              Generate My Link &amp; Start <ArrowRight />
            </Button>
            <Button
              type="button"
              variant="spectral"
              size="xl"
              onClick={scrollToPerks}
            >
              See Commission Breakdown
            </Button>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl w-full px-4 py-14 sm:py-16 space-y-16 flex-1">
        {/* 1. DIRECT REWARDS & PERKS BREAKDOWN */}
        <section ref={perksSectionRef} id="perks-breakdown" className="space-y-8 scroll-mt-20">
          <div className="space-y-2">
            <p className="text-xs font-mono text-amber-400">01. The Perks &amp; Payouts</p>
            <h2 className="font-display text-3xl sm:text-4xl text-bone">
              Real Cash Per Head + Free Milestone Passes
            </h2>
            <p className="text-sm text-bone-muted max-w-2xl">
              Because we pay per person admitted rather than per order, group passes multiply your
              commission automatically. Tap any pass tier below to test it in the live payout
              calculator.
            </p>
          </div>

          {/* 3 Core Highlight Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-amber-500/40 bg-card p-6 space-y-2">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-xs font-mono">Cash Commission</span>
                <Wallet className="size-5" />
              </div>
              <div className="font-display text-3xl text-bone tabular-nums">
                KES {AFFILIATE_TERMS.commissionPerPersonKes} / Guest
              </div>
              <p className="text-xs text-bone-muted leading-relaxed">
                Earned on every verified M-Pesa ticket purchase tied to your referral link or code.
              </p>
            </div>

            <div className="border border-lavender/40 bg-card p-6 space-y-2">
              <div className="flex items-center justify-between text-lavender">
                <span className="text-xs font-mono">Milestone Comp Pass</span>
                <Ticket className="size-5" />
              </div>
              <div className="font-display text-3xl text-bone tabular-nums">
                1 Free Pass / {AFFILIATE_TERMS.peoplePerCompPass} Guests
              </div>
              <p className="text-xs text-bone-muted leading-relaxed">
                Every {AFFILIATE_TERMS.peoplePerCompPass} admitted guests unlocks a complimentary
                cryptographic QR pass for you or a friend — on top of your KES 4,200 cash commission.
              </p>
            </div>

            <div className="border border-emerald-500/40 bg-card p-6 space-y-2">
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-xs font-mono">Direct M-Pesa Payouts</span>
                <Sparkles className="size-5" />
              </div>
              <div className="font-display text-3xl text-bone">Weekly Settlement</div>
              <p className="text-xs text-bone-muted leading-relaxed">
                Commissions are paid weekly by M-Pesa, with final event settlement on Monday, 2
                November 2026.
              </p>
            </div>
          </div>

          {/* Interactive Earnings Per Ticket Tier Table */}
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-background/60 text-xs font-mono text-muted-foreground">
                  <th className="py-3.5 px-4">Pass Tier</th>
                  <th className="py-3.5 px-4">Guests Admitted</th>
                  <th className="py-3.5 px-4">Ticket Price</th>
                  <th className="py-3.5 px-4 text-amber-300">Commission / Pass</th>
                  <th className="py-3.5 px-4 text-right">Test in Calculator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-sm">
                {TIER_EARNINGS.map((row) => {
                  const currentTierQty = tierCounts[row.key];
                  return (
                    <tr key={row.tier} className="hover:bg-background/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-bone">{row.tier}</span>
                        <span className="text-xs text-muted-foreground font-mono ml-2">
                          · {row.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-bone-muted tabular-nums">
                        {row.admits} {row.admits === 1 ? "person" : "people"}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-bone-muted tabular-nums">
                        KES {row.priceKes.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-sm font-semibold text-amber-300 tabular-nums">
                        + KES {row.commissionKes.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => adjustTierPassCount(row.key, -1)}
                            disabled={currentTierQty === 0}
                            className="size-7 grid place-items-center border border-border bg-background text-bone hover:border-amber-400/60 disabled:opacity-40 cursor-pointer"
                            aria-label={`Remove one ${row.tier} pass`}
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-6 text-center tabular-nums text-bone font-semibold">
                            {currentTierQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              adjustTierPassCount(row.key, 1);
                              toast.success(
                                `Added 1 ${row.tier} pass (+${row.admits} ${row.admits === 1 ? "guest" : "guests"} · +KES ${row.commissionKes})`,
                              );
                            }}
                            className="size-7 grid place-items-center border border-amber-500/40 bg-oxblood text-amber-300 hover:bg-oxblood/80 cursor-pointer"
                            aria-label={`Add one ${row.tier} pass`}
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2. INTERACTIVE LINK GENERATOR & EARNINGS CALCULATOR */}
        <section
          ref={startSectionRef}
          id="start-now"
          className="border border-amber-500/40 bg-card/90 p-6 sm:p-8 space-y-8 scroll-mt-20"
        >
          <div className="space-y-2 border-b border-border/80 pb-5">
            <p className="text-xs font-mono text-amber-400">02. Start Right Now in 60 Seconds</p>
            <h2 className="font-display text-3xl sm:text-4xl text-bone">
              Create Your Referral Link &amp; Lock In Your M-Pesa Number
            </h2>
            <p className="text-sm text-bone-muted max-w-2xl">
              Type your name or handle below to generate your personal tracking link immediately.
              When anyone clicks your link or types your handle into{" "}
              <span className="text-bone">&ldquo;Who invited you?&rdquo;</span> at checkout, the
              order is credited to you automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Handle Input + Instant Link + On-Page Activation */}
            <div className="lg:col-span-7 space-y-5">
              <form onSubmit={handleActivateAffiliate} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="affiliate-handle-input"
                      className="text-xs font-mono text-bone block"
                    >
                      1. Your Name or Handle *
                    </label>
                    <Input
                      ref={handleInputRef}
                      id="affiliate-handle-input"
                      value={rawName}
                      onChange={(e) => {
                        setRawName(e.target.value);
                        setRegistrationError(null);
                      }}
                      placeholder="e.g. wanjiru or dj_asiti"
                      maxLength={32}
                      className={`bg-background text-bone font-mono text-sm h-11 transition-colors ${
                        highlightInput
                          ? "border-amber-400 ring-2 ring-amber-400/40"
                          : "border-border"
                      }`}
                    />
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Your checkout code:{" "}
                      <span className="text-amber-300 font-semibold">{activeCode}</span>
                      {!isCodeReady && " (sample — type yours above)"}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="affiliate-phone-input"
                      className="text-xs font-mono text-bone block"
                    >
                      2. Your M-Pesa Number (For Payouts) *
                    </label>
                    <Input
                      id="affiliate-phone-input"
                      type="tel"
                      value={mpesaPhone}
                      onChange={(e) => {
                        setMpesaPhone(e.target.value);
                        setRegistrationError(null);
                      }}
                      placeholder="07XX XXX XXX"
                      className="bg-background border-border text-bone font-mono text-sm h-11"
                    />
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Used strictly to send your weekly M-Pesa commissions.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="affiliate-email-input"
                    className="text-xs font-mono text-bone block"
                  >
                    3. Your Email (Optional — for milestone comp passes &amp; updates)
                  </label>
                  <Input
                    id="affiliate-email-input"
                    type="email"
                    value={affiliateEmail}
                    onChange={(e) => setAffiliateEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-background border-border text-bone font-mono text-sm h-10"
                  />
                </div>

                {/* Generated Link Box */}
                <div className="p-4 bg-background border border-border space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <Link2 className="size-3.5" />
                      Your Personal Ticket Link
                    </span>
                    <span>Auto-fills checkout referral</span>
                  </div>

                  <div className="font-mono text-xs sm:text-sm text-bone break-all bg-card/80 px-3 py-2.5 border border-border/70 select-all">
                    {referralLink}
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <Button
                      type="button"
                      variant="event"
                      size="sm"
                      onClick={() => void handleCopyLink()}
                      className="font-mono text-xs cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="size-3.5 mr-1.5" />
                          Link Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5 mr-1.5" />
                          Copy My Referral Link
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyPitch()}
                      className="border-border text-bone hover:border-amber-400/50 font-mono text-xs cursor-pointer"
                    >
                      {copiedPitch ? (
                        <>
                          <Check className="size-3.5 mr-1.5 text-emerald-400" />
                          Invite Text Copied
                        </>
                      ) : (
                        <>
                          <MessageSquare className="size-3.5 mr-1.5 text-amber-400" />
                          Copy Group-Chat Pitch
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {registrationError && (
                  <div className="p-3 border border-red-500/50 bg-red-950/40 text-red-200 font-mono text-xs">
                    {registrationError}
                  </div>
                )}

                {registeredAffiliate ? (
                  <div className="p-4 border border-emerald-500/50 bg-emerald-950/30 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-display text-lg text-emerald-300">
                          Code Activated: ?ref={registeredAffiliate.code}
                        </div>
                        <p className="text-xs text-bone-muted font-mono">
                          {registeredAffiliate.message}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="event"
                        size="sm"
                        onClick={() => void handleCopyLink()}
                        className="font-mono text-xs"
                      >
                        <Copy className="size-3.5 mr-1.5" />
                        Copy Active Link
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/40 text-emerald-300 hover:text-bone font-mono text-xs"
                      >
                        <Link to="/checkout" search={{ ref: registeredAffiliate.code }}>
                          Test My Link on Checkout &rarr;
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border/60 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        variant="event"
                        size="lg"
                        disabled={isRegistering}
                        className="font-mono text-xs cursor-pointer"
                      >
                        {isRegistering
                          ? "Activating Your Code..."
                          : "Activate My Code & Save M-Pesa Number"}
                        <ArrowRight className="size-4 ml-1.5" />
                      </Button>

                      <Button
                        asChild
                        variant="outline"
                        size="lg"
                        className="border-border text-lavender hover:text-bone font-mono text-xs"
                      >
                        <Link to="/checkout" search={{ ref: activeCode }}>
                          Test Link on Checkout &rarr;
                        </Link>
                      </Button>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Registers your code and M-Pesa number directly with the Verve &amp; Co.
                      affiliate payout ledger.
                    </p>
                  </div>
                )}
              </form>
            </div>

            {/* Right Column: Interactive Earnings Calculator */}
            <div
              ref={calculatorRef}
              className="lg:col-span-5 border border-amber-500/40 bg-background/90 p-5 space-y-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-amber-400">Interactive Calculator</span>
                  <h3 className="font-display text-2xl text-bone">Estimate Your Payout</h3>
                </div>
                <button
                  type="button"
                  onClick={resetCalculator}
                  className="text-[11px] font-mono text-muted-foreground hover:text-bone flex items-center gap-1 px-2 py-1 border border-border bg-card cursor-pointer"
                  title="Reset calculator"
                >
                  <RotateCcw className="size-3" />
                  Reset
                </button>
              </div>

              {/* Guest Count Control: - / Number Input / + AND Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-muted-foreground">People Admitted:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyGuestPreset(guestEstimate - 1)}
                      disabled={guestEstimate <= 1}
                      className="size-8 grid place-items-center border border-border bg-card text-bone hover:border-amber-400/60 disabled:opacity-40 cursor-pointer"
                      aria-label="Decrease guests by 1"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={guestEstimate}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isNaN(val)) {
                          applyGuestPreset(val);
                        }
                      }}
                      aria-label="Number of guests admitted"
                      className="w-16 h-8 text-center font-mono text-sm font-bold text-amber-300 bg-card border border-amber-500/40 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => applyGuestPreset(guestEstimate + 1)}
                      className="size-8 grid place-items-center border border-amber-500/40 bg-oxblood text-amber-300 hover:bg-oxblood/80 cursor-pointer"
                      aria-label="Increase guests by 1"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={1}
                  max={120}
                  step={1}
                  value={Math.min(120, guestEstimate)}
                  onChange={(e) => applyGuestPreset(Number(e.target.value))}
                  onInput={(e) =>
                    applyGuestPreset(Number((e.target as HTMLInputElement).value))
                  }
                  aria-label="Slide to estimate guests admitted"
                  className="w-full h-2 accent-amber-400 cursor-pointer"
                />

                {/* Quick Guest Presets */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                  {[10, 20, 30, 60, 90, 120].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyGuestPreset(preset)}
                      className={`py-1.5 text-xs font-mono transition-colors border cursor-pointer tabular-nums ${
                        guestEstimate === preset
                          ? "bg-oxblood text-amber-300 border-amber-400 font-semibold"
                          : "bg-card text-muted-foreground border-border hover:text-bone hover:border-amber-500/40"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Pass Mix Quick Builder */}
              <div className="border-t border-border/80 pt-3.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>Or tap passes to build your crew mix:</span>
                  <span className="text-bone tabular-nums">{guestEstimate} total guests</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TIER_EARNINGS.map((tier) => (
                    <div
                      key={tier.key}
                      className="flex items-center justify-between p-2 border border-border/80 bg-card/60 text-xs font-mono"
                    >
                      <div className="min-w-0">
                        <div className="text-bone font-medium truncate">{tier.tier}</div>
                        <div className="text-[10px] text-amber-300/90 tabular-nums">
                          {tier.admits}p · +KES {tier.commissionKes}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustTierPassCount(tier.key, -1)}
                          disabled={tierCounts[tier.key] === 0}
                          className="size-6 grid place-items-center border border-border bg-background text-bone hover:border-amber-400/50 disabled:opacity-30 cursor-pointer"
                          aria-label={`Decrease ${tier.tier} passes`}
                        >
                          <Minus className="size-2.5" />
                        </button>
                        <span className="w-5 text-center text-bone font-semibold tabular-nums">
                          {tierCounts[tier.key]}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustTierPassCount(tier.key, 1)}
                          className="size-6 grid place-items-center border border-amber-500/40 bg-oxblood text-amber-300 hover:bg-oxblood/80 cursor-pointer"
                          aria-label={`Increase ${tier.tier} passes`}
                        >
                          <Plus className="size-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Calculated Output */}
              <div className="border-t border-border/80 pt-4 space-y-3 bg-card/50 p-3.5 border">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-mono text-muted-foreground">
                    Cash Commission (KES {AFFILIATE_TERMS.commissionPerPersonKes} &times;{" "}
                    {guestEstimate}):
                  </span>
                  <span className="font-display text-3xl text-emerald-300 tabular-nums">
                    KES {estimatedCommissionKes.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-mono text-muted-foreground">
                    Free Milestone Passes Earned:
                  </span>
                  <span className="font-display text-xl text-amber-300 tabular-nums">
                    {estimatedFreePasses} {estimatedFreePasses === 1 ? "Free Pass" : "Free Passes"}
                  </span>
                </div>

                {/* Progress Bar to Next Milestone Pass */}
                <div className="space-y-1 pt-1">
                  <div className="h-2 w-full bg-background border border-border overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-200"
                      style={{ width: `${milestoneProgressPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {estimatedFreePasses > 0
                      ? `Unlocked ${estimatedFreePasses} free pass(es)! ${guestsToNextComp} more guests unlocks free pass #${estimatedFreePasses + 1}.`
                      : `${guestsToNextComp} more admitted guests unlocks your 1st free pass + KES 4,200 cash.`}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="event"
                  size="sm"
                  onClick={() => {
                    if (isCodeReady) {
                      void handleCopyLink();
                    } else {
                      scrollToGeneratorAndFocus();
                    }
                  }}
                  className="w-full font-mono text-xs mt-1 cursor-pointer"
                >
                  {isCodeReady
                    ? `Copy My Link for KES ${estimatedCommissionKes.toLocaleString()}`
                    : `Claim KES ${estimatedCommissionKes.toLocaleString()} Target — Enter Handle`}
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* 3. HOW IT WORKS & PROGRAM RULES */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
          <div className="space-y-4">
            <p className="text-xs font-mono text-amber-400">03. How Tracking Works</p>
            <h2 className="font-display text-2xl sm:text-3xl text-bone">
              Two Ways Guests Credit You
            </h2>
            <ul className="space-y-3 text-sm text-bone-muted leading-relaxed">
              <li className="flex gap-3">
                <span className="font-mono text-amber-400 font-semibold shrink-0">01.</span>
                <span>
                  <strong className="text-bone">Automatic Link Capture:</strong> When someone opens
                  your{" "}
                  <code className="text-amber-300 font-mono text-xs">
                    /?ref={activeCode}#tickets
                  </code>{" "}
                  link, our site saves your code in their browser and pre-fills it at checkout.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-amber-400 font-semibold shrink-0">02.</span>
                <span>
                  <strong className="text-bone">Manual Checkout Entry:</strong> Even if a friend
                  goes straight to the website on another phone, they can type{" "}
                  <code className="text-amber-300 font-mono text-xs">{activeCode}</code> in the{" "}
                  <strong className="text-bone">&ldquo;Who invited you?&rdquo;</strong> field on
                  Step 1 of checkout.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-amber-400 font-semibold shrink-0">03.</span>
                <span>
                  <strong className="text-bone">Group Multiplier:</strong> Buying 1 Coven pass
                  counts as <strong className="text-bone">4 people admitted (KES 560)</strong>; 1
                  Outcasts pass counts as{" "}
                  <strong className="text-bone">6 people admitted (KES 840)</strong>.
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-mono text-amber-400">04. Simple House Rules</p>
            <h2 className="font-display text-2xl sm:text-3xl text-bone">
              Clear, Fraud-Proof &amp; Fair
            </h2>
            <ul className="space-y-3 text-sm text-bone-muted leading-relaxed">
              <li className="flex gap-3">
                <span className="font-mono text-emerald-400 font-semibold shrink-0">·</span>
                <span>
                  <strong className="text-bone">Official Paybill Only:</strong> Guests always pay
                  through the official checkout Paybill. Never collect ticket money to a personal
                  number.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-emerald-400 font-semibold shrink-0">·</span>
                <span>
                  <strong className="text-bone">Verified Orders Count:</strong> Commissions and
                  30-guest comp milestones count once an order&apos;s M-Pesa payment is verified and
                  active passes are issued. Cancelled or refunded tickets do not count.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-emerald-400 font-semibold shrink-0">·</span>
                <span>
                  <strong className="text-bone">No Unofficial Discounts:</strong> Ticket prices are
                  fixed across the event; your reward comes from the KES{" "}
                  {AFFILIATE_TERMS.commissionPerPersonKes}/guest commission and milestone comps.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Bottom Direct Action Bar */}
        <section className="border border-border bg-card/70 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-2xl text-bone">
              Ready to rally your crew for 31 October?
            </h3>
            <p className="text-xs sm:text-sm text-bone-muted">
              Lock in your handle above, drop your link in the group chat, and earn KES{" "}
              {AFFILIATE_TERMS.commissionPerPersonKes} on every person admitted.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              type="button"
              variant="event"
              size="lg"
              onClick={scrollToGeneratorAndFocus}
              className="font-mono text-xs cursor-pointer"
            >
              Create My Referral Link <ArrowRight className="size-4 ml-1" />
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-border text-bone font-mono text-xs"
            >
              <Link to="/checkout" search={isCodeReady ? { ref: activeCode } : {}}>
                Open Ticket Checkout
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40 px-4 py-10 mt-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <VerveLogo variant="horizontal" size="sm" showCo={true} linkToHome={true} />
            <span className="text-xs text-muted-foreground">
              · Hauntings of the Rift Affiliate Program
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-bone underline underline-offset-2">
              Event Home
            </Link>
            <span>·</span>
            <Link
              to="/checkout"
              search={isCodeReady ? { ref: activeCode } : {}}
              className="hover:text-bone underline underline-offset-2"
            >
              Buy Tickets
            </Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-bone underline underline-offset-2">
              Terms &amp; Conditions
            </Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-bone underline underline-offset-2">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
