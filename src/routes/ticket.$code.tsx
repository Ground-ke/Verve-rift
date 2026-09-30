import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitalTicket, DigitalTicketData } from "@/components/event/digital-ticket";
import {
  VerveBackButton,
  VervePresenterBadge,
  VerveErrorState,
} from "@/components/brand/verve-logo";
import { RefreshCw, HelpCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ticket/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Digital Ticket ${params?.code || ""} — Hauntings of the Rift | Verve & Co.` },
      {
        name: "description",
        content:
          "Official cryptographic admission ticket and QR pass for Hauntings of the Rift in Nakuru.",
      },
      { property: "og:title", content: `Event Pass ${params?.code || ""} — Verve & Co.` },
      { property: "og:description", content: "Present this digital pass for entry at the event." },
      { property: "og:type", content: "website" },
      { name: "referrer", content: "no-referrer" },
      { httpEquiv: "Cache-Control", content: "no-store, private" },
    ],
  }),
  component: TicketCodeRouteComponent,
});

function TicketCodeRouteComponent() {
  const { code } = Route.useParams();
  const [ticket, setTicket] = useState<DigitalTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadTicket() {
      if (!code) {
        setErrorMessage("No ticket code was specified.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/tickets/${code}`);
        const data = await res.json();

        if (!res.ok || !data.success || !data.ticket) {
          setErrorMessage(data.message || `No valid ticket pass found for code "${code}".`);
          setLoading(false);
          return;
        }

        setTicket(data.ticket);
      } catch {
        setErrorMessage("Network error verifying ticket pass. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [code]);

  const handleStatusChange = (newStatus: "valid" | "used") => {
    if (ticket) {
      setTicket({
        ...ticket,
        status: newStatus,
        usedAt: newStatus === "used" ? new Date().toISOString() : ticket.usedAt,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-20 flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="size-8 animate-spin text-oxblood-light mx-auto" />
          <p className="font-display text-lg text-bone">Authenticating cryptographic pass...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !ticket) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 flex items-center justify-between">
            <VerveBackButton to="/" label="Back to Event" />
            <VervePresenterBadge />
          </div>
          <VerveErrorState
            code="404"
            title="Ticket Not Found"
            description={errorMessage || `No ticket record exists for code ${code}.`}
            actionLabel="Recover Your Tickets"
            actionTo="/recover"
          />
          <div className="mt-6 text-center">
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <Link to="/recover">
                <HelpCircle className="mr-1.5 size-3.5" /> Lost your ticket? Use Ticket Recovery
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-bone/15 pb-4 mb-8">
          <Button asChild variant="ghost" size="sm" className="text-bone-muted hover:text-bone">
            <Link to="/">
              <ArrowLeft className="mr-2 size-4" /> Return to Event
            </Link>
          </Button>
          <VervePresenterBadge />
        </div>

        {/* Ticket Title */}
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-oxblood-light">
            Verified Digital Admission
          </p>
          <h1 className="text-3xl font-display text-bone sm:text-4xl mt-1">YOUR EVENT PASS</h1>
          <p className="text-xs text-bone-muted mt-1">
            Save or screenshot this pass. You will need to present this QR code at the entrance.
          </p>
        </div>

        {/* Digital Ticket Card */}
        <DigitalTicket
          ticket={ticket}
          showAdminActions={true}
          onStatusChange={handleStatusChange}
        />

        {/* Recovery Link Note */}
        <div className="mt-8 text-center border-t border-bone/10 pt-6">
          <p className="text-xs text-muted-foreground">
            Need to look up other tickets or change your email?{" "}
            <Link to="/recover" className="text-bone underline hover:text-oxblood-light ml-1">
              Access Ticket Recovery
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
