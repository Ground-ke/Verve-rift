import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  Clock3,
  MapPin,
  Menu,
  Moon,
  Share2,
  Shirt,
  Sparkles,
  Users,
  Volume2,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import heroImage from "@/assets/rift-night.jpg";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Countdown } from "@/components/event/countdown";
import { ShareActions } from "@/components/event/share-actions";
import { TicketCard, type Ticket } from "@/components/event/ticket-card";
import { VerveLogo, VerveIcon, VervePresenterBadge } from "@/components/brand/verve-logo";
import { generateEventJsonLd } from "@/lib/seo/schema-event";
import {
  EVENT_DETAILS,
  ORGANIZER_APPROVED_TIERS,
  fetchLiveTicketTiers,
  type TicketCatalogTier,
} from "@/lib/catalog/ticket-catalog";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hauntings of the Rift — Verve & Co. at The Lawns, Nakuru" },
      {
        name: "description",
        content: `Hauntings of the Rift at ${EVENT_DETAILS.fullVenueString}. 31 October 2026 from 4 PM. Presented by Verve & Co. Tickets from KES 1,000.`,
      },
      { property: "og:title", content: "Hauntings of the Rift — Verve & Co." },
      {
        property: "og:description",
        content: `The premier Halloween nightlife experience in Nakuru at ${EVENT_DETAILS.venueName}. Presented by Verve & Co. Tickets from KES 1,000.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const nav = [
  ["Experience", "#experience"],
  ["Tickets", "#tickets"],
  ["Venue", "#venue"],
  ["FAQ", "#faq"],
];

const heroFacts: Array<[string, LucideIcon]> = [
  ["31 October 2026", Clock3],
  [`${EVENT_DETAILS.venueName} · Nakuru`, MapPin],
  ["4 PM — late", Moon],
];

const experiences: Array<[string, string, string, LucideIcon]> = [
  ["01", "Atmosphere", "A dark, cinematic setting inspired by the Rift after hours.", Sparkles],
  [
    "02",
    "Music",
    "A nightlife soundtrack. Line-up details will be announced by the organizers.",
    Volume2,
  ],
  ["03", "Costumes", "The brief is simple: arrive wickedly fabulous.", Shirt],
  ["04", "Social energy", "Come as a couple or gather a crew of four.", Users],
];

const faqs: Array<[string, string]> = [
  ["Who can attend?", "This is strictly an 18+ event. Original government ID required at entry."],
  ["What is the dress code?", "Wickedly Fabulous."],
  ["Where is the event?", EVENT_DETAILS.fullVenueString],
  ["What time does it start?", "Doors open at 4:00 PM EAT and the event continues till late."],
  [
    "How much are tickets?",
    "Early Bird is KES 1,000 (single entry), Couple Pass is KES 1,800 (entry for two), and Group of Four is KES 3,200 (entry for four).",
  ],
  [
    "How do I buy a ticket?",
    "Select your pass on this website, enter your M-Pesa phone number, and approve the payment prompt on your phone.",
  ],
  [
    "What happens after payment?",
    "Your digital pass with cryptographic QR code is generated instantly. You can save it to your device or download the PDF pass.",
  ],
  [
    "Can I get a refund?",
    "Tickets are non-refundable but transferable to another 18+ attendee. Contact verve.n.co.ke@gmail.com for transfer assistance.",
  ],
];

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 border-b border-bone/10 bg-background/35 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
            aria-label="Hauntings of the Rift - Home"
          >
            <VerveIcon className="size-8 text-amber-400" />
            <div className="flex flex-col">
              <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-bone leading-none">
                H/R
              </span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono">
                Verve &amp; Co.
              </span>
            </div>
          </Link>
          <div className="hidden sm:block h-6 w-px bg-border/60 mx-1" />
          <VervePresenterBadge className="hidden md:inline-flex" />
        </div>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
          {nav.map(([label, href]) => (
            <a
              className="text-sm font-semibold uppercase tracking-widest text-bone-muted hover:text-bone"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
          <Button asChild variant="event">
            <Link to="/checkout">Buy tickets</Link>
          </Button>
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="min-h-11 min-w-11 lg:hidden"
              variant="spectral"
              size="icon"
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent className="border-oxblood bg-background">
            <div className="flex flex-col gap-2 pt-2">
              <VerveLogo variant="horizontal" size="sm" showCo={true} />
              <SheetTitle className="font-display text-2xl text-bone mt-2">
                Hauntings of the Rift
              </SheetTitle>
            </div>
            <nav className="mt-8 grid gap-2">
              {nav.map(([label, href]) => (
                <SheetClose asChild key={href}>
                  <a
                    className="border-b border-border py-4 text-xl uppercase text-bone"
                    href={href}
                  >
                    {label}
                  </a>
                </SheetClose>
              ))}
              <Button asChild variant="event" size="xl" className="mt-4">
                <Link to="/checkout">Buy tickets</Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function MobileTicketBar({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] transition-transform lg:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <Button asChild variant="event" size="xl" className="w-full shadow-2xl">
        <Link to="/checkout">
          Buy tickets — from KES 1,000 <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

interface PublicPromotion {
  id: string;
  code: string;
  name?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
}

function NewsletterSubscribeForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSuccess(true);
        toast.success("You are now on the official guest list!", {
          description: "Check your inbox for a confirmation from Verve & Co.",
        });
      } else {
        toast.error("Subscription failed", { description: data.error });
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="p-4 border border-emerald-500/40 bg-emerald-500/10 rounded-lg max-w-md mx-auto text-emerald-300 text-sm flex items-center justify-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <span>Confirmed! You will receive our next lineup &amp; gate dispatch.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto pt-2">
      <Input
        type="text"
        placeholder="Your Name (Optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-card/80 border-border text-bone text-sm sm:w-40"
      />
      <Input
        type="email"
        placeholder="Enter your email..."
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-card/80 border-border text-bone text-sm flex-1"
      />
      <Button
        type="submit"
        disabled={isSubmitting}
        variant="event"
        className="shrink-0 font-mono text-xs uppercase tracking-wider"
      >
        {isSubmitting ? "Subscribing..." : "Join List"}
      </Button>
      <div className="w-full text-center sm:text-left text-[11px] text-muted-foreground font-mono mt-1 sm:col-span-3">
        By joining, you agree to receive event dispatches from Verve &amp; Co. We respect your
        inbox. Read our{" "}
        <Link to="/privacy" className="text-amber-400 hover:text-amber-300 underline">
          Privacy Policy
        </Link>
        .
      </div>
    </form>
  );
}

function Index() {
  const heroRef = useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const [promotions, setPromotions] = useState<PublicPromotion[]>([]);

  // Live ticket catalog synchronization
  const [ticketTiers, setTicketTiers] = useState<TicketCatalogTier[]>(ORGANIZER_APPROVED_TIERS);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const loadTiers = useCallback(async () => {
    setPricingLoading(true);
    setPricingError(null);
    const res = await fetchLiveTicketTiers();
    if (res.success && res.tiers.length > 0) {
      setTicketTiers(res.tiers);
      setPricingError(null);
    } else {
      setPricingError(res.error || "Unable to load live pricing from the organizer catalog.");
    }
    setPricingLoading(false);
  }, []);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  const eventJsonLd = generateEventJsonLd();

  useEffect(() => {
    fetch("/api/promotions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.promotions)) {
          setPromotions(data.promotions);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry?.isIntersecting), {
      threshold: 0.12,
    });
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Map to TicketCard view
  const displayTickets: Ticket[] = ticketTiers.map((tier) => ({
    name: tier.name,
    price: tier.priceKes,
    people: tier.peopleLabel,
    note: tier.note,
    slug: tier.slug,
  }));

  return (
    <div className="bg-background pb-20 text-foreground lg:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
      />
      <Header />
      <section
        ref={heroRef}
        id="home"
        className="poster-grain relative flex min-h-[92svh] items-end overflow-hidden border-b border-oxblood"
      >
        <img
          src={heroImage}
          alt="A moonlit garden venue beneath a crimson Rift Valley sky"
          width={1536}
          height={1024}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-[62%_center] opacity-80"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_78%,transparent)_44%,color-mix(in_oklab,var(--oxblood)_35%,transparent)_100%)]" />
        <div className="fog-drift absolute -left-1/4 top-1/3 h-40 w-2/3 rounded-full bg-bone/10 blur-3xl" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-9 pt-28 sm:px-6 sm:pb-14 lg:px-8">
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <VervePresenterBadge />
              <span className="text-xs font-bold uppercase tracking-[.35em] text-lavender">
                Halloween in Nakuru
              </span>
            </div>
            <h1 className="max-w-3xl text-6xl font-semibold leading-[.78] text-bone sm:text-8xl lg:text-[8.2rem]">
              Hauntings <span className="block text-bone-muted">of the Rift</span>
            </h1>
            <p className="mt-5 font-display text-xl italic text-bone sm:text-3xl">
              The most spooktakular Halloween party in Nakuru
            </p>
            <div className="mt-6 grid max-w-3xl gap-px bg-bone/20 sm:grid-cols-3">
              {heroFacts.map(([text, Icon]) => (
                <div
                  key={text}
                  className="flex min-h-12 items-center gap-3 bg-background/80 px-4 py-3 text-sm font-bold uppercase tracking-widest text-bone"
                >
                  <Icon className="size-4 text-lavender" />
                  {text}
                </div>
              ))}
            </div>
            <div className="mt-5 max-w-xl">
              <Countdown />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="event" size="xl">
                <Link to="/checkout">
                  Buy tickets <ArrowRight />
                </Link>
              </Button>
              <Button
                variant="spectral"
                size="xl"
                onClick={() =>
                  document.querySelector("#share")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <Share2 /> Share event
              </Button>
            </div>
          </div>
          <a
            href="#experience"
            aria-label="Scroll to event experience"
            className="absolute bottom-8 right-8 hidden size-12 place-items-center border border-bone/30 text-bone lg:grid"
          >
            <ArrowDown />
          </a>
        </div>
      </section>

      <section className="border-b border-border bg-oxblood">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-bone/15 sm:grid-cols-4 sm:divide-y-0">
          {[
            ["18+", "Admission"],
            ["Wickedly Fabulous", "Dress code"],
            ["KES 1,000", "Tickets from"],
            ["31 Oct", "Saturday"],
          ].map(([big, small]) => (
            <div className="px-4 py-6 text-center" key={small}>
              <div className="font-display text-2xl text-bone">{big}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-bone-muted">{small}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="experience" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.4fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.3em] text-lavender">What awaits</p>
            <h2 className="mt-3 text-5xl text-bone sm:text-6xl">
              One night.
              <br />A different Nakuru.
            </h2>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              A sophisticated Halloween gathering shaped by atmosphere, style, sound and the people
              you bring with you.
            </p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {experiences.map(([n, title, copy, Icon]) => (
              <article className="min-h-64 bg-card p-6 sm:p-8" key={title}>
                <div className="flex items-start justify-between">
                  <span className="text-xs text-lavender">{n}</span>
                  <Icon className="size-5 text-bone-muted" />
                </div>
                <h3 className="mt-16 text-3xl text-bone">{title}</h3>
                <p className="mt-3 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="tickets"
        className="border-y border-border bg-card/45 px-4 py-20 sm:px-6 lg:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.3em] text-lavender">
                Secure your place
              </p>
              <h2 className="mt-2 text-5xl text-bone sm:text-6xl">Choose your ticket</h2>
            </div>
            <p className="max-w-sm text-muted-foreground">
              Direct checkout with M-Pesa. Passes feature cryptographic QR codes for fast-track gate
              entry.
            </p>
          </div>

          {/* Explicit Error State if Live Pricing fails */}
          {pricingError && (
            <div className="mb-6 rounded border border-red-500/40 bg-red-950/20 p-4 text-red-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="size-5 text-red-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-300">
                      Live Pricing Synchronization Notice
                    </h4>
                    <p className="text-xs text-red-200/80 mt-0.5">
                      {pricingError}. Displaying verified baseline pricing catalog.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTiers}
                  className="border-red-500/40 text-red-300 hover:bg-red-900/30 gap-1.5 shrink-0"
                >
                  <RefreshCw className="size-3.5" />
                  Retry Sync
                </Button>
              </div>
            </div>
          )}

          {pricingLoading && (
            <div className="mb-4 flex items-center gap-2 text-xs font-mono text-lavender animate-pulse">
              <RefreshCw className="size-3 animate-spin" />
              <span>Verifying live tier pricing and capacity...</span>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {displayTickets.map((ticket, i) => (
              <TicketCard key={ticket.name} ticket={ticket} featured={i === 2} />
            ))}
          </div>

          {promotions.length > 0 && (
            <div className="mt-8 border border-lavender/40 bg-lavender/10 p-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="border border-lavender px-2 py-1 text-xs font-bold uppercase text-lavender">
                      Active Promotion
                    </span>
                    <span className="font-mono text-xs text-amber-400">
                      Code: {promotions[0].code}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl text-bone">
                    {promotions[0].discountType === "percentage"
                      ? `${promotions[0].discountValue}% OFF`
                      : `KES ${promotions[0].discountValue.toLocaleString()} OFF`}
                    {promotions[0].name ? ` — ${promotions[0].name}` : " Special Offer"}
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    Use code at checkout to claim your promotional discount.
                  </p>
                </div>
                <Button asChild variant="event" size="xl">
                  <Link to={`/checkout?promo=${encodeURIComponent(promotions[0].code)}`}>
                    Claim offer <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        id="share"
        className="poster-grain relative overflow-hidden bg-oxblood px-4 py-20 sm:px-6 lg:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.3em] text-lavender">
              Who are you going with?
            </p>
            <h2 className="mt-3 max-w-3xl text-6xl leading-[.85] text-bone sm:text-8xl">
              Bring your crew.
            </h2>
            <p className="mt-5 max-w-xl text-lg text-bone-muted">
              Plans are better when the group chat is involved. Send the date. Pick your looks. Meet
              beneath the Rift.
            </p>
          </div>
          <div>
            <p className="mb-4 text-sm uppercase tracking-widest text-bone-muted">
              Share this event
            </p>
            <ShareActions />
          </div>
        </div>
      </section>

      {/* VENUE SECTION */}
      <section id="venue" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="gothic-frame grid overflow-hidden lg:grid-cols-[.9fr_1.1fr]">
          <div className="p-7 sm:p-12">
            <MapPin className="size-7 text-lavender" />
            <p className="mt-12 text-xs font-bold uppercase tracking-[.3em] text-lavender">
              The gathering place
            </p>
            <h2 className="mt-3 text-5xl text-bone">{EVENT_DETAILS.venueName}</h2>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              {EVENT_DETAILS.venueAddress}, Nakuru
            </p>
            <Button asChild variant="event" size="xl" className="mt-8">
              <a href={EVENT_DETAILS.directionsUrl} target="_blank" rel="noreferrer">
                Get directions <ArrowRight />
              </a>
            </Button>
          </div>
          <div className="relative min-h-[380px] w-full overflow-hidden border-t border-border lg:border-l lg:border-t-0 bg-card">
            <iframe
              src={EVENT_DETAILS.mapEmbedUrl}
              width="100%"
              height="100%"
              className="absolute inset-0 size-full border-0 min-h-[380px]"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              title={`${EVENT_DETAILS.venueName} Location Map`}
            />
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="border-y border-border bg-card/45 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.3em] text-lavender">
              Know before you go
            </p>
            <h2 className="mt-3 text-5xl text-bone">Questions from the crypt.</h2>
            <p className="mt-4 text-sm text-bone-muted leading-relaxed">
              Everything you need to know about passes, gate check-in, parking at{" "}
              {EVENT_DETAILS.venueName}, and costume guidelines.
            </p>
          </div>

          <div>
            <Accordion type="single" collapsible>
              {faqs.map(([q, a]) => (
                <AccordionItem value={q} key={q}>
                  <AccordionTrigger className="py-6 text-left text-lg text-bone hover:no-underline">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 text-base text-muted-foreground">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Bottom of Accordion direct write link */}
            <div className="mt-6 pt-4 border-t border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground font-mono">
              <span>Still have an unlisted question?</span>
              <a
                href={`mailto:${EVENT_DETAILS.supportEmail}?subject=Question%20about%20Hauntings%20of%20the%20Rift%202026&body=Hello%20Verve%20%26%20Co.%20team,%0D%0A%0D%0AMy%20question%20is:%20`}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
              >
                <Mail className="size-3.5" />
                Write to Verve &amp; Co. ({EVENT_DETAILS.supportEmail}) &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="poster-grain px-4 py-24 text-center sm:px-6 lg:py-36">
        <p className="text-xs font-bold uppercase tracking-[.35em] text-lavender">
          31 October 2026 · {EVENT_DETAILS.venueName}
        </p>
        <h2 className="mx-auto mt-4 max-w-5xl text-6xl leading-[.85] text-bone sm:text-8xl">
          Nakuru. Are you ready?
        </h2>
        <p className="mt-5 font-display text-2xl italic text-bone-muted">
          Something is stirring beneath the Rift.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="event" size="xl">
            <Link to="/checkout">
              Buy tickets <ArrowRight />
            </Link>
          </Button>
          <Button
            variant="spectral"
            size="xl"
            onClick={() => document.querySelector("#share")?.scrollIntoView({ behavior: "smooth" })}
          >
            Share with friends
          </Button>
        </div>
      </section>

      {/* EMAIL LIST & GUEST UPDATES SECTION */}
      <section className="border-t border-border/80 bg-oxblood-darker/60 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <h3 className="font-display text-3xl sm:text-4xl text-bone">
            Join the Rift Dispatch List
          </h3>

          <p className="text-sm sm:text-base text-bone-muted max-w-xl mx-auto">
            Be the first to receive secret artist lineup reveals, gate arrival updates, and
            exclusive flash releases directly in your inbox.
          </p>

          <NewsletterSubscribeForm />
        </div>
      </section>

      <footer className="border-t border-border bg-card/40 px-4 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <VerveLogo variant="horizontal" size="sm" showCo={true} linkToHome={true} />
            <div className="hidden sm:block h-5 w-px bg-border" />
            <p className="text-xs text-muted-foreground">
              Verve &amp; Co. presents Hauntings of the Rift.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link
              to="/terms"
              className="text-bone-muted hover:text-bone underline underline-offset-2"
            >
              Terms &amp; Conditions
            </Link>
            <span>·</span>
            <Link
              to="/privacy"
              className="text-bone-muted hover:text-bone underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            <span>·</span>
            <Link
              to="/recover"
              className="text-bone-muted hover:text-bone underline underline-offset-2"
            >
              Find / Recover Ticket
            </Link>
            <span>·</span>
            <span className="border border-border/80 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
              18+ ONLY
            </span>
          </div>
        </div>
      </footer>
      <MobileTicketBar visible={pastHero} />
    </div>
  );
}
