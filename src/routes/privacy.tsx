import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  ArrowLeft,
  Mail,
  Lock,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerveLogo, VerveIcon, VerveBackButton } from "@/components/brand/verve-logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Official Privacy Policy for Hauntings of the Rift (Nakuru). Compliant with the Kenya Data Protection Act, 2019 (ODPC) and international data privacy standards.",
      },
      { property: "og:title", content: "Privacy Policy — Hauntings of the Rift" },
      {
        property: "og:description",
        content:
          "How Verve & Co. collects, processes, and protects your personal data and M-Pesa transaction details.",
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
            <ShieldCheck className="size-3.5" />
            Kenya Data Protection Act, 2019 Compliant (ODPC)
          </div>
          <h1 className="font-display text-3xl sm:text-5xl text-bone tracking-tight">
            Privacy Policy &amp; Data Protection
          </h1>
          <p className="text-sm sm:text-base text-bone-muted max-w-2xl leading-relaxed">
            Verve &amp; Co. is committed to transparent, lawful, and secure handling of your
            personal and financial data for <strong>Hauntings of the Rift</strong> (31 October 2026
            at The Lawns Restaurant, Nakuru).
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
            This Privacy Policy governs the collection, storage, and processing of personal data by{" "}
            <strong>Verve &amp; Co.</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
            &ldquo;our&rdquo;) in connection with ticket sales, admission verification, and
            communications for the event <em>Hauntings of the Rift</em>.
          </p>
          <p>
            We process all personal data strictly in compliance with the{" "}
            <strong>Kenya Data Protection Act, 2019</strong> (enforced by the Office of the Data
            Protection Commissioner - ODPC) and internationally recognized fair information
            principles.
          </p>
        </section>

        {/* Section 2: Information We Collect */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">02.</span>
            Personal Data We Collect
          </h2>
          <p>
            We collect only the minimum information necessary to execute the ticketing contract and
            ensure gate security:
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                A. Attendee Identity &amp; Contact
              </h3>
              <p className="text-xs text-muted-foreground">
                Full legal name (or ticket holder name), email address, and mobile phone number
                (Kenya MSISDN format).
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                B. M-Pesa Transaction Records
              </h3>
              <p className="text-xs text-muted-foreground">
                Safaricom M-Pesa 10-character transaction reference code, payment amount in KES, and
                receipt timestamps. We <strong>never</strong> ask for or store your M-Pesa PIN.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                C. Digital Admission Credentials
              </h3>
              <p className="text-xs text-muted-foreground">
                Cryptographic ticket hash, barcode identifiers, gate scanner check-in timestamps,
                and station admission logs.
              </p>
            </div>

            <div className="border border-border/80 bg-card/60 p-4 space-y-1.5">
              <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider">
                D. Technical &amp; Device Telemetry
              </h3>
              <p className="text-xs text-muted-foreground">
                Ephemeral session IDs, device type (mobile/desktop), and anonymized page analytics
                to optimize checkout speeds.
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
          <p>
            Under Section 30 of the Kenya Data Protection Act, our legal bases for processing
            include:
          </p>
          <ul className="space-y-2 list-disc list-inside text-xs sm:text-sm text-bone-muted pl-2">
            <li>
              <strong className="text-bone">Contractual Performance:</strong> To verify your
              Safaricom payment, mint your official passes, and deliver your digital QR tickets via
              email.
            </li>
            <li>
              <strong className="text-bone">Legitimate Security Interests:</strong> To operate our
              optical scanners at The Lawns Restaurant, prevent duplicate or counterfeit entries,
              and safeguard event capacity.
            </li>
            <li>
              <strong className="text-bone">Statutory Compliance:</strong> To maintain auditable
              financial ledgers of ticket transactions in accordance with Kenya Revenue Authority
              (KRA) and commercial law.
            </li>
            <li>
              <strong className="text-bone">Explicit Consent:</strong> Where you opt-in to the{" "}
              <em>Rift Dispatch List</em> to receive artist lineup announcements and future event
              announcements. You may unsubscribe at any time.
            </li>
          </ul>
        </section>

        {/* Section 4: Cookies & Local Storage */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">04.</span>
            Cookies &amp; Local Storage Technology
          </h2>
          <p>Our web application uses essential browser storage to ensure smooth functioning:</p>
          <div className="bg-background/80 border border-border p-4 font-mono text-xs space-y-2">
            <div>
              <span className="text-amber-400 font-bold">rift_data_cookie_consent_v1</span>: Stores
              your consent choice for cookies and data policies.
            </div>
            <div>
              <span className="text-amber-400 font-bold">ticket_order_cache</span>: Temporarily
              preserves selected ticket quantities during multi-step checkout.
            </div>
            <div>
              <span className="text-amber-400 font-bold">admin_auth_state</span>: Secure session
              token for authorized event gatekeepers and staff.
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            We do <strong>not</strong> use third-party advertising cookies or cross-site tracking
            pixels that sell your data to marketing brokers.
          </p>
        </section>

        {/* Section 5: Data Sharing & Third Parties */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">05.</span>
            Third-Party Service Providers
          </h2>
          <p>
            We do not sell, rent, or trade your personal data. We disclose data solely to trusted
            infrastructure partners strictly necessary for event operations:
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs sm:text-sm text-bone-muted pl-2">
            <li>
              <strong>Safaricom PLC:</strong> Facilitation and verification of direct M-Pesa
              payments (Paybill 522533).
            </li>
            <li>
              <strong>Google Cloud &amp; Firebase:</strong> High-security encrypted cloud storage
              and database hosting.
            </li>
            <li>
              <strong>Google Workspace / Gmail:</strong> Transactional dispatch of digital passes
              and customer service correspondence.
            </li>
          </ul>
        </section>

        {/* Section 6: Data Retention & Security */}
        <section className="space-y-3 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">06.</span>
            Security Measures &amp; Data Retention
          </h2>
          <p>
            All network communication occurs over TLS 1.3 encryption. Pass cryptographic digests are
            sealed with server-side HMAC signatures. Personal contact details are retained only as
            long as necessary to fulfill event reconciliation and statutory tax record-keeping
            requirements, after which records are securely purged or anonymized.
          </p>
        </section>

        {/* Section 7: Your Data Subject Rights (KDPA) */}
        <section className="space-y-4 border-t border-border/60 pt-8">
          <h2 className="font-display text-xl sm:text-2xl text-amber-300 flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">07.</span>
            Your Rights Under Kenyan Law
          </h2>
          <p>
            Under Sections 26–40 of the Kenya Data Protection Act, 2019, you have the following
            enforceable rights:
          </p>

          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">Right to Access</span>
              Request a complete copy of the personal details we hold about you.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">
                Right to Rectification
              </span>
              Correct inaccurate or misspelled attendee names or contact information.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">
                Right to Erasure
              </span>
              Request the deletion of your personal data where retention is no longer necessary.
            </div>
            <div className="border border-border/80 bg-card/40 p-3">
              <span className="font-mono text-amber-300 font-bold block mb-1">
                Right to Lodge a Complaint
              </span>
              File an inquiry directly with the Office of the Data Protection Commissioner (ODPC
              Kenya).
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
            To exercise your privacy rights, request data deletion, or report a security concern,
            contact our designated event operations team:
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
              <strong>Location:</strong> The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova
              Woodlands, Nakuru, Kenya
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-card/40 px-4 py-8 text-center text-xs font-mono text-muted-foreground">
        <p>
          &copy; 2026 Verve &amp; Co. All rights reserved. Hauntings of the Rift is a registered
          event experience.
        </p>
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
