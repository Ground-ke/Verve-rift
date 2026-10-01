import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerveLogo, VerveIcon, VerveBackButton } from "@/components/brand/verve-logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Information about personal data used for Hauntings of the Rift ticketing and event access.",
      },
      { property: "og:title", content: "Privacy Policy — Hauntings of the Rift" },
      {
        property: "og:description",
        content: "Contact the organizer with questions about personal data and event ticketing.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const lastUpdated = "September 24, 2026";

  return (
    <div className="min-h-screen bg-oxblood-darker text-bone">
      {/* Top Navigation */}
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
          <Link to="/terms" className="text-xs font-mono text-lavender hover:text-bone underline">
            Terms &amp; Conditions &rarr;
          </Link>
        </div>
      </header>

      {/* Hero Header */}
      <section className="px-4 py-12 sm:py-16 border-b border-border/60 bg-gradient-to-b from-card/80 to-background/40">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 text-xs font-mono">
            Privacy Information
          </div>
          <h1 className="font-display text-3xl sm:text-5xl text-bone tracking-tight">
            Privacy Policy &amp; Data Protection
          </h1>
          <p className="text-sm sm:text-base text-bone-muted max-w-2xl leading-relaxed">
            This page describes information used for <strong>Hauntings of the Rift</strong> ticket
            requests and event access (31 October 2026 at Top Cliff Lodge, Nakuru).
          </p>
          <div className="text-xs font-mono text-muted-foreground pt-1">
            Last Updated: {lastUpdated} · Effective: 2026 Event Cycle
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-10 text-sm leading-relaxed text-bone/90">
        {/* Section 1: Overview & Data Controller */}
        <section className="space-y-3">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">01.</span>
            Data Controller &amp; Scope
          </h2>
          <p>
            Ticket requests may include a buyer&apos;s name, phone number, and optional email
            address. If you submit an M-Pesa confirmation, its message or transaction reference is
            associated with the order for organizer review.
          </p>
          <p>
            Ticket and payment information is used to manage the order, review a submitted payment
            claim, issue a ticket after approval, and respond to support requests.
          </p>
        </section>

        {/* Section 2: Information We Collect */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">02.</span>
            Personal Data We Collect
          </h2>
          <p>Information submitted through ticketing may include:</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                A. Attendee Identity &amp; Contact
              </h3>
              <p className="text-xs text-muted-foreground">
                Buyer name, phone number, and optional email address.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                B. M-Pesa Transaction Records
              </h3>
              <p className="text-xs text-muted-foreground">
                The M-Pesa confirmation message or transaction reference you choose to submit for
                organizer review. Do not submit your M-Pesa PIN or account password.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                C. Digital Admission Credentials
              </h3>
              <p className="text-xs text-muted-foreground">
                Ticket code and related ticket status, including check-in information if recorded.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                D. Technical &amp; Device Telemetry
              </h3>
              <p className="text-xs text-muted-foreground">
                Technical information needed to operate the website and checkout may also be
                processed by the site.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Legal Basis & Purpose of Processing */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">03.</span>
            Purpose &amp; Legal Basis of Processing
          </h2>
          <p>Ticket and order information is used for these event-related purposes:</p>
          <ul className="space-y-2 list-disc list-inside text-xs sm:text-sm text-bone-muted pl-2">
            <li>
              <strong className="text-bone">Order handling:</strong> To create and manage your
              ticket request and contact you about it.
            </li>
            <li>
              <strong className="text-bone">Payment review:</strong> To let the organizer review a
              submitted M-Pesa message before approving an order.
            </li>
            <li>
              <strong className="text-bone">Ticket delivery and access:</strong> To issue and
              validate tickets after an order is approved.
            </li>
            <li>
              <strong className="text-bone">Support:</strong> To respond to questions or corrections
              about an order.
            </li>
          </ul>
        </section>

        {/* Section 4: Cookies & Local Storage */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">04.</span>
            Cookies &amp; Local Storage Technology
          </h2>
          <p>
            The website may use browser storage for site functionality, checkout continuity, and
            authenticated sessions. Browser settings can affect this storage.
          </p>
        </section>

        {/* Section 5: Data Sharing & Third Parties */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">05.</span>
            Third-Party Service Providers
          </h2>
          <p>
            Website hosting, authentication, email, and other configured service providers may
            process information as needed to operate ticketing. Contact the organizer for the
            current provider and data-sharing details.
          </p>
        </section>

        {/* Section 6: Data Retention & Security */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">06.</span>
            Security Measures &amp; Data Retention
          </h2>
          <p>
            A verified retention schedule and detailed security-control description are not
            published here. Contact the organizer for information about retention, access, or a
            request to correct or remove personal information.
          </p>
        </section>

        {/* Section 7: Your Data Subject Rights (KDPA) */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">07.</span>
            Your Rights Under Kenyan Law
          </h2>
          <p>
            Contact the organizer to request access to, correction of, or deletion of information
            associated with your ticket request, subject to any applicable record-keeping
            requirements.
          </p>

          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">Access</span>
              Ask what information is associated with your ticket request.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">Correction</span>
              Ask to correct inaccurate contact or ticket information.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">Deletion</span>
              Ask for information to be removed, subject to applicable retention requirements.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">
                Other privacy questions
              </span>
              Contact the organizer for details about the applicable process.
            </div>
          </div>
        </section>

        {/* Section 8: Contact Our Data Officer */}
        <section className="space-y-4 border-t border-border/60 pt-8 bg-card/50 p-6 border border-border">
          <div className="flex items-center gap-2 text-amber-400">
            <Mail className="size-5" />
            <h2 className="font-display text-xl text-bone">Contact &amp; Data Inquiries</h2>
          </div>
          <p className="text-xs sm:text-sm text-bone-muted">
            For questions or requests about personal information, contact the event organizer.
          </p>
          <div className="font-mono text-xs space-y-1 text-bone">
            <div>
              <strong>Entity:</strong> Verve &amp; Co. / Hauntings of the Rift Operations
            </div>
            <div>
              <strong>Official Email:</strong>{" "}
              <a href="mailto:verve.n.co.ke@gmail.com" className="text-amber-400 underline">
                verve.n.co.ke@gmail.com
              </a>
            </div>
            <div>
              <strong>Location:</strong> Top Cliff Lodge, Nakuru, Kenya
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-card/40 px-4 py-8 text-center text-xs font-mono text-muted-foreground">
        <p>&copy; 2026 Verve &amp; Co. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2 text-lavender">
          <Link to="/" className="hover:text-bone underline">
            Home
          </Link>
          <Link to="/terms" className="hover:text-bone underline">
            Terms &amp; Conditions
          </Link>
          <Link to="/recover" className="hover:text-bone underline">
            Ticket Recovery
          </Link>
        </div>
      </footer>
    </div>
  );
}
