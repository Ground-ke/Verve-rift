import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { VerveIcon, VerveBackButton } from "@/components/brand/verve-logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Ticketing information for Hauntings of the Rift at Top Cliff Lodge, Nakuru (31 October 2026).",
      },
      { property: "og:title", content: "Terms & Conditions — Hauntings of the Rift" },
      {
        property: "og:description",
        content: "Event details and ticket information for Hauntings of the Rift.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const lastUpdated = "September 24, 2026";

  return (
    <div className="min-h-screen bg-oxblood-darker text-bone">
      {/* Top Header */}
      <header className="border-b border-border/80 bg-card/60 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VerveBackButton to="/" label="Event Home" />
            <div className="h-4 w-px bg-border/80 hidden sm:block" />
            <Link to="/" className="flex items-center gap-2">
              <VerveIcon className="size-6 text-amber-400" />
              <span className="font-display text-sm tracking-wide text-bone">Verve &amp; Co.</span>
            </Link>
          </div>
          <Link to="/privacy" className="text-xs font-mono text-lavender hover:text-bone underline">
            Privacy Policy &rarr;
          </Link>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="px-4 py-12 sm:py-16 border-b border-border/60 bg-gradient-to-b from-card/80 to-background/40">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-950/40 text-amber-300 text-xs font-mono">
            <FileText className="size-3.5" />
            Ticketing Information
          </div>
          <h1 className="font-display text-3xl sm:text-5xl text-bone tracking-tight">
            Terms &amp; Conditions of Entry
          </h1>
          <p className="text-sm sm:text-base text-bone-muted max-w-2xl leading-relaxed">
            Confirmed event and ticket information for <strong>Hauntings of the Rift</strong>.
            Contact the organizer for any policy details not listed here.
          </p>
          <div className="text-xs font-mono text-muted-foreground pt-1">
            Event Date: Saturday, 31 October 2026 · Venue: Top Cliff Lodge, Nakuru · 18+
          </div>
        </div>
      </section>

      {/* Main Legal Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-10 text-sm leading-relaxed text-bone/90">
        {/* Section 1: The Event & Organizer */}
        <section className="space-y-3">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">01.</span>
            Event Scope &amp; Organization
          </h2>
          <p>
            <em>Hauntings of the Rift</em> takes place on Saturday, 31 October 2026, from 4 PM till
            late at <strong>Top Cliff Lodge</strong>, Nakuru-Nairobi Highway, Free Area, Nakuru,
            Kenya.
          </p>
        </section>

        {/* Section 2: Age Restriction & Identification */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">02.</span>
            Age Restriction (Strictly 18+)
          </h2>
          <p className="text-xs text-bone-muted">
            The event is for guests aged <strong>18 and older</strong>. Contact the organizer if you
            need details about age verification or entry requirements before purchasing.
          </p>
        </section>

        {/* Section 3: Ticketing, QR Passes & Gate Admission */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">03.</span>
            Digital Passes &amp; QR Validation
          </h2>
          <ul className="space-y-2.5 list-disc list-inside text-xs sm:text-sm text-bone-muted pl-2">
            <li>
              <strong className="text-bone">Digital tickets:</strong> Keep your ticket available for
              validation at the event and do not share its QR code.
            </li>
            <li>
              <strong className="text-bone">Admits Count:</strong> Each ticket tier admits strictly
              the designated number of guests: Early Bird admits 1, Couple Pass admits 2, and Group
              of Four admits 4.
            </li>
          </ul>
        </section>

        {/* Section 4: M-Pesa Payment & Verification */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">04.</span>
            Payment and Review
          </h2>
          <p>
            Follow the M-Pesa payment instructions shown during checkout. Payment details can
            change; verify the displayed recipient before sending money.
          </p>
          <p className="text-xs text-muted-foreground">
            After paying, paste the M-Pesa confirmation message or transaction code into your order.
            A submitted message is a payment claim, not confirmation. The organizer reviews it
            before a ticket is issued.
          </p>
        </section>

        {/* Section 5: Refund, Postponement & Cancellation Policy */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">05.</span>
            Refunds, Postponements &amp; Force Majeure
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <span className="font-mono text-amber-300 font-bold block">
                Refunds and Cancellations
              </span>
              <p className="text-muted-foreground">
                Refund, cancellation, and postponement arrangements have not been confirmed here.
                Contact the organizer for the applicable policy before purchasing.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <span className="font-mono text-amber-300 font-bold block">
                Organizer Cancellation
              </span>
              <p className="text-muted-foreground">
                Contact the organizer for information if the event is cancelled or postponed. No
                refund or rescheduling outcome is promised on this page.
              </p>
            </div>
          </div>
          <p className="text-xs text-bone-muted">
            For confirmed updates, use the organizer contact details below.
          </p>
        </section>

        {/* Section 6: Venue Information */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">06.</span>
            Venue Information
          </h2>
          <p>
            The venue is Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru. Contact the
            organizer for venue access and safety information.
          </p>
        </section>

        {/* Section 7: Organizer Contact */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">07.</span>
            Questions and Policy Details
          </h2>
          <p className="text-xs sm:text-sm text-bone-muted">
            Contact the organizer for information about photography, recording, entry rules, or any
            other policy not described on this page.
          </p>
        </section>

        {/* Section 8: Organizer Contact */}
        <section className="space-y-4 border-t border-border/60 pt-8 bg-card/50 p-6 border border-border">
          <h2 className="font-display text-xl text-bone">Organizer Contact</h2>
          <div className="font-mono text-xs space-y-1 text-bone pt-2">
            <div>
              <strong>Event Organizer:</strong> Verve &amp; Co.
            </div>
            <div>
              <strong>Customer Support &amp; Inquiries:</strong>{" "}
              <a href="mailto:verve.n.co.ke@gmail.com" className="text-amber-400 underline">
                verve.n.co.ke@gmail.com
              </a>
            </div>
            <div>
              <strong>Location:</strong> Nakuru, Kenya
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-card/40 px-4 py-8 text-center text-xs font-mono text-muted-foreground">
        <p>&copy; 2026 Verve &amp; Co. All rights reserved. Hauntings of the Rift.</p>
        <div className="flex justify-center gap-4 mt-2 text-lavender">
          <Link to="/" className="hover:text-bone underline">
            Home
          </Link>
          <Link to="/privacy" className="hover:text-bone underline">
            Privacy Policy
          </Link>
          <Link to="/recover" className="hover:text-bone underline">
            Ticket Recovery
          </Link>
        </div>
      </footer>
    </div>
  );
}
