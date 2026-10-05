import { useState, useEffect, useMemo, useRef } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Mail,
  Smartphone,
  Calendar,
  AlertCircle,
  Search,
  ExternalLink,
  PlusCircle,
  Clock,
  Sparkles,
  DollarSign,
  Ticket,
  User,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { useAdminAuth } from "../../lib/auth/admin-auth-context";

function formatHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export interface PendingOrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  ticketName: string;
  quantity: number;
  totalKes: number;
  referralCode?: string;
  mpesaCode?: string;
  mpesaMessage?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  rejectionReason?: string;
  approvedBy?: string;
}

export function ManualVerificationTab() {
  const { user } = useAdminAuth();

  // Instant synchronous hydration from localStorage so orders never vanish upon tab switch or navigation
  const [orders, setOrders] = useState<PendingOrderRecord[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("rift_admin_pending_orders_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_e) {
        /* ignore */
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get("order") || params.get("orderId") || "";
      } catch (_e) {
        /* ignore */
      }
    }
    return "";
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [updateFailed, setUpdateFailed] = useState<boolean>(false);
  const hasAutoSelectedRef = useRef(false);
  const approvedOrderIdsRef = useRef<Set<string>>(new Set());

  // Approval Modal State
  const [selectedOrder, setSelectedOrder] = useState<PendingOrderRecord | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [verifiedReceiptReference, setVerifiedReceiptReference] = useState("");
  const [receivedAmountKes, setReceivedAmountKes] = useState(0);
  const [receivedAt, setReceivedAt] = useState("");

  // Rejection Modal State
  const [rejectingOrder, setRejectingOrder] = useState<PendingOrderRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState(
    "M-Pesa transaction reference not found on merchant statement.",
  );
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (!selectedOrder) return;
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setVerifiedReceiptReference(selectedOrder.mpesaCode || "");
    setReceivedAmountKes(selectedOrder.totalKes);
    setReceivedAt(localNow);
    setApprovalNotes("");
  }, [selectedOrder]);

  // Fetch pending orders from API
  const fetchPendingOrders = async () => {
    try {
      const res = await fetch("/api/admin/orders/pending");
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.orders)) {
        setUpdateFailed(true);
        return;
      }
      const mapped: PendingOrderRecord[] = data.orders.map((o: Record<string, unknown>) => ({
        id: String(o["id"] || o["orderId"] || ""),
        orderNumber: String(o["orderNumber"] || o["id"] || ""),
        customerName: String(o["buyerName"] || o["customerName"] || "Customer"),
        customerEmail: String(o["buyerEmail"] || o["customerEmail"] || "No email provided"),
        customerPhone: String(o["buyerPhone"] || o["customerPhone"] || ""),
        ticketName: String(o["ticketName"] || "General Admission"),
        quantity: Number(o["quantity"] || 1),
        totalKes: Number(o["totalKes"] || 0),
        ...(o["referralCode"] ? { referralCode: String(o["referralCode"]) } : {}),
        ...(o["mpesaCode"] ? { mpesaCode: String(o["mpesaCode"]) } : {}),
        ...(o["mpesaMessage"] ? { mpesaMessage: String(o["mpesaMessage"]) } : {}),
        status: String(o["status"] || "pending") as PendingOrderRecord["status"],
        createdAt: String(o["createdAt"] || new Date().toISOString()),
        ...(o["updatedAt"] ? { updatedAt: String(o["updatedAt"]) } : {}),
        ...(o["rejectionReason"] ? { rejectionReason: String(o["rejectionReason"]) } : {}),
        ...(o["approvedBy"] ? { approvedBy: String(o["approvedBy"]) } : {}),
      }));
      setOrders(() => {
        const result = mapped.filter(
          (o) =>
            (o.status === "pending_approval" || o.status === "pending") &&
            !approvedOrderIdsRef.current.has(o.id) &&
            !approvedOrderIdsRef.current.has(o.orderNumber),
        );
        try {
          localStorage.setItem("rift_admin_pending_orders_cache", JSON.stringify(result));
        } catch (_e) {
          /* ignore */
        }
        return result;
      });
      setUpdateFailed(false);
      setLastUpdatedAt(formatHHMM(new Date()));
    } catch (err) {
      console.warn("Failed to fetch pending orders from API:", err);
      setUpdateFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Poll pending orders every 60 seconds while page is visible
  useEffect(() => {
    void fetchPendingOrders();

    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void fetchPendingOrders();
      }
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Auto-open approval dialog if navigating directly from email alert with an order parameter
  useEffect(() => {
    if (typeof window === "undefined" || hasAutoSelectedRef.current || orders.length === 0) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const target = params.get("order") || params.get("orderId");
      if (!target) return;

      const targetNorm = target.trim().toLowerCase();
      const matched = orders.find(
        (o) =>
          o.orderNumber.toLowerCase() === targetNorm ||
          o.id.toLowerCase() === targetNorm ||
          (o.mpesaCode && o.mpesaCode.toLowerCase() === targetNorm),
      );

      if (matched) {
        hasAutoSelectedRef.current = true;
        setSelectedOrder(matched);
        toast.info(`Opened Order #${matched.orderNumber} for Review`, {
          description: `Customer: ${matched.customerName} (${matched.mpesaCode || "M-Pesa Pending"})`,
        });
      }
    } catch (_e) {
      /* ignore */
    }
  }, [orders]);

  // Filter orders by search
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        (o.referralCode && o.referralCode.toLowerCase().includes(q)) ||
        (o.mpesaCode && o.mpesaCode.toLowerCase().includes(q)),
    );
  }, [orders, searchQuery]);

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied code: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Execute Approval
  const handleApproveOrder = async () => {
    if (!selectedOrder) return;
    setIsApproving(true);

    try {
      const res = await fetch("/api/admin/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          verified_receipt_reference: verifiedReceiptReference.trim(),
          received_amount_kes: receivedAmountKes,
          received_at: new Date(receivedAt).toISOString(),
          evidence_note: approvalNotes.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to approve order.");
        setIsApproving(false);
        return;
      }

      // Permanently mark order ID and order number in session ref
      approvedOrderIdsRef.current.add(selectedOrder.id);
      approvedOrderIdsRef.current.add(selectedOrder.orderNumber);

      const emailStatus = data.emailDelivery?.status;
      const hasRecipientEmail =
        selectedOrder.customerEmail && selectedOrder.customerEmail !== "No email provided";
      const emailMessage = hasRecipientEmail
        ? emailStatus === "accepted"
          ? "The email provider accepted the ticket confirmation; delivery is not confirmed."
          : emailStatus === "queued" || emailStatus === "processing"
            ? "The ticket confirmation is queued; check the notification outbox for its status."
            : "The ticket confirmation was not accepted; check the notification outbox."
        : "";
      toast.success(
        `Order ${selectedOrder.orderNumber} approved and tickets issued.${emailMessage ? ` ${emailMessage}` : ""}`,
        { duration: 6500 },
      );

      // Remove approved order from pending list and sync cache
      setOrders((prev) => {
        const next = prev.filter(
          (o) => o.id !== selectedOrder.id && o.orderNumber !== selectedOrder.orderNumber,
        );
        try {
          localStorage.setItem("rift_admin_pending_orders_cache", JSON.stringify(next));
        } catch (_e) {
          /* ignore */
        }
        return next;
      });
      setSelectedOrder(null);
      setApprovalNotes("");
    } catch (err) {
      toast.error("Network error during approval.");
    } finally {
      setIsApproving(false);
    }
  };

  // Execute Rejection
  const handleRejectOrder = async () => {
    if (!rejectingOrder) return;
    setIsRejecting(true);

    try {
      const res = await fetch("/api/admin/orders/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: rejectingOrder.id,
          reason: rejectionReason,
          admin_email: user?.email || "admin@verve.co.ke",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to reject order.");
        setIsRejecting(false);
        return;
      }

      approvedOrderIdsRef.current.add(rejectingOrder.id);
      approvedOrderIdsRef.current.add(rejectingOrder.orderNumber);

      toast.info(`Order ${rejectingOrder.orderNumber} marked as rejected.`);
      setOrders((prev) => {
        const next = prev.filter(
          (o) => o.id !== rejectingOrder.id && o.orderNumber !== rejectingOrder.orderNumber,
        );
        try {
          localStorage.setItem("rift_admin_pending_orders_cache", JSON.stringify(next));
        } catch (_e) {
          /* ignore */
        }
        return next;
      });
      setRejectingOrder(null);
    } catch (err) {
      toast.error("Network error during rejection.");
    } finally {
      setIsRejecting(false);
    }
  };

  // Total in queue
  const totalQueueKes = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.totalKes || 0), 0);
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-bone">M-Pesa Verification Queue</h1>
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-400 bg-amber-950/20 font-mono text-xs"
            >
              {orders.length} Awaiting Approval
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1 max-w-2xl">
            Confirm customer-submitted M-Pesa transaction reference codes against your Safaricom
            statement. Tickets are issued only after approval. Email delivery is reported separately
            and is not guaranteed by the approval action.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 border rounded font-mono text-xs ${
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
            variant="ghost"
            size="sm"
            onClick={fetchPendingOrders}
            disabled={loading}
            className="text-xs text-bone hover:bg-card border border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-border bg-card p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Pending Orders
          </span>
          <div className="font-display text-2xl text-amber-400">
            {orders.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">in queue</span>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">Requires admin confirmation</p>
        </div>

        <div className="border border-border bg-card p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Queued Revenue
          </span>
          <div className="font-display text-2xl text-bone">
            KES {totalQueueKes.toLocaleString()}
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">Awaiting manual settlement</p>
        </div>

        <div className="border border-border bg-card p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Ticket delivery
          </span>
          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-sm pt-1">
            <Mail className="w-4 h-4" />
            <span>Gmail SMTP Active</span>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            Tickets are stored after approval. Delivery status depends on the email service.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 bg-card border border-border px-3 py-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by M-Pesa code, order number, customer name, email, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-0 focus-visible:ring-0 text-sm text-bone placeholder:text-muted-foreground/60 h-8"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="text-xs text-muted-foreground hover:text-bone h-7 px-2"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="border border-border bg-card p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-400" />
          <p className="text-sm font-mono text-muted-foreground">
            Synchronizing pending verification queue...
          </p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="border border-border/60 bg-card/50 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-500/30 grid place-items-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg text-bone">Queue is all clear!</h3>
            <p className="text-xs text-muted-foreground font-mono max-w-md mx-auto">
              No orders are currently waiting for M-Pesa approval. New customer checkout submissions
              will appear here in real-time.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400/90 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Listening for incoming M-Pesa submissions
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="border border-border bg-card p-5 transition-all hover:border-border/90 space-y-4"
            >
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-amber-950/40 border border-amber-500/40 grid place-items-center text-amber-400 shrink-0 font-mono font-bold text-xs">
                    M-PESA
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-bone">
                        {order.orderNumber}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-400 bg-amber-950/30 text-[10px] font-mono uppercase"
                      >
                        Pending Review
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Submitted {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Amount Due / Paid */}
                <div className="text-left sm:text-right">
                  <div className="text-xs text-muted-foreground font-mono">Amount to Verify</div>
                  <div className="font-display text-2xl text-amber-400">
                    KES {order.totalKes.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Middle Section: Customer & M-Pesa Identifier Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Details Box */}
                <div className="bg-background/50 border border-border/80 p-3.5 rounded space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-lavender" />
                    Customer &amp; Ticket Info
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Name</span>
                      <strong className="text-bone font-medium">{order.customerName}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Phone</span>
                      <strong className="text-bone font-mono">+{order.customerPhone}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground block text-[10px]">
                        Delivery Email (Ticket Target)
                      </span>
                      <div className="flex items-center gap-1.5 text-lavender font-mono">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{order.customerEmail}</span>
                      </div>
                    </div>
                    <div className="col-span-2 border-t border-border/50 pt-1.5 mt-1 flex justify-between items-center">
                      <span className="text-muted-foreground">Tier &amp; Quantity:</span>
                      <span className="text-bone font-mono font-semibold">
                        {order.quantity}x {order.ticketName}
                      </span>
                    </div>
                    {order.referralCode && (
                      <div className="col-span-2 flex justify-between items-center pt-1">
                        <span className="text-muted-foreground">Referred By:</span>
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-950/30 text-amber-300 font-mono text-[10px]"
                        >
                          ?ref={order.referralCode}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* M-Pesa Code & Message Box */}
                <div className="bg-background/50 border border-amber-500/30 p-3.5 rounded space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                      M-Pesa Identifier
                    </span>
                    {order.mpesaCode && (
                      <span className="text-[10px] text-muted-foreground">Click code to copy</span>
                    )}
                  </div>

                  {order.mpesaCode ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-amber-950/30 border border-amber-500/40 px-3 py-2 rounded">
                        <span className="font-mono text-base font-bold tracking-widest text-amber-300">
                          {order.mpesaCode}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyCode(order.mpesaCode!)}
                          className="h-7 px-2 text-xs text-amber-300 hover:text-bone hover:bg-amber-900/40"
                        >
                          {copiedCode === order.mpesaCode ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>

                      {order.mpesaMessage && (
                        <div className="text-[11px] text-bone-muted bg-card/80 border border-border/60 p-2.5 rounded font-mono leading-relaxed max-h-24 overflow-y-auto">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                            Customer Message / SMS:
                          </span>
                          &ldquo;{order.mpesaMessage}&rdquo;
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-300/80 font-mono py-2">
                      No code submitted yet (awaiting customer input)
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectingOrder(order)}
                  className="w-full sm:w-auto text-xs border-destructive/40 text-destructive-foreground hover:bg-destructive/10"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5 text-destructive" />
                  Reject Order
                </Button>

                <Button
                  variant="event"
                  size="sm"
                  onClick={() => setSelectedOrder(order)}
                  className="w-full sm:w-auto text-xs font-semibold"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Approve &amp; Dispatch Ticket Email
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APPROVAL CONFIRMATION DIALOG */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="border-border bg-card sm:max-w-lg text-bone">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Confirm Payment &amp; Issue Tickets
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Order {selectedOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="border border-border/80 bg-background/60 p-3.5 rounded space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <strong className="text-bone">{selectedOrder.customerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Email:</span>
                  <strong className="text-lavender font-mono">{selectedOrder.customerEmail}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ticket Tier:</span>
                  <strong className="text-bone font-mono">
                    {selectedOrder.quantity}x {selectedOrder.ticketName}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <strong className="text-amber-400 font-mono font-bold text-sm">
                    KES {selectedOrder.totalKes.toLocaleString()}
                  </strong>
                </div>
                {selectedOrder.mpesaCode && (
                  <div className="flex justify-between border-t border-border/60 pt-1.5">
                    <span className="text-muted-foreground">M-Pesa Reference:</span>
                    <strong className="text-amber-300 font-mono font-bold">
                      {selectedOrder.mpesaCode}
                    </strong>
                  </div>
                )}
              </div>

              <div className="border border-amber-500/40 bg-amber-950/20 p-3 rounded text-xs text-bone-muted space-y-1">
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold font-mono">
                  <ShieldCheck className="w-4 h-4" /> Manual statement verification required
                </div>
                <p>
                  Compare the receipt and exact amount with the organizer's M-Pesa merchant
                  statement. This app cannot verify a receipt with Safaricom.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-muted-foreground">
                    Verified M-Pesa receipt reference:
                  </label>
                  <Input
                    required
                    minLength={5}
                    maxLength={32}
                    value={verifiedReceiptReference}
                    onChange={(e) => setVerifiedReceiptReference(e.target.value.toUpperCase())}
                    className="bg-background border-border text-xs text-bone font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-muted-foreground">
                    Amount on statement (KES):
                  </label>
                  <Input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={receivedAmountKes}
                    onChange={(e) => setReceivedAmountKes(Number(e.target.value))}
                    className="bg-background border-border text-xs text-bone font-mono"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-mono text-muted-foreground">
                    Receipt date and time on statement:
                  </label>
                  <Input
                    required
                    type="datetime-local"
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                    className="bg-background border-border text-xs text-bone"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-muted-foreground">
                  Evidence note (required audit detail):
                </label>
                <Input
                  required
                  placeholder="e.g., Confirmed in merchant statement for 1 Oct"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="bg-background border-border text-xs text-bone"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedOrder(null)}
              disabled={isApproving}
              className="text-muted-foreground hover:text-bone text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="event"
              size="sm"
              onClick={handleApproveOrder}
              disabled={isApproving}
              className="text-xs"
            >
              {isApproving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Approving &amp; Sending Email...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Confirm Approval &amp; Send Tickets
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECTION REASON DIALOG */}
      <Dialog open={!!rejectingOrder} onOpenChange={(open) => !open && setRejectingOrder(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md text-bone">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-destructive-foreground flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              Reject Order
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Order {rejectingOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>

          {rejectingOrder && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-bone-muted leading-relaxed">
                Provide a reason for rejecting this order. The order will be marked as rejected in
                the central ledger.
              </p>

              <div className="space-y-2">
                <label className="text-[11px] font-mono text-muted-foreground">
                  Select or enter reason:
                </label>
                <div className="space-y-1.5">
                  {[
                    "M-Pesa transaction reference not found on merchant statement.",
                    "Payment amount does not match order total.",
                    "Duplicate transaction code already claimed.",
                    "Transaction reversed or cancelled on Safaricom.",
                  ].map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRejectionReason(r)}
                      className={`w-full text-left text-xs p-2 rounded border transition-colors ${
                        rejectionReason === r
                          ? "bg-destructive/10 border-destructive/50 text-bone"
                          : "bg-background/50 border-border text-muted-foreground hover:bg-background hover:text-bone"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Custom rejection reason..."
                  className="bg-background border-border text-xs text-bone h-20 mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRejectingOrder(null)}
              disabled={isRejecting}
              className="text-muted-foreground hover:text-bone text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRejectOrder}
              disabled={isRejecting}
              className="text-xs"
            >
              {isRejecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Confirm Rejection"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
