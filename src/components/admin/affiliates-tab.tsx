import React, { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
  AlertTriangle,
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

export function AffiliatesTab() {
  const { user } = useAdminAuth();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [terms, setTerms] = useState(DEFAULT_AFFILIATE_TERMS);
  const [summary, setSummary] = useState<AffiliatesSummary>({
    activeAffiliatesCount: 0,
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

  // Create Affiliate Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
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

  const getReferralLink = (code: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://verve-rift.vercel.app";
    return `${origin}/?ref=${code}#tickets`;
  };

  const getWhatsAppInviteText = (aff: AffiliateRow) => {
    const link = getReferralLink(aff.code);
    return `Hey ${aff.name}! Here is your official Hauntings of the Rift referral link:\n${link}\n\n• You earn KES ${terms.commissionPerPersonKes} per person admitted on verified M-Pesa orders.\n• Every ${terms.peoplePerCompPass} people admitted unlocks 1 complimentary pass.\n• Guests can also type "${aff.code}" in "Who invited you?" at checkout.`;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

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
    setCreatePhone("");
    setCreateEmail("");
    setCreateNotes("");
    setCreateMarketingConsent(false);
    setCreateError(null);
    setIsCreateOpen(true);
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

  return (
    <div className="space-y-6">
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
            KES {terms.commissionPerPersonKes}/person · 1 comp/{terms.peoplePerCompPass} people
          </p>
        </div>

        <div className="border border-emerald-500/30 bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-mono uppercase tracking-wider">
              Referred Guests Admitted
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
              Commission Balance Owed
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
            <span className="text-xs font-mono uppercase tracking-wider">
              Milestone Comp Passes
            </span>
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
              <SelectTrigger className="h-10 w-44 bg-background border-border text-xs font-mono text-bone">
                <SelectValue placeholder="Filter Affiliates" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs font-mono">
                <SelectItem value="all">All Affiliates ({affiliates.length})</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
                <SelectItem value="owed">Balance Owed &gt; 0</SelectItem>
                <SelectItem value="comps_due">Comps Outstanding &gt; 0</SelectItem>
              </SelectContent>
            </Select>

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
              Add Affiliate
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
                Affiliate &amp; Code
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Contact &amp; Consent
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Visits &amp; Funnel
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                People Admitted
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Commission (KES)
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Comps (1/{terms.peoplePerCompPass})
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
                    Add ambassadors, DJs, or crew captains to generate personal{" "}
                    <span className="text-amber-300">/?ref=code#tickets</span> links and track
                    verified admissions, M-Pesa payouts, and milestone comp passes.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredAffiliates.map((aff) => (
                <TableRow
                  key={aff.code}
                  className="border-b border-border/60 hover:bg-background/50 transition-colors"
                >
                  {/* Name & Code */}
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-bone">{aff.name}</span>
                      {aff.active ? (
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
                    <div className="flex items-center gap-1.5 mt-1 font-mono text-xs text-amber-400">
                      <span>?ref={aff.code}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(getReferralLink(aff.code), `Link for ${aff.code}`)}
                        className="text-muted-foreground hover:text-bone p-0.5"
                        title="Copy referral link"
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

                  {/* Contact & Consent */}
                  <TableCell className="text-xs font-mono">
                    <div className="text-bone">{aff.phone ? `+${aff.phone}` : "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                      {aff.email || "—"}
                    </div>
                    <div className="mt-1">
                      {aff.marketingConsent && !aff.unsubscribedAt ? (
                        <span className="text-[10px] text-emerald-400">Opted in</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">No email opt-in</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Visits & Funnel */}
                  <TableCell className="font-mono text-xs">
                    <div className="text-bone">
                      {aff.visitsAllTime} visits{" "}
                      <span className="text-muted-foreground text-[10px]">
                        ({aff.visitsLast7Days} in 7d)
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {aff.approvedOrders} / {aff.ordersStarted} orders ({aff.conversionRate}% conv)
                    </div>
                  </TableCell>

                  {/* People Admitted */}
                  <TableCell className="font-mono text-xs">
                    <div className="text-emerald-400 font-bold text-sm">
                      {aff.admittedPeople}{" "}
                      <span className="text-[10px] font-normal text-muted-foreground">admitted</span>
                    </div>
                    <div className="text-[11px] text-amber-300/90">
                      {aff.pendingPeople} pending
                    </div>
                  </TableCell>

                  {/* Commission */}
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
                    <div className="text-bone font-bold">
                      {aff.compsOutstanding} due
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {aff.compsEarned} earned · {aff.compsIssued} issued
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          handleCopy(getReferralLink(aff.code), `Referral link for ${aff.name}`)
                        }
                        className="size-8 text-amber-400 hover:text-bone hover:bg-oxblood/30"
                        title="Copy referral link"
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          handleCopy(getWhatsAppInviteText(aff), `WhatsApp message for ${aff.name}`)
                        }
                        className="size-8 text-emerald-400 hover:text-bone hover:bg-oxblood/30"
                        title="Copy WhatsApp welcome message"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenPayout(aff)}
                        className="h-7 px-2 text-[11px] font-mono border-amber-500/40 text-amber-300 hover:text-bone"
                        title="Record M-Pesa payout"
                      >
                        <Wallet className="w-3 h-3 mr-1" />
                        Payout
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenCompModal(aff)}
                        className="h-7 px-2 text-[11px] font-mono border-lavender/40 text-lavender hover:text-bone"
                        title="Issue milestone comp pass"
                      >
                        <Ticket className="w-3 h-3 mr-1" />
                        Comp
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEdit(aff)}
                        className="size-8 text-muted-foreground hover:text-bone hover:bg-oxblood/30"
                        title="Edit affiliate details"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
              Add Affiliate Partner
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Creates an official referral code and personal link. Earn rate: KES{" "}
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
                Full Name / Handle (2–80 chars) *
              </label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Wanjiru or DJ Asiti"
                className="bg-background border-border text-xs text-bone"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block mb-1">
                Referral Code (Optional — auto-generated from name if blank)
              </label>
              <Input
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="e.g. wanjiru or dj_asiti"
                className="bg-background border-border text-xs font-mono text-bone"
              />
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
                Opted in to receive affiliate broadcast emails
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
                  Opted in to affiliate email announcements
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
