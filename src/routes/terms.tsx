import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  FileText,
  AlertTriangle,
  MapPin,
  Ticket,
  Flame,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { VerveIcon, VerveBackButton } from "@/components/brand/verve-logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Official Event Terms and Ticketing Conditions for Hauntings of the Rift at The Lawns Restaurant, Nakuru (31 October 2026).",
      },
      { property: "og:title", content: "Terms & Conditions — Hauntings of the Rift" },
      {
        property: "og:description",
        content:
          "Ticketing policies, gate admission, age limits, and venue regulations at The Lawns Restaurant.",
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
            Official Ticketing &amp; Admission Agreement
          </div>
          <h1 className="font-display text-3xl sm:text-5xl text-bone tracking-tight">
            Terms &amp; Conditions of Entry
          </h1>
          <p className="text-sm sm:text-base text-bone-muted max-w-2xl leading-relaxed">
            Please read these terms carefully before acquiring passes for{" "}
            <strong>Hauntings of the Rift</strong>. Possession of a pass signifies unconditional
            acceptance of these operational rules.
          </p>
          <div className="text-xs font-mono text-muted-foreground pt-1">
            Event Date: Saturday, 31 October 2026 · Venue: The Lawns Restaurant, Nakuru
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
            <em>Hauntings of the Rift</em> is an immersive Halloween nightlife and costume festival
            produced and managed exclusively by <strong>Verve &amp; Co.</strong> on 31 October 2026,
            commencing at 4:00 PM EAT at The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova
            Woodlands, Nakuru, Kenya.
          </p>
        </section>

        {/* Section 2: Age Restriction & Identification */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">02.</span>
            Age Restriction (Strictly 18+)
          </h2>
          <div className="border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold font-mono text-xs uppercase tracking-wider">
              <AlertTriangle className="size-4" /> Mandatory Age Verification at Gate
            </div>
            <p className="text-xs text-bone-muted">
              Admission is strictly restricted to patrons aged <strong>18 years and older</strong>.
              All attendees must present an original government-issued National ID Card, Passport,
              or valid Driver&apos;s License at the gate. Photocopies, digital photos, or expired
              student cards will not be accepted. No refunds will be issued for denial of entry due
              to underage status or missing identification.
            </p>
          </div>
        </section>

        {/* Section 3: Ticketing, QR Passes & Gate Admission */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">03.</span>
            Digital Passes &amp; QR Validation
          </h2>
          <ul className="space-y-2.5 list-disc list-inside text-xs sm:text-sm text-bone-muted pl-2">
            <li>
              <strong className="text-bone">Single-Entry QR Passes:</strong> Each digital pass
              contains a verified cryptographic barcode. Once scanned by gate staff at The Lawns
              Restaurant, the ticket status is irreversibly marked as <code>used</code>. Re-entry
              after departure is at the discretion of head security.
            </li>
            <li>
              <strong className="text-bone">Admits Count:</strong> Each ticket tier admits strictly
              the designated number of guests (Early Bird / General Admission: 1 guest; Couple Pass:
              2 guests arriving together; Group of 5: 5 guests).
            </li>
            <li>
              <strong className="text-bone">Anti-Scalping &amp; Unauthorized Resale:</strong> Passes
              may only be purchased through our official portal. Tickets resold at inflated prices
              or via unauthorized brokers will be voided without compensation.
            </li>
            <li>
              <strong className="text-bone">Buyer Responsibility:</strong> Do not share screenshots
              of your unredeemed QR code on social media. The first person to present the QR code at
              the gate terminal will be granted entry.
            </li>
          </ul>
        </section>

        {/* Section 4: M-Pesa Payment & Verification */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">04.</span>
            Payment Processing (Safaricom M-Pesa Paybill 522533)
          </h2>
          <p>
            Official ticket transactions are settled exclusively in Kenya Shillings (KES) through
            direct Safaricom M-Pesa to Paybill <strong>522533</strong> (Account:{" "}
            <code>RIFT-[ORDER]</code>).
          </p>
          <p className="text-xs text-muted-foreground">
            Upon submitting payment, buyers must enter their 10-character M-Pesa receipt code.
            Orders are reconciled against the official merchant ledger before passes are minted and
            dispatched.
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
                Standard Policy: No Refunds
              </span>
              <p className="text-muted-foreground">
                All ticket sales are final. We do not provide refunds for changes of mind,
                scheduling conflicts, transport delays, or refusal of entry due to violation of
                venue conduct rules.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <span className="font-mono text-amber-300 font-bold block">
                Cancellation by Organizer
              </span>
              <p className="text-muted-foreground">
                If the event is completely canceled by Verve &amp; Co. without a rescheduled date,
                ticket holders will receive a full refund of face value to the originating M-Pesa
                phone number.
              </p>
            </div>
          </div>
          <p className="text-xs text-bone-muted">
            In the event of severe weather or force majeure requiring postponement, all issued
            tickets remain valid and transfer automatically to the rescheduled date.
          </p>
        </section>

        {/* Section 6: The Lawns Restaurant Venue Safety & Prohibited Items */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">06.</span>
            Venue Safety &amp; Prohibited Items
          </h2>
          <p>
            The Lawns Restaurant is a garden and nightlife venue. Attendees must observe personal
            safety and follow all perimeter signage and security guard directions:
          </p>

          <div className="border border-red-500/30 bg-red-950/20 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-red-400 font-bold font-mono uppercase tracking-wider">
              <Ban className="size-4" /> Strictly Prohibited Items
            </div>
            <ul className="list-disc list-inside text-bone-muted space-y-1 pl-1">
              <li>Outside alcohol, glass bottles, metal cans, and open drink containers.</li>
              <li>
                Weapons of any type (including costume props with sharp metal blades or firing
                mechanisms).
              </li>
              <li>Illegal substances, narcotics, and recreational drugs under Kenya laws.</li>
              <li>Fireworks, flares, laser pointers, and open flames.</li>
              <li>
                Commercial recording equipment, heavy camera rigs, or drones without written press
                accreditation.
              </li>
            </ul>
          </div>
        </section>

        {/* Section 7: Media, Photography & Filming Consent */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">07.</span>
            Media &amp; Public Photography Consent
          </h2>
          <p className="text-xs sm:text-sm text-bone-muted">
            By attending <em>Hauntings of the Rift</em>, you acknowledge that professional
            photographers and videographers will document the event. You grant Verve &amp; Co. a
            perpetual, royalty-free license to use incidental crowd photographs and video footage in
            official aftermovies, social media recaps, and promotional materials.
          </p>
        </section>

        {/* Section 8: Right of Admission & Conduct */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">08.</span>
            Right of Admission Reserved (R.O.A.R.)
          </h2>
          <p className="text-xs sm:text-sm text-bone-muted">
            Security personnel and event management reserve the unconditional right to refuse entry
            or eject any patron engaging in harassment, physical altercation, trespassing beyond
            safety barricades, intoxication endangering others, or general non-compliance with staff
            instructions.
          </p>
        </section>

        {/* Section 9: Governing Law & Contact */}
        <section className="space-y-4 border-t border-border/60 pt-8 bg-card/50 p-6 border border-border">
          <h2 className="font-display text-xl text-bone">Governing Law &amp; Organizer Contact</h2>
          <p className="text-xs sm:text-sm text-bone-muted">
            These terms are governed exclusively by the laws of the Republic of Kenya. Any disputes
            arising from ticket purchases or event operations fall under the jurisdiction of Kenyan
            courts.
          </p>
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
