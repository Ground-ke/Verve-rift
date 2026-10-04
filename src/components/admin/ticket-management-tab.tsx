import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Mail,
  Ban,
  Eye,
  FileText,
  Copy,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronDown,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useAdminAuth } from "../../lib/auth/admin-auth-context";

function formatHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export interface TicketItem {
  id: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: string;
  qrHash: string;
  tierSlug: string;
  tierName: string;
  admitsCount: number;
  attendeeName: string;
  buyerEmail?: string;
  buyerPhone: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  priceKes: number;
  issuedAt: string;
  usedAt?: string | null;
  scannedBy?: string | null;
  venue: {
    name: string;
    address: string;
    city: string;
    date: string;
    time: string;
  };
}

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export function TicketManagementTab() {
  const { user } = useAdminAuth();

  // Instant synchronous hydration from localStorage so tickets never vanish upon leaving/returning to admin page
  const [tickets, setTickets] = useState<TicketItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("rift_admin_tickets_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.filter(
              (t) =>
                t &&
                typeof t === "object" &&
                typeof t.ticketNumber === "string" &&
                t.ticketNumber.trim().length > 0 &&
                t.attendeeName,
            );
          }
        }
      } catch (_e) {
        /* ignore */
      }
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(tickets.length === 0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("hauntings-2026");

  // Modals state
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [ticketAuditLogs, setTicketAuditLogs] = useState<AuditEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const [isResending, setIsResending] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [updateFailed, setUpdateFailed] = useState<boolean>(false);

  // Load tickets from server API
  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/admin/tickets");
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.tickets)) {
        setUpdateFailed(true);
        return;
      }
      const safeServerTickets = data.tickets.filter(
        (t: TicketItem) =>
          t &&
          typeof t === "object" &&
          typeof t.ticketNumber === "string" &&
          t.ticketNumber.trim().length > 0 &&
          t.attendeeName,
      );
      const sorted = [...safeServerTickets].sort(
        (a, b) =>
          (b.issuedAt ? new Date(b.issuedAt).getTime() : 0) -
          (a.issuedAt ? new Date(a.issuedAt).getTime() : 0),
      );
      setTickets(sorted);
      try {
        localStorage.setItem("rift_admin_tickets_cache", JSON.stringify(sorted));
      } catch (_e) {
        /* ignore */
      }
      setUpdateFailed(false);
      setLastUpdatedAt(formatHHMM(new Date()));
    } catch (err) {
      console.warn("Server tickets fetch failed:", err);
      setUpdateFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchTickets();

    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void fetchTickets();
      }
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (!t || !t.ticketNumber) return false;
      // Status filter
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      // Tier filter
      if (tierFilter !== "all" && t.tierSlug !== tierFilter) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = t.ticketNumber?.toLowerCase().includes(q) ?? false;
        const matchesName = t.attendeeName?.toLowerCase().includes(q) ?? false;
        const matchesEmail = t.buyerEmail?.toLowerCase().includes(q) ?? false;
        const matchesPhone = t.buyerPhone?.toLowerCase().includes(q) ?? false;
        const matchesOrder = t.orderNumber?.toLowerCase().includes(q) ?? false;
        if (!matchesCode && !matchesName && !matchesEmail && !matchesPhone && !matchesOrder) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, statusFilter, tierFilter, searchQuery]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`, { description: text });
  };

  // Resend Ticket Email Action
  const handleResendEmail = async (ticket: TicketItem) => {
    if (!ticket.buyerEmail) {
      toast.error("Ticket does not have an associated email address.");
      return;
    }
    setIsResending(ticket.ticketNumber);
    try {
      const res = await fetch("/api/admin/tickets/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: ticket.ticketNumber,
          actor_email: user?.email || "admin@verve.co.ke",
          actor_id: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Admission Ticket Email Dispatched", {
          description: `Re-sent pass ${ticket.ticketNumber} to ${ticket.buyerEmail}`,
        });
      } else {
        toast.error(data.message || "Failed to resend ticket email.");
      }
    } catch {
      toast.error("Network error while resending email.");
    } finally {
      setIsResending(null);
    }
  };

  // Revoke Ticket Action
  const handleConfirmRevoke = async () => {
    if (!selectedTicket) return;
    setIsRevoking(true);
    try {
      const res = await fetch("/api/admin/tickets/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selectedTicket.ticketNumber,
          reason: revokeReason || "Manual organizer revocation",
          actor_email: user?.email || "admin@verve.co.ke",
          actor_id: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.error("Ticket Pass Invalidated", {
          description: `Pass ${selectedTicket.ticketNumber} has been permanently cancelled.`,
        });
        setIsRevokeModalOpen(false);
        setRevokeReason("");
        fetchTickets();
      } else {
        toast.error(data.message || "Failed to revoke ticket.");
      }
    } catch {
      toast.error("Network error while revoking ticket.");
    } finally {
      setIsRevoking(false);
    }
  };

  // View Audit Logs for a specific ticket
  const handleOpenAuditLog = async (ticket: TicketItem) => {
    setSelectedTicket(ticket);
    setIsAuditModalOpen(true);
    setIsLoadingAudit(true);
    try {
      const res = await fetch("/api/admin/audit-logs");
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        const related = data.logs.filter(
          (l: AuditEntry) =>
            l.targetId === ticket.ticketNumber ||
            l.targetId === ticket.id ||
            l.targetId === ticket.orderNumber,
        );
        setTicketAuditLogs(related);
      }
    } catch (err) {
      console.warn("Audit logs error:", err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Summary counts
  const stats = useMemo(() => {
    const total = tickets.length;
    const valid = tickets.filter((t) => t.status === "valid").length;
    const used = tickets.filter((t) => t.status === "used").length;
    const cancelled = tickets.filter((t) => t.status === "cancelled").length;
    return { total, valid, used, cancelled };
  }, [tickets]);

  return (
    <div className="space-y-6">
      {/* Metric summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border bg-card/60 p-4">
          <span className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Total Passes
          </span>
          <p className="text-2xl font-display text-bone mt-1">{stats.total}</p>
        </div>
        <div className="border border-green-500/30 bg-green-950/20 p-4">
          <span className="text-xs text-green-400 uppercase font-mono tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Valid Active
          </span>
          <p className="text-2xl font-display text-green-300 mt-1">{stats.valid}</p>
        </div>
        <div className="border border-amber-500/30 bg-amber-950/20 p-4">
          <span className="text-xs text-amber-400 uppercase font-mono tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-amber-400" />
            Checked In (Used)
          </span>
          <p className="text-2xl font-display text-amber-300 mt-1">{stats.used}</p>
        </div>
        <div className="border border-red-500/30 bg-red-950/20 p-4">
          <span className="text-xs text-red-400 uppercase font-mono tracking-wider flex items-center gap-1">
            <Ban className="w-3 h-3 text-red-400" />
            Revoked / Cancelled
          </span>
          <p className="text-2xl font-display text-red-300 mt-1">{stats.cancelled}</p>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="border border-border bg-card/80 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Ticket Code (HR-...), Attendee Name, Email, Phone, Order #..."
              className="pl-9 bg-background border-border text-xs font-mono h-10"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded font-mono text-xs ${
                updateFailed
                  ? "bg-red-950/40 border-red-500/30 text-red-300"
                  : "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  updateFailed ? "bg-red-400" : "bg-emerald-400"
                }`}
              />
              <span>
                {updateFailed
                  ? "Update failed. Click Refresh"
                  : `Last updated ${lastUpdatedAt || "--:--"}`}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchTickets}
              disabled={isLoading}
              className="border-border text-lavender hover:text-bone text-xs h-10 px-3 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
              Event Selection
            </label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-9 bg-background border-border text-xs text-bone">
                <SelectValue placeholder="Event" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs">
                <SelectItem value="hauntings-2026">Hauntings of the Rift (31 Oct 2026)</SelectItem>
                <SelectItem value="all-events">All Historical Events</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
              Admission Status
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 bg-background border-border text-xs text-bone">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs">
                <SelectItem value="all">All Statuses ({tickets.length})</SelectItem>
                <SelectItem value="valid">Valid Passes Only</SelectItem>
                <SelectItem value="used">Used / Checked In</SelectItem>
                <SelectItem value="cancelled">Revoked / Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
              Ticket Tier Category
            </label>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="h-9 bg-background border-border text-xs text-bone">
                <SelectValue placeholder="All Pass Tiers" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs">
                <SelectItem value="all">All Pass Tiers</SelectItem>
                <SelectItem value="early-bird">Early Bird (Sold Out)</SelectItem>
                <SelectItem value="revenant">Revenant (1 Guest)</SelectItem>
                <SelectItem value="soulbound">Soulbound (2 Guests)</SelectItem>
                <SelectItem value="coven">Coven (4 Guests)</SelectItem>
                <SelectItem value="outcasts">Outcasts (6 Guests)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tickets Data Table */}
      <div className="border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader className="bg-background/80">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground py-3">
                Ticket Code
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Attendee &amp; Contact
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Pass Tier &amp; Admits
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Price (KES)
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Admission Status
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Timestamp
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground text-xs font-mono"
                >
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                  Loading authoritative ticket ledger...
                </TableCell>
              </TableRow>
            ) : filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-40 text-center text-muted-foreground text-xs font-mono space-y-2"
                >
                  <div className="w-10 h-10 rounded-full bg-card border border-border grid place-items-center mx-auto text-amber-400 mb-2">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <p className="text-bone font-display text-sm">No Digital Passes Issued Yet</p>
                  <p className="max-w-md mx-auto text-muted-foreground text-[11px]">
                    Passes are generated cryptographically when customer orders are approved in the
                    M-Pesa Verification Queue or via direct checkout. Live synchronization is
                    active.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => {
                const isValid = ticket.status === "valid";
                const isUsed = ticket.status === "used";
                const isCancelled = ticket.status === "cancelled";

                return (
                  <TableRow
                    key={ticket.ticketNumber}
                    className="border-b border-border/60 hover:bg-background/50 transition-colors"
                  >
                    {/* Ticket Code */}
                    <TableCell className="font-mono text-xs text-bone font-medium py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-bold">{ticket.ticketNumber}</span>
                        <button
                          onClick={() => handleCopy(ticket.ticketNumber, "Ticket code")}
                          className="text-muted-foreground hover:text-bone p-1"
                          title="Copy ticket code"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        Ord: {ticket.orderNumber}
                      </span>
                    </TableCell>

                    {/* Attendee */}
                    <TableCell className="text-xs">
                      <div className="font-medium text-bone">{ticket.attendeeName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {ticket.buyerEmail || "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono">
                        +{ticket.buyerPhone}
                      </div>
                    </TableCell>

                    {/* Tier */}
                    <TableCell className="text-xs">
                      <div className="font-medium text-lavender">{ticket.tierName}</div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Admits {ticket.admitsCount} {ticket.admitsCount > 1 ? "Guests" : "Guest"}
                      </span>
                    </TableCell>

                    {/* Price */}
                    <TableCell className="font-mono text-xs text-bone font-medium">
                      KES {(ticket.priceKes ?? 0).toLocaleString()}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {isValid && (
                        <Badge
                          variant="outline"
                          className="border-green-500/50 bg-green-950/40 text-green-300 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />
                          Valid
                        </Badge>
                      )}
                      {isUsed && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-950/40 text-amber-300 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
                        >
                          Used ({ticket.scannedBy || "Gate"})
                        </Badge>
                      )}
                      {isCancelled && (
                        <Badge
                          variant="outline"
                          className="border-red-500/50 bg-red-950/40 text-red-300 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
                        >
                          Revoked
                        </Badge>
                      )}
                    </TableCell>

                    {/* Timestamp */}
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      <div>{new Date(ticket.issuedAt).toLocaleDateString()}</div>
                      <div className="text-[10px]">
                        {new Date(ticket.issuedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* QR Code Quick Modal */}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setIsQrModalOpen(true);
                          }}
                          className="size-8 text-lavender hover:text-bone hover:bg-oxblood/30"
                          title="View Digital QR Pass"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        {/* Resend Email */}
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isResending === ticket.ticketNumber || !ticket.buyerEmail}
                          onClick={() => handleResendEmail(ticket)}
                          className="size-8 text-lavender hover:text-bone hover:bg-oxblood/30"
                          title="Resend Ticket Email to Buyer"
                        >
                          <Mail
                            className={`w-4 h-4 ${isResending === ticket.ticketNumber ? "animate-spin" : ""}`}
                          />
                        </Button>

                        {/* Audit Log */}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenAuditLog(ticket)}
                          className="size-8 text-lavender hover:text-bone hover:bg-oxblood/30"
                          title="View Ticket Audit Log"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>

                        {/* Revoke / Invalidate */}
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={ticket.status === "cancelled"}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setIsRevokeModalOpen(true);
                          }}
                          className="size-8 text-red-400/80 hover:text-red-300 hover:bg-red-950/40 disabled:opacity-30"
                          title="Manually Invalidate / Revoke Ticket"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* MODAL 1: Revoke / Invalidate Pass Confirmation */}
      <Dialog open={isRevokeModalOpen} onOpenChange={setIsRevokeModalOpen}>
        <DialogContent className="bg-card border-red-500/40 text-bone max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-red-400 flex items-center gap-2">
              <Ban className="w-5 h-5" />
              Revoke Admission Pass
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action permanently invalidates the ticket at gate scanners and records a
              cryptographic audit log.
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-3 my-2 text-xs">
              <div className="bg-background/80 p-3 border border-border space-y-1 font-mono">
                <div>
                  Ticket:{" "}
                  <span className="text-amber-400 font-bold">{selectedTicket.ticketNumber}</span>
                </div>
                <div>
                  Attendee: <span className="text-bone">{selectedTicket.attendeeName}</span>
                </div>
                <div>
                  Tier: <span className="text-lavender">{selectedTicket.tierName}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Reason for Revocation (Required for Audit Trail)
                </label>
                <Input
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Fraudulent chargeback, Duplicate reissue, Customer requested cancellation"
                  className="bg-background border-border text-xs font-mono"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsRevokeModalOpen(false)}
              className="text-xs text-muted-foreground hover:text-bone"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isRevoking}
              onClick={handleConfirmRevoke}
              className="bg-red-900 hover:bg-red-800 text-bone text-xs border border-red-500/50"
            >
              {isRevoking ? "Revoking Pass..." : "Confirm Revocation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: QR Pass Preview */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="bg-card border-lavender/30 text-bone max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone">
              Digital Admission Pass
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Verified QR Admission Pass
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4 my-2 flex flex-col items-center">
              <div className="p-4 bg-white rounded-lg shadow-inner">
                <QRCodeSVG
                  value={selectedTicket.ticketNumber}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="text-center font-mono space-y-1">
                <div className="text-lg font-bold text-amber-400">
                  {selectedTicket.ticketNumber}
                </div>
                <div className="text-xs text-bone font-medium">{selectedTicket.attendeeName}</div>
                <div className="text-[11px] text-lavender">{selectedTicket.tierName}</div>
                <div className="text-[10px] text-muted-foreground">
                  Admits {selectedTicket.admitsCount} Guests
                </div>
              </div>

              <div className="w-full bg-background/80 p-2.5 border border-border text-[10px] text-left font-mono space-y-0.5">
                <div className="text-muted-foreground">Pass Verification Code:</div>
                <div className="truncate text-amber-400/90">{selectedTicket.qrHash}</div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full text-xs font-mono border-border"
            >
              Close Pass Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Ticket Audit Log History */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="bg-card border-lavender/30 text-bone max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              Ticket Audit History
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Immutable ledger trail for Pass {selectedTicket?.ticketNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {isLoadingAudit ? (
              <div className="py-8 text-center text-xs font-mono text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-amber-400" />
                Loading audit trail entries...
              </div>
            ) : ticketAuditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-muted-foreground bg-background/50 border border-border p-4">
                No recorded administrative interventions for this ticket yet.
                <div className="text-[10px] text-muted-foreground/70 mt-1">
                  Issued automatically via checkout engine on{" "}
                  {selectedTicket?.issuedAt
                    ? new Date(selectedTicket.issuedAt).toLocaleString()
                    : "event launch"}
                  .
                </div>
              </div>
            ) : (
              ticketAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-border/80 bg-background/60 p-3 space-y-1.5 font-mono text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-amber-400 font-bold uppercase">{log.action}</span>
                    <span className="text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    Actor: <span className="text-bone">{log.actorEmail}</span>
                  </div>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <pre className="bg-card/80 p-2 text-[10px] text-lavender overflow-x-auto rounded border border-border/40">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAuditModalOpen(false)}
              className="text-xs font-mono border-border"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
