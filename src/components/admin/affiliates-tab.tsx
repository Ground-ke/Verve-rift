import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Link2,
  MessageSquare,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Search,
  Ticket,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/lib/auth/admin-auth-context";
import { toast } from "sonner";

const DEFAULT_AFFILIATE_TERMS = {
  commissionPerPersonKes: 140,
  peoplePerCompPass: 30,
};

export interface AffiliateRow {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsent: boolean;
  consentAt: string | null;
  unsubscribedAt: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  appliedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  visitsAllTime: number;
  visitsLast7Days: number;
  ordersStarted: number;
  approvedOrders: number;
  admittedPeople: number;
  pendingPeople: number;
  totalRevenueKes: number;
  conversionRate: number;
  commissionPerPersonKes: number;
  commissionKes: number;
  paidKes: number;
  owedKes: number;
  compsEarned: number;
  compsIssued: number;
  compsOutstanding: number;
}

interface AffiliatesSummary {
  activeAffiliatesCount: number;
  pendingApplicationsCount?: number;
  totalAffiliatesCount: number;
  totalReferredPeople: number;
  totalPendingPeople: number;
  totalReferredRevenueKes: number;
  totalCommissionKes: number;
  totalCommissionPaidKes: number;
  totalCommissionOwedKes: number;
  totalCompsEarned: number;
  totalCompsIssued: number;
  totalCompsOutstanding: number;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `comp-${crypto.randomUUID()}`;
  }
  return `comp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeCodePreview(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 32);
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

function isPendingApplication(aff: AffiliateRow): boolean {
  return Boolean(aff.appliedAt) && !aff.approvedAt && !aff.rejectedAt && !aff.active;
}

export function AffiliatesTab() {
  const { user } = useAdminAuth();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [terms, setTerms] = useState(DEFAULT_AFFILIATE_TERMS);
  const [summary, setSummary] = useState<AffiliatesSummary>({
    activeAffiliatesCount: 0,
    pendingApplicationsCount: 0,
    totalAffiliatesCount: 0,
    totalReferredPeople: 0,
    totalPendingPeople: 0,
    totalReferredRevenueKes: 0,
    totalCommissionKes: 0,
    totalCommissionPaidKes: 0,
    totalCommissionOwedKes: 0,
    totalCompsEarned: 0,
    totalCompsIssued: 0,
    totalCompsOutstanding: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingCode, setProcessingCode] = useState<string | null>(null);
  const [recentlyApprovedAffiliate, setRecentlyApprovedAffiliate] =
    useState<AffiliateRow | null>(null);

  // Create Affiliate Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createCodeTouched, setCreateCodeTouched] = useState(false);
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createMarketingConsent, setCreateMarketingConsent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Affiliate Modal State
  const [editingAffiliate, setEditingAffiliate] = useState<AffiliateRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editMarketingConsent, setEditMarketingConsent] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Payout Modal State
  const [payoutAffiliate, setPayoutAffiliate] = useState<AffiliateRow | null>(null);
  const [payoutAmountKes, setPayoutAmountKes] = useState("");
  const [payoutMpesaRef, setPayoutMpesaRef] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutRequiresOverpayConfirm, setPayoutRequiresOverpayConfirm] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [isRecordingPayout, setIsRecordingPayout] = useState(false);

  // Issue Milestone Comp Modal State
  const [compAffiliate, setCompAffiliate] = useState<AffiliateRow | null>(null);
  const [compTierSlug, setCompTierSlug] = useState("revenant");
  const [compQuantity, setCompQuantity] = useState("1");
  const [compAttendeeName, setCompAttendeeName] = useState("");
  const [compBuyerEmail, setCompBuyerEmail] = useState("");
  const [compBuyerPhone, setCompBuyerPhone] = useState("");
  const [compNote, setCompNote] = useState("");
  const [compIdempotencyKey, setCompIdempotencyKey] = useState(() => createIdempotencyKey());
  const [isIssuingComp, setIsIssuingComp] = useState(false);

  const fetchAffiliates = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/affiliates");
      const data = await res.json();
      if (res.ok && data.success) {
        setAffiliates(Array.isArray(data.affiliates) ? data.affiliates : []);
        if (data.terms) setTerms(data.terms);
        if (data.summary) setSummary(data.summary);
      } else {
        toast.error(data.message || "Failed to load affiliates");
      }
    } catch {
      toast.error("Network error while loading affiliates");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAffiliates();
  }, []);

  const getSiteOrigin = () =>
    typeof window !== "undefined" ? window.location.origin : "https://verve-rift.vercel.app";

  const getReferralLink = (code: string) => `${getSiteOrigin()}/?ref=${code}#tickets`;

  const getWhatsAppShareUrl = (aff: AffiliateRow) => {
    const link = getReferralLink(aff.code);
    const text = `Hi ${aff.name}! Here is your official Hauntings of the Rift affiliate link: ${link}\n\nYou earn KES ${terms.commissionPerPersonKes} for every guest admitted plus 1 free pass for every ${terms.peoplePerCompPass} guests.`;
    const cleanDigits = (aff.phone || "").replace(/\D/g, "");
    return cleanDigits
      ? `https://wa.me/${cleanDigits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const getWeeklyMessage = (aff: AffiliateRow) => {
    const link = getReferralLink(aff.code);
    return `Hi ${aff.name}, Hauntings of the Rift update: you have ${aff.admittedPeople} guests admitted (${aff.pendingPeople} pending), KES ${aff.commissionKes.toLocaleString()} earned (KES ${aff.paidKes.toLocaleString()} paid, KES ${aff.owedKes.toLocaleString()} owed), and ${aff.compsEarned} free pass(es) earned (${aff.compsOutstanding} to claim). Your link: ${link}`;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleDownloadQr = async (aff: AffiliateRow) => {
    const link = getReferralLink(aff.code);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(
      link,
    )}`;
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `affiliate-qr-${aff.code}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      toast.success(`Downloaded QR for ?ref=${aff.code}`);
    } catch {
      toast.error("Could not download QR image.");
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Name",
      "Code",
      "Status",
      "Phone",
      "Email",
      "Marketing Consent",
      "Visits All Time",
      "Visits Last 7 Days",
      "Orders Started",
      "Approved Orders",
      "People Admitted",
      "Pending People",
      "Conversion (%)",
      "Commission Earned (KES)",
      "Paid (KES)",
      "Owed (KES)",
      "Comps Earned",
      "Comps Issued",
      "Comps Outstanding",
      "Notes",
    ];

    const rows = filteredAffiliates.map((aff) => {
      const statusLabel = isPendingApplication(aff)
        ? "pending"
        : aff.rejectedAt && !aff.active
          ? "rejected"
          : aff.active
            ? "active"
            : "inactive";
      return [
        aff.name,
        aff.code,
        statusLabel,
        aff.phone || "",
        aff.email || "",
        aff.marketingConsent ? "yes" : "no",
        aff.visitsAllTime,
        aff.visitsLast7Days,
        aff.ordersStarted,
        aff.approvedOrders,
        aff.admittedPeople,
        aff.pendingPeople,
        aff.conversionRate,
        aff.commissionKes,
        aff.paidKes,
        aff.owedKes,
        aff.compsEarned,
        aff.compsIssued,
        aff.compsOutstanding,
        aff.notes || "",
      ]
        .map(escapeCsvCell)
        .join(",");
    });

    const csvContent = [headers.map(escapeCsvCell).join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `affiliates-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredAffiliates.length} affiliate row(s) to CSV`);
  };

  const handleApproveApplication = async (aff: AffiliateRow) => {
    setProcessingCode(aff.code);
    try {
      const res = await fetch(
        `/api/admin/affiliates/${encodeURIComponent(aff.code)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorEmail: user?.email || "admin@verve.co.ke",
            actor_id: user?.id,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Could not approve application.");
        return;
      }
      setRecentlyApprovedAffiliate(data.affiliate || aff);
      toast.success(`Approved ${aff.name} (?ref=${aff.code})`);
      await fetchAffiliates();
    } catch {
      toast.error("Network error while approving application.");
    } finally {
      setProcessingCode(null);
    }
  };

  const handleRejectApplication = async (aff: AffiliateRow) => {
    setProcessingCode(aff.code);
    try {
      const res = await fetch(
        `/api/admin/affiliates/${encodeURIComponent(aff.code)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorEmail: user?.email || "admin@verve.co.ke",
            actor_id: user?.id,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Could not reject application.");
        return;
      }
      toast.info(`Rejected application for ?ref=${aff.code}`);
      await fetchAffiliates();
    } catch {
      toast.error("Network error while rejecting application.");
    } finally {
      setProcessingCode(null);
    }
  };

  const handleToggleActive = async (aff: AffiliateRow) => {
    setProcessingCode(aff.code);
    try {
      const res = await fetch(`/api/admin/affiliates/${encodeURIComponent(aff.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: !aff.active,
          actorEmail: user?.email || "admin@verve.co.ke",
          actor_id: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Could not update status.");
        return;
      }
      toast.success(
        `${aff.name} (?ref=${aff.code}) is now ${!aff.active ? "Active" : "Inactive"}`,
      );
      await fetchAffiliates();
    } catch {
      toast.error("Network error while toggling status.");
    } finally {
      setProcessingCode(null);
    }
  };

  const pendingCount = useMemo(
    () =>
      summary.pendingApplicationsCount ??
      affiliates.filter((a) => isPendingApplication(a)).length,
    [affiliates, summary.pendingApplicationsCount],
  );

  const filteredAffiliates = useMemo(() => {
    return affiliates.filter((aff) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        aff.name.toLowerCase().includes(q) ||
        aff.code.toLowerCase().includes(q) ||
        (aff.phone && aff.phone.toLowerCase().includes(q)) ||
        (aff.email && aff.email.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter === "pending") return isPendingApplication(aff);
      if (statusFilter === "active") return aff.active;
      if (statusFilter === "inactive") return !aff.active;
      if (statusFilter === "owed") return aff.owedKes > 0;
      if (statusFilter === "comps_due") return aff.compsOutstanding > 0;
      return true;
    });
  }, [affiliates, searchQuery, statusFilter]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setCreateName("");
    setCreateCode("");
    setCreateCodeTouched(false);
    setCreatePhone("");
    setCreateEmail("");
    setCreateNotes("");
    setCreateMarketingConsent(false);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateNameChange = (value: string) => {
    setCreateName(value);
    if (!createCodeTouched) {
      setCreateCode(sanitizeCodePreview(value));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (createName.trim().length < 2) {
      setCreateError("Name must be between 2 and 80 characters.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          code: createCode.trim() || undefined,
          phone: createPhone.trim() || undefined,
          email: createEmail.trim() || undefined,
          notes: createNotes.trim() || undefined,
          marketingConsent: createMarketingConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.message || "Could not create affiliate.");
        return;
      }

      toast.success(`Affiliate '${data.affiliate.name}' (?ref=${data.affiliate.code}) created`);
      setIsCreateOpen(false);
      await fetchAffiliates();
    } catch {
      setCreateError("Network error while creating affiliate.");
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (aff: AffiliateRow) => {
    setEditingAffiliate(aff);
    setEditName(aff.name);
    setEditPhone(aff.phone || "");
    setEditEmail(aff.email || "");
    setEditNotes(aff.notes || "");
    setEditActive(aff.active);
    setEditMarketingConsent(aff.marketingConsent);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAffiliate) return;
    setEditError(null);

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/affiliates/${encodeURIComponent(editingAffiliate.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          email: editEmail.trim() || null,
          notes: editNotes.trim() || null,
          active: editActive,
          marketingConsent: editMarketingConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditError(data.message || "Could not update affiliate.");
        return;
      }

      toast.success(`Updated affiliate ?ref=${editingAffiliate.code}`);
      setEditingAffiliate(null);
      await fetchAffiliates();
    } catch {
      setEditError("Network error while updating affiliate.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Payout Modal
  const handleOpenPayout = (aff: AffiliateRow) => {
    setPayoutAffiliate(aff);
    setPayoutAmountKes(aff.owedKes > 0 ? String(aff.owedKes) : "");
    setPayoutMpesaRef("");
    setPayoutNote("");
    setPayoutRequiresOverpayConfirm(false);
    setPayoutError(null);
  };

  const handlePayoutSubmit = async (e: React.FormEvent, confirmOverpay = false) => {
    e.preventDefault();
    if (!payoutAffiliate) return;
    setPayoutError(null);

    const amountKes = parseInt(payoutAmountKes, 10);
    if (!Number.isSafeInteger(amountKes) || amountKes <= 0) {
      setPayoutError("Enter a positive integer amount in KES.");
      return;
    }

    const cleanRef = payoutMpesaRef.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,12}$/.test(cleanRef)) {
      setPayoutError("M-Pesa reference must be 8 to 12 letters and digits.");
      return;
    }

    setIsRecordingPayout(true);
    try {
      const res = await fetch(
        `/api/admin/affiliates/${encodeURIComponent(payoutAffiliate.code)}/payouts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountKes,
            mpesaReference: cleanRef,
            note: payoutNote.trim() || undefined,
            confirmOverpay: confirmOverpay || payoutRequiresOverpayConfirm,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 409 && data.code === "OVERPAY_CONFIRMATION_REQUIRED") {
          setPayoutRequiresOverpayConfirm(true);
          setPayoutError(data.message);
          return;
        }
        setPayoutError(data.message || "Failed to record payout.");
        return;
      }

      toast.success(
        `Recorded KES ${amountKes.toLocaleString()} payout (${cleanRef}) for ${payoutAffiliate.name}`,
      );
      setPayoutAffiliate(null);
      await fetchAffiliates();
    } catch {
      setPayoutError("Network error while recording payout.");
    } finally {
      setIsRecordingPayout(false);
    }
  };

  // Open Issue Milestone Comp Modal
  const handleOpenCompModal = (aff: AffiliateRow) => {
    setCompAffiliate(aff);
    setCompTierSlug("revenant");
    setCompQuantity("1");
    setCompAttendeeName(aff.name);
    setCompBuyerEmail(aff.email || "");
    setCompBuyerPhone(aff.phone || "");
    setCompNote(`Affiliate milestone comp (${aff.admittedPeople} admitted guests)`);
    setCompIdempotencyKey(createIdempotencyKey());
  };

  const handleIssueMilestoneComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compAffiliate) return;

    if (!compAttendeeName.trim() || !compBuyerEmail.trim()) {
      toast.error("Recipient name and email are required to issue a comp pass.");
      return;
    }

    setIsIssuingComp(true);
    try {
      const res = await fetch("/api/admin/tickets/comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier_slug: compTierSlug,
          quantity: parseInt(compQuantity, 10) || 1,
          attendee_name: compAttendeeName.trim(),
          buyer_email: compBuyerEmail.trim(),
          buyer_phone: compBuyerPhone.trim() || undefined,
          comp_reason: "affiliate_milestone",
          comp_for_affiliate: compAffiliate.code,
          comp_note: compNote.trim() || undefined,
          idempotency_key: compIdempotencyKey,
          issued_by: user?.email || "admin@verve.co.ke",
          actor_id: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to issue complimentary pass.");
        return;
      }

      toast.success("Milestone Complimentary Pass Issued", {
        description: data.message,
      });
      setCompAffiliate(null);
      await fetchAffiliates();
    } catch {
      toast.error("Network error while issuing complimentary pass.");
    } finally {
      setIsIssuingComp(false);
    }
  };

  const previewNewCode = sanitizeCodePreview(createCode || createName) || "handle";

  return (
    <div className="space-y-6">
      {/* Recently Approved WhatsApp Prompt */}
      {recentlyApprovedAffiliate && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-emerald-500/50 bg-emerald-950/30 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-emerald-300">
              Approved {recentlyApprovedAffiliate.name} (?ref={recentlyApprovedAffiliate.code})
            </p>
            <p className="text-xs font-mono text-bone-muted">
              Send them their active referral link on WhatsApp so they know they are approved.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={getWhatsAppShareUrl(recentlyApprovedAffiliate)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 px-3 py-1.5 text-xs font-mono"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Message on WhatsApp
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecentlyApprovedAffiliate(null)}
              className="text-xs text-muted-foreground hover:text-bone h-8"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Pending Applications Banner */}
      {pendingCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-amber-500/50 bg-amber-950/30 p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-200">
                {pendingCount} Pending Affiliate Application{pendingCount === 1 ? "" : "s"}
              </p>
              <p className="text-xs font-mono text-bone-muted">
                Review and approve applicants so their link visits and M-Pesa payouts are activated.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
            className="border-amber-500/50 text-amber-300 hover:text-bone text-xs font-mono"
          >
            {statusFilter === "pending" ? "Show All Affiliates" : `Review Pending (${pendingCount})`}
          </Button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-mono uppercase tracking-wider">Active Affiliates</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl text-bone">
            {summary.activeAffiliatesCount} / {summary.totalAffiliatesCount}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            {pendingCount > 0
              ? `${pendingCount} pending application${pendingCount === 1 ? "" : "s"}`
              : `KES ${terms.commissionPerPersonKes}/person · 1 comp/${terms.peoplePerCompPass} people`}
          </p>
        </div>

        <div className="border border-emerald-500/30 bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-mono uppercase tracking-wider">
              People Admitted via Affiliates
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-2xl text-emerald-300">
            {summary.totalReferredPeople} Admitted
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            {summary.totalPendingPeople} pending verification · KES{" "}
            {summary.totalReferredRevenueKes.toLocaleString()} revenue
          </p>
        </div>

        <div className="border border-amber-500/30 bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-mono uppercase tracking-wider">
              Total Commission Owed
            </span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl text-amber-300">
            KES {summary.totalCommissionOwedKes.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            Earned: KES {summary.totalCommissionKes.toLocaleString()} · Paid: KES{" "}
            {summary.totalCommissionPaidKes.toLocaleString()}
          </p>
        </div>

        <div className="border border-lavender/30 bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-lavender">
            <span className="text-xs font-mono uppercase tracking-wider">Comps Outstanding</span>
            <Ticket className="w-4 h-4 text-lavender" />
          </div>
          <div className="font-display text-2xl text-bone">
            {summary.totalCompsOutstanding} Outstanding
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            {summary.totalCompsEarned} earned · {summary.totalCompsIssued} issued
          </p>
        </div>
      </div>

      {/* Search & Action Toolbar */}
      <div className="border border-border bg-card/80 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search affiliates by name, ?ref=code, phone, or email..."
              className="pl-9 bg-background border-border text-xs font-mono h-10 text-bone"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-48 bg-background border-border text-xs font-mono text-bone">
                <SelectValue placeholder="Filter Affiliates" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs font-mono">
                <SelectItem value="all">All Affiliates ({affiliates.length})</SelectItem>
                <SelectItem value="pending">Pending Applications ({pendingCount})</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
                <SelectItem value="owed">Balance Owed &gt; 0</SelectItem>
                <SelectItem value="comps_due">Comps Outstanding &gt; 0</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredAffiliates.length === 0}
              className="border-border text-lavender hover:text-bone text-xs h-10 px-3 font-mono"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchAffiliates()}
              disabled={isLoading}
              className="border-border text-lavender hover:text-bone text-xs h-10 px-3 font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="bg-oxblood text-bone hover:bg-oxblood/90 border border-amber-500/40 text-xs h-10 px-3.5 font-mono"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Add affiliate
            </Button>
          </div>
        </div>
      </div>

      {/* Affiliates Table */}
      <div className="border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader className="bg-background/80">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground py-3">
                Name &amp; Code
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Status &amp; Contact
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Visits &amp; Conversion
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Orders &amp; People Admitted
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Commission / Paid / Owed
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Comps ({terms.peoplePerCompPass} guests)
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
                  Loading affiliates &amp; real-time ledger stats...
                </TableCell>
              </TableRow>
            ) : filteredAffiliates.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-40 text-center text-muted-foreground text-xs font-mono space-y-2"
                >
                  <div className="w-10 h-10 rounded-full bg-card border border-border grid place-items-center mx-auto text-amber-400 mb-2">
                    <Award className="w-5 h-5" />
                  </div>
                  <p className="text-bone font-display text-sm">No Affiliates Found</p>
                  <p className="max-w-md mx-auto text-muted-foreground text-[11px]">
                    Add affiliates or review public applications to manage personal{" "}
                    <span className="text-amber-300">/?ref=code#tickets</span> links, M-Pesa
                    payouts, and milestone comp passes.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredAffiliates.map((aff) => {
                const isPending = isPendingApplication(aff);
                const isRejected = Boolean(aff.rejectedAt) && !aff.active;
                return (
                  <TableRow
                    key={aff.code}
                    className="border-b border-border/60 hover:bg-background/50 transition-colors"
                  >
                    {/* Name & Code */}
                    <TableCell className="py-3">
                      <div className="font-medium text-xs text-bone">{aff.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-xs text-amber-400">
                        <span>?ref={aff.code}</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(getReferralLink(aff.code), `Link for ${aff.code}`)
                          }
                          className="text-muted-foreground hover:text-bone p-0.5"
                          title="Copy link"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {aff.notes && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 max-w-[200px] truncate">
                          {aff.notes}
                        </div>
                      )}
                    </TableCell>

                    {/* Status & Contact */}
                    <TableCell className="text-xs font-mono">
                      <div className="mb-1 flex items-center gap-1.5">
                        {isPending ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 bg-amber-950/40 text-amber-300 font-mono text-[9px] uppercase px-1.5 py-0"
                          >
                            Pending Review
                          </Badge>
                        ) : isRejected ? (
                          <Badge
                            variant="outline"
                            className="border-red-500/40 bg-red-950/30 text-red-300 font-mono text-[9px] uppercase px-1.5 py-0"
                          >
                            Rejected
                          </Badge>
                        ) : aff.active ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 bg-emerald-950/40 text-emerald-300 font-mono text-[9px] uppercase px-1.5 py-0"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-muted-foreground/40 bg-muted/20 text-muted-foreground font-mono text-[9px] uppercase px-1.5 py-0"
                          >
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="text-bone">{aff.phone ? `+${aff.phone}` : "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                        {aff.email || "—"}
                      </div>
                    </TableCell>

                    {/* Visits & Conversion */}
                    <TableCell className="font-mono text-xs">
                      <div className="text-bone">
                        {aff.visitsAllTime} all-time{" "}
                        <span className="text-muted-foreground text-[10px]">
                          ({aff.visitsLast7Days} in 7d)
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Conversion: {aff.conversionRate}%
                      </div>
                    </TableCell>

                    {/* Orders & People Admitted */}
                    <TableCell className="font-mono text-xs">
                      <div className="text-emerald-400 font-bold text-sm">
                        {aff.admittedPeople} admitted{" "}
                        <span className="text-[10px] font-normal text-amber-300/90">
                          ({aff.pendingPeople} pending)
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {aff.approvedOrders} approved / {aff.ordersStarted} started
                      </div>
                    </TableCell>

                    {/* Commission / Paid / Owed */}
                    <TableCell className="font-mono text-xs">
                      <div className="text-amber-300 font-bold">
                        Owed: KES {aff.owedKes.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Earned: KES {aff.commissionKes.toLocaleString()} · Paid: KES{" "}
                        {aff.paidKes.toLocaleString()}
                      </div>
                    </TableCell>

                    {/* Comps */}
                    <TableCell className="font-mono text-xs">
                      <div className="text-bone font-bold">{aff.compsOutstanding} outstanding</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {aff.compsEarned} earned / {aff.compsIssued} issued
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void handleApproveApplication(aff)}
                              disabled={processingCode === aff.code}
                              className="h-7 px-2 text-[11px] font-mono bg-emerald-600 hover:bg-emerald-500 text-bone"
                              title="Approve application"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRejectApplication(aff)}
                              disabled={processingCode === aff.code}
                              className="h-7 px-2 text-[11px] font-mono border-red-500/40 text-red-300 hover:text-bone"
                              title="Reject application"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            handleCopy(getReferralLink(aff.code), `Link for ${aff.name}`)
                          }
                          className="size-8 text-amber-400 hover:text-bone hover:bg-oxblood/30"
                          title="Copy link"
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>

                        <a
                          href={getWhatsAppShareUrl(aff)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex size-8 items-center justify-center text-emerald-400 hover:text-bone hover:bg-oxblood/30"
                          title="Share on WhatsApp"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleDownloadQr(aff)}
                          className="size-8 text-bone-muted hover:text-bone hover:bg-oxblood/30"
                          title="Download QR (PNG)"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            handleCopy(getWeeklyMessage(aff), `Weekly message for ${aff.name}`)
                          }
                          className="size-8 text-lavender hover:text-bone hover:bg-oxblood/30"
                          title="Copy weekly message"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPayout(aff)}
                          className="h-7 px-2 text-[11px] font-mono border-amber-500/40 text-amber-300 hover:text-bone"
                          title="Record payout"
                        >
                          <Wallet className="w-3 h-3 mr-1" />
                          Payout
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenCompModal(aff)}
                          className="h-7 px-2 text-[11px] font-mono border-lavender/40 text-lavender hover:text-bone"
                          title="Issue comp"
                        >
                          <Ticket className="w-3 h-3 mr-1" />
                          Issue comp
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleToggleActive(aff)}
                          disabled={processingCode === aff.code}
                          className={`size-8 hover:bg-oxblood/30 ${
                            aff.active
                              ? "text-emerald-400 hover:text-red-300"
                              : "text-muted-foreground hover:text-emerald-300"
                          }`}
                          title={aff.active ? "Deactivate affiliate" : "Activate affiliate"}
                        >
                          <Power className="w-4 h-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenEdit(aff)}
                          className="size-8 text-muted-foreground hover:text-bone hover:bg-oxblood/30"
                          title="Edit affiliate"
                        >
                          <Edit3 className="w-4 h-4" />
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

      {/* MODAL 1: Add Affiliate */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-card border-amber-500/40 text-bone max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              Add affiliate
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Creates an active referral code and personal link. Earn rate: KES{" "}
              {terms.commissionPerPersonKes}/person admitted.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-3 my-2 text-xs">
            {createError && (
              <div className="p-2.5 border border-red-500/50 bg-red-950/40 text-red-300 font-mono text-[11px]">
                {createError}
              </div>
            )}

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Name (2–80 chars) *
              </label>
              <Input
                value={createName}
                onChange={(e) => handleCreateNameChange(e.target.value)}
                placeholder="e.g. Wanjiru or DJ Asiti"
                className="bg-background border-border text-xs text-bone"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Code (Auto-filled from name, editable until saved)
              </label>
              <Input
                value={createCode}
                onChange={(e) => {
                  setCreateCodeTouched(true);
                  setCreateCode(sanitizeCodePreview(e.target.value));
                }}
                placeholder="e.g. wanjiru or dj_asiti"
                className="bg-background border-border text-xs font-mono text-bone"
              />
              <p className="text-[11px] font-mono text-amber-300 mt-1 break-all">
                Link preview: {getReferralLink(previewNewCode)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  M-Pesa Phone (Optional)
                </label>
                <Input
                  type="tel"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="bg-background border-border text-xs font-mono text-bone"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Email Address (Optional)
                </label>
                <Input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="affiliate@example.com"
                  className="bg-background border-border text-xs font-mono text-bone"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Notes (Optional)
              </label>
              <Textarea
                rows={2}
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Campus rep, DJ collab, crew captain..."
                className="bg-background border-border text-xs text-bone"
              />
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={createMarketingConsent}
                onChange={(e) => setCreateMarketingConsent(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="text-xs text-muted-foreground font-mono">
                This person agreed to receive event updates and affiliate program emails
              </span>
            </label>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs text-muted-foreground hover:text-bone"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                className="bg-oxblood hover:bg-oxblood/90 text-bone text-xs border border-amber-500/40 font-mono"
              >
                {isCreating ? "Creating..." : "Create Affiliate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Edit Affiliate */}
      <Dialog
        open={Boolean(editingAffiliate)}
        onOpenChange={(open) => !open && setEditingAffiliate(null)}
      >
        <DialogContent className="bg-card border-amber-500/40 text-bone max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-400" />
              Edit Affiliate — ?ref={editingAffiliate?.code}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Referral code <span className="text-amber-300">{editingAffiliate?.code}</span> is
              permanent and cannot be changed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-3 my-2 text-xs">
            {editError && (
              <div className="p-2.5 border border-red-500/50 bg-red-950/40 text-red-300 font-mono text-[11px]">
                {editError}
              </div>
            )}

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Referral Code (Immutable)
              </label>
              <Input
                value={editingAffiliate?.code || ""}
                disabled
                className="bg-background/50 border-border text-xs font-mono text-muted-foreground"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Full Name *
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-background border-border text-xs text-bone"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  M-Pesa Phone
                </label>
                <Input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="bg-background border-border text-xs font-mono text-bone"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="affiliate@example.com"
                  className="bg-background border-border text-xs font-mono text-bone"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Notes
              </label>
              <Textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="bg-background border-border text-xs text-bone"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="accent-emerald-400"
                />
                <span className="text-xs text-bone font-mono">
                  Active affiliate (count link visits &amp; include in active roster)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editMarketingConsent}
                  onChange={(e) => setEditMarketingConsent(e.target.checked)}
                  className="accent-amber-400"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  This person agreed to receive event updates and affiliate program emails
                </span>
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingAffiliate(null)}
                className="text-xs text-muted-foreground hover:text-bone"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingEdit}
                className="bg-oxblood hover:bg-oxblood/90 text-bone text-xs border border-amber-500/40 font-mono"
              >
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Record M-Pesa Payout */}
      <Dialog
        open={Boolean(payoutAffiliate)}
        onOpenChange={(open) => !open && setPayoutAffiliate(null)}
      >
        <DialogContent className="bg-card border-amber-500/40 text-bone max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-400" />
              Record M-Pesa Commission Payout
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Affiliate: <span className="text-bone">{payoutAffiliate?.name}</span> (?ref=
              {payoutAffiliate?.code}) · Balance owed:{" "}
              <span className="text-amber-300 font-bold">
                KES {(payoutAffiliate?.owedKes ?? 0).toLocaleString()}
              </span>
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => handlePayoutSubmit(e, false)}
            className="space-y-3 my-2 text-xs"
          >
            {payoutError && (
              <div className="p-3 border border-amber-500/50 bg-amber-950/40 text-amber-200 font-mono text-[11px] space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{payoutError}</span>
                </div>
                {payoutRequiresOverpayConfirm && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isRecordingPayout}
                    onClick={(e) => void handlePayoutSubmit(e, true)}
                    className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 font-mono text-xs h-8"
                  >
                    Confirm Overpay &amp; Record Payout
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Amount Paid (KES) *
                </label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={payoutAmountKes}
                  onChange={(e) => {
                    setPayoutAmountKes(e.target.value);
                    setPayoutRequiresOverpayConfirm(false);
                  }}
                  placeholder="e.g. 1400"
                  className="bg-background border-border text-xs font-mono text-bone"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  M-Pesa Reference (8–12 chars) *
                </label>
                <Input
                  value={payoutMpesaRef}
                  onChange={(e) => setPayoutMpesaRef(e.target.value.toUpperCase())}
                  placeholder="e.g. SJK8912MNP"
                  maxLength={12}
                  className="bg-background border-border text-xs font-mono uppercase text-bone"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Note (Optional)
              </label>
              <Input
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                placeholder="Weekly affiliate M-Pesa payout"
                className="bg-background border-border text-xs font-mono text-bone"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPayoutAffiliate(null)}
                className="text-xs text-muted-foreground hover:text-bone"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRecordingPayout}
                className="bg-oxblood hover:bg-oxblood/90 text-bone text-xs border border-amber-500/40 font-mono"
              >
                {isRecordingPayout ? "Recording..." : "Record Payout"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Issue Milestone Comp Pass */}
      <Dialog
        open={Boolean(compAffiliate)}
        onOpenChange={(open) => !open && setCompAffiliate(null)}
      >
        <DialogContent className="bg-card border-lavender/40 text-bone max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-bone flex items-center gap-2">
              <Ticket className="w-5 h-5 text-lavender" />
              Issue Affiliate Milestone Comp Pass
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Affiliate <span className="text-amber-300">?ref={compAffiliate?.code}</span> has{" "}
              {compAffiliate?.admittedPeople ?? 0} admitted guests ({compAffiliate?.compsEarned ?? 0}{" "}
              earned, {compAffiliate?.compsIssued ?? 0} issued,{" "}
              <span className="text-bone font-bold">
                {compAffiliate?.compsOutstanding ?? 0} outstanding
              </span>
              ).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleIssueMilestoneComp} className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Pass Tier *
                </label>
                <Select value={compTierSlug} onValueChange={setCompTierSlug}>
                  <SelectTrigger className="h-9 bg-background border-border text-xs text-bone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">
                    <SelectItem value="revenant">Revenant (Admits 1)</SelectItem>
                    <SelectItem value="soulbound">Soulbound (Admits 2)</SelectItem>
                    <SelectItem value="coven">Coven (Admits 4)</SelectItem>
                    <SelectItem value="outcasts">Outcasts (Admits 6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Quantity (1–10) *
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={compQuantity}
                  onChange={(e) => setCompQuantity(e.target.value)}
                  className="h-9 bg-background border-border text-xs font-mono text-bone"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Recipient Full Name *
              </label>
              <Input
                value={compAttendeeName}
                onChange={(e) => setCompAttendeeName(e.target.value)}
                className="bg-background border-border text-xs text-bone"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Recipient Email *
                </label>
                <Input
                  type="email"
                  value={compBuyerEmail}
                  onChange={(e) => setCompBuyerEmail(e.target.value)}
                  placeholder="affiliate@example.com"
                  className="bg-background border-border text-xs font-mono text-bone"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                  Phone (Optional)
                </label>
                <Input
                  type="tel"
                  value={compBuyerPhone}
                  onChange={(e) => setCompBuyerPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="bg-background border-border text-xs font-mono text-bone"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Comp Note (Optional)
              </label>
              <Input
                value={compNote}
                onChange={(e) => setCompNote(e.target.value)}
                className="bg-background border-border text-xs font-mono text-bone"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCompAffiliate(null)}
                className="text-xs text-muted-foreground hover:text-bone"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isIssuingComp}
                className="bg-oxblood hover:bg-oxblood/90 text-bone text-xs border border-amber-500/40 font-mono"
              >
                {isIssuingComp ? "Issuing Comp..." : "Issue Complimentary Pass"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
