import React, { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Download,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Users,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerveLogo } from "@/components/brand/verve-logo";

export interface DigitalTicketData {
  ticketNumber: string;
  qrHash?: string;
  tierSlug: string;
  tierName: string;
  admitsCount: number;
  attendeeName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  priceKes?: number;
  issuedAt: string;
  usedAt?: string | null;
  venue: {
    name: string;
    address: string;
    city: string;
    date: string;
    time: string;
    ageRequirement: string;
  };
}

export interface DigitalTicketProps {
  ticket: DigitalTicketData;
  showAdminActions?: boolean;
  onStatusChange?: (newStatus: "valid" | "used") => void;
}

export const DigitalTicket: React.FC<DigitalTicketProps> = ({
  ticket,
  showAdminActions = false,
  onStatusChange,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  const isValid = ticket.status === "valid";
  const isUsed = ticket.status === "used";

  const qrPayload = JSON.stringify({
    code: ticket.ticketNumber,
    hash: ticket.qrHash,
    tier: ticket.tierName,
    holder: ticket.attendeeName,
    admits: ticket.admitsCount,
    v: 1,
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(ticket.ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadQr = async () => {
    setIsDownloading(true);
    try {
      // First attempt to download the high-resolution server-rendered template pass
      const res = await fetch(`/api/tickets/${ticket.ticketNumber}/image`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hauntings-pass-${ticket.ticketNumber}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setIsDownloading(false);
        return;
      }
    } catch {
      // Fallback to local canvas generation if offline
    }

    try {
      const svg = document.getElementById(`ticket-qr-${ticket.ticketNumber}`);
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width + 80;
        canvas.height = img.height + 140;
        if (!ctx) return;

        // Dark gothic background
        ctx.fillStyle = "#2B2C2E";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header text
        ctx.fillStyle = "#F5F2EB";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("HAUNTINGS OF THE RIFT", canvas.width / 2, 35);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "12px monospace";
        ctx.fillText(`${ticket.tierName} • Code: ${ticket.ticketNumber}`, canvas.width / 2, 55);

        // Draw QR
        ctx.drawImage(img, 40, 70);

        // Footer text
        ctx.fillStyle = "#A09BA8";
        ctx.font = "11px sans-serif";
        ctx.fillText(
          `Guest: ${ticket.attendeeName} (${ticket.admitsCount} Admits)`,
          canvas.width / 2,
          canvas.height - 25,
        );
        ctx.fillText("31 Oct 2026 • Topcliff Lodge, Nakuru", canvas.width / 2, canvas.height - 10);

        const a = document.createElement("a");
        a.download = `hauntings-ticket-${ticket.ticketNumber}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        setIsDownloading(false);
      };

      img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
    } catch (e) {
      console.warn("Download fallback:", e);
      setIsDownloading(false);
    }
  };

  const handleAddToCalendar = () => {
    const title = encodeURIComponent("Hauntings of the Rift: Halloween Nightlife 2026");
    const details = encodeURIComponent(
      `Verve & Co. Presents Hauntings of the Rift.\nTicket Code: ${ticket.ticketNumber}\nHolder: ${ticket.attendeeName}\nVenue: The Lawns Restaurant, Nakuru.`,
    );
    const location = encodeURIComponent(
      "The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru, Kenya",
    );
    // 2026-10-31T13:00:00Z to 2026-11-01T01:00:00Z (4PM to 4AM EAT)
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=20261031T130000Z/20261101T010000Z&details=${details}&location=${location}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSimulateCheckin = async () => {
    setIsScanning(true);
    try {
      const res = await fetch("/api/tickets/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ticket.ticketNumber, staff_name: "Gate Scanner" }),
      });
      const data = await res.json();
      if (data.success && onStatusChange) {
        onStatusChange("used");
      }
    } catch {
      // noop
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg" id={`digital-ticket-${ticket.ticketNumber}`} ref={ticketRef}>
      {/* Outer Ticket Card */}
      <div className="relative overflow-hidden border border-bone/20 bg-card shadow-2xl backdrop-blur-sm">
        {/* Top Verve & Gothic Branding Strip */}
        <div className="relative border-b border-bone/20 bg-background/80 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VerveLogo className="size-6 text-oxblood-light" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground block">
                Official Event Admission
              </span>
              <h3 className="font-display text-lg tracking-wide text-bone">
                HAUNTINGS OF THE RIFT
              </h3>
            </div>
          </div>

          {/* Status Badge */}
          {isValid && (
            <div className="flex items-center gap-1.5 border border-emerald-500/50 bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-300 uppercase tracking-widest">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              VALID PASS
            </div>
          )}
          {isUsed && (
            <div className="flex items-center gap-1.5 border border-amber-500/50 bg-amber-950/40 px-2.5 py-1 text-xs font-bold text-amber-300 uppercase tracking-widest">
              <CheckCircle2 className="size-3 text-amber-400" />
              USED / CHECKED IN
            </div>
          )}
          {!isValid && !isUsed && (
            <div className="flex items-center gap-1.5 border border-destructive/50 bg-destructive/20 px-2.5 py-1 text-xs font-bold text-destructive-foreground uppercase tracking-widest">
              <AlertCircle className="size-3" />
              {ticket.status.toUpperCase()}
            </div>
          )}
        </div>

        {/* QR Code Presentation Canvas */}
        <div className="p-6 text-center">
          <div className="mx-auto my-2 inline-block rounded-lg border-2 border-bone/30 bg-white p-4 shadow-inner">
            <QRCodeSVG
              id={`ticket-qr-${ticket.ticketNumber}`}
              value={qrPayload}
              size={200}
              level="H"
              marginSize={0}
              className="mx-auto"
            />
          </div>

          {/* Ticket Reference Code Bar */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Pass Code:
            </span>
            <span className="font-mono text-xl font-bold tracking-wider text-bone">
              {ticket.ticketNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-bone"
              onClick={handleCopyCode}
              title="Copy Ticket Code"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </Button>
          </div>

          <p className="mt-1 text-[11px] text-bone/60">
            Present this QR code on your mobile device at the main entry gate.
          </p>
        </div>

        {/* Dashed Ticket Tear Divider */}
        <div className="relative flex items-center justify-between px-2">
          <div className="size-6 -translate-x-3 rounded-full bg-background border border-bone/20" />
          <div className="flex-1 border-t-2 border-dashed border-bone/20" />
          <div className="size-6 translate-x-3 rounded-full bg-background border border-bone/20" />
        </div>

        {/* Ticket Holder & Event Details Meta */}
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4 border-b border-bone/10 pb-4">
            <div>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground block">
                Attendee Name
              </span>
              <p className="font-semibold text-bone text-base">{ticket.attendeeName}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground block">
                Pass Tier
              </span>
              <p className="font-semibold text-oxblood-light text-base">{ticket.tierName}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground block">
                Admissions
              </span>
              <p className="flex items-center gap-1.5 font-semibold text-bone">
                <Users className="size-4 text-muted-foreground" />
                {ticket.admitsCount} {ticket.admitsCount === 1 ? "Guest" : "Guests"}
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground block">
                Age Requirement
              </span>
              <p className="font-semibold text-bone">{ticket.venue.ageRequirement}</p>
            </div>
          </div>

          {/* Date & Location */}
          <div className="space-y-2 pt-1 text-xs text-bone-muted">
            <div className="flex items-start gap-2.5">
              <Calendar className="size-4 text-oxblood-light shrink-0 mt-0.5" />
              <div>
                <strong className="text-bone block">{ticket.venue.date}</strong>
                <span>{ticket.venue.time}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="size-4 text-oxblood-light shrink-0 mt-0.5" />
              <div>
                <strong className="text-bone block">{ticket.venue.name}</strong>
                <span>
                  {ticket.venue.address}, {ticket.venue.city}
                </span>
              </div>
            </div>
          </div>

          {/* Security & Cryptographic Verification Hash Footprint */}
          <div className="rounded border border-bone/10 bg-background/50 p-3 text-[10px] font-mono text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>Cryptographic HMAC SHA-256 Verified</span>
            </div>
            <span className="opacity-70 truncate max-w-[120px]">
              {ticket.qrHash ? ticket.qrHash.substring(0, 12) + "..." : "SECURE"}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div className="border-t border-bone/20 bg-background/70 p-4 flex flex-wrap gap-2 justify-center">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-bone/20 text-xs text-bone hover:bg-bone/10"
          >
            <a
              href={`/api/tickets/${ticket.ticketNumber}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="mr-1.5 size-3.5 text-blue-400" /> Download PDF Pass
            </a>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-bone/20 text-xs text-bone hover:bg-bone/10"
            onClick={handleDownloadQr}
            disabled={isDownloading}
          >
            <Download className="mr-1.5 size-3.5" />
            {isDownloading ? "Saving..." : "Save Ticket Image"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-bone/20 text-xs text-bone hover:bg-bone/10"
            onClick={handleAddToCalendar}
          >
            <Clock className="mr-1.5 size-3.5" /> Add to Calendar
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-bone/20 text-xs text-bone hover:bg-bone/10"
          >
            <a
              href="https://maps.google.com/?q=Top+Cliff+Lounge+Nakuru"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1.5 size-3.5" /> Directions
            </a>
          </Button>
        </div>

        {/* Admin Checkin Action (Optional simulation tool) */}
        {showAdminActions && (
          <div className="border-t border-dashed border-bone/20 bg-oxblood/10 p-3 text-center">
            {isValid ? (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs"
                onClick={handleSimulateCheckin}
                disabled={isScanning}
              >
                {isScanning ? "Validating..." : "Simulate Gate Check-in (Mark Used)"}
              </Button>
            ) : (
              <span className="text-xs text-amber-300 font-mono">
                Ticket already redeemed at {ticket.usedAt || "Gate Scan"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
