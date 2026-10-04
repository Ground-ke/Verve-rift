import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleX, Clock3, ScanLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QRPlaceholder } from "@/components/event/qr-placeholder";
import { VerveBackButton, VerveLogo, VervePresenterBadge } from "@/components/brand/verve-logo";

export const Route = createFileRoute("/ticket/demo")({
  head: () => ({
    meta: [
      { title: "Digital Ticket Design — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Digital ticket interface preview for Hauntings of the Rift presented by Verve & Co.",
      },
      { property: "og:title", content: "Hauntings of the Rift Digital Ticket — Verve & Co." },
      { property: "og:description", content: "Frontend preview of the event ticket experience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketDemo,
});
type State = "valid" | "used" | "cancelled" | "invalid";
function TicketDemo() {
  const [state, setState] = useState<State>("valid");
  const stateData = {
    valid: ["Valid-state preview", "Example only — not valid for entry", CheckCircle2],
    used: ["Used-state preview", "Example state only", ScanLine],
    cancelled: ["Cancelled-state preview", "Example state only", CircleX],
    invalid: ["Invalid-state preview", "Example state only", CircleX],
  } as const;
  const [title, sub, Icon] = stateData[state];
  return (
    <div className="min-h-screen px-4 py-8 sm:py-14 bg-background">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <VerveBackButton to="/" label="Back to Event" />
          <VervePresenterBadge />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
          <article className="gothic-frame poster-grain relative overflow-hidden bg-card">
            <div className="border-b border-dashed border-bone/25 bg-oxblood p-6 sm:p-10">
              <div className="mb-3">
                <VerveLogo variant="horizontal" size="sm" showCo={true} />
              </div>
              <p className="text-xs font-bold uppercase tracking-[.3em] text-lavender">
                Verve &amp; Co. presents
              </p>
              <h1 className="mt-3 text-5xl leading-[.85] text-bone sm:text-7xl">
                Hauntings
                <br />
                of the Rift
              </h1>
            </div>
            <div className="grid gap-8 p-6 sm:grid-cols-[1fr_auto] sm:p-10">
              <div>
                <div className="flex items-center gap-2 text-bone">
                  <Icon className="size-5 text-lavender" />
                  <strong className="uppercase tracking-widest">{title}</strong>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
                <dl className="mt-10 grid grid-cols-2 gap-6">
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Attendee
                    </dt>
                    <dd className="mt-1 text-xl text-bone">Sample Guest</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Ticket
                    </dt>
                    <dd className="mt-1 text-xl text-bone">Revenant (Example)</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Date
                    </dt>
                    <dd className="mt-1 text-xl text-bone">31 Oct 2026</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Ticket ID
                    </dt>
                    <dd className="mt-1 text-xl text-bone">Example ID: HRT-DEMO-001</dd>
                  </div>
                </dl>
                <div className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-sm text-muted-foreground">
                  <Clock3 className="size-4" />4 PM till late · Top Cliff Lodge, Nakuru
                </div>
              </div>
              <QRPlaceholder />
            </div>
            <div className="border-t border-border bg-background/50 p-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Design preview · This QR is not valid for entry
            </div>
          </article>
          <aside>
            <p className="text-xs font-bold uppercase tracking-widest text-lavender">
              Ticket state preview
            </p>
            <div className="mt-4 grid gap-2">
              {(["valid", "used", "cancelled", "invalid"] as State[]).map((s) => (
                <Button
                  key={s}
                  variant={state === s ? "event" : "spectral"}
                  className="justify-start"
                  onClick={() => setState(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              This preview contains sample data only. It does not represent a real ticket or change
              a ticket&apos;s status.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
