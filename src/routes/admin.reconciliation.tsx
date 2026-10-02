import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  DollarSign,
  ArrowDownRight,
  TrendingUp,
  CreditCard,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Building2,
  Receipt,
  Download,
  AlertCircle,
} from "lucide-react";
import {
  exportFinancialReportPDF,
  exportFinancialLedgerCSV,
  exportAttendeeListCSV,
  type FinancialReconciliationRecord,
  type FinancialSummaryTotals,
} from "../lib/export-utils";
import type { RefundRecord } from "../server/refund-service";
import type {
  ManualPaymentReview,
  ManualPaymentSettlement,
} from "../server/payment-operations-store";

export const Route = createFileRoute("/admin/reconciliation")({
  component: AdminReconciliationPage,
});

export function AdminReconciliationPage() {
  const localDateTimeNow = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const [loading, setLoading] = useState(true);
  const [reconciliationAvailable, setReconciliationAvailable] = useState(false);
  const [settlements, setSettlements] = useState<ManualPaymentSettlement[]>([]);
  const [receiptReviews, setReceiptReviews] = useState<ManualPaymentReview[]>([]);
  const [totals, setTotals] = useState<FinancialSummaryTotals>({
    grossRevenueKes: 0,
    totalRefundsKes: 0,
    platformFeesKes: null,
    netRevenueKes: null,
    totalSettlementsKes: 0,
    totalTicketsSold: 0,
    totalRefundsCount: 0,
  });
  const [ledger, setLedger] = useState<FinancialReconciliationRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Refund Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundTicketCode, setRefundTicketCode] = useState("");
  const [refundAmount, setRefundAmount] = useState<number>(1800);
  const [refundReason, setRefundReason] = useState("");
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reversalReference, setReversalReference] = useState("");
  const [reversalProcessedAt, setReversalProcessedAt] = useState(localDateTimeNow);
  const [confirmedExternalReversal, setConfirmedExternalReversal] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [refundFeedback, setRefundFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(localDateTimeNow);
  const [settlementEvidenceNote, setSettlementEvidenceNote] = useState("");
  const [isSavingSettlement, setIsSavingSettlement] = useState(false);
  const [settlementFeedback, setSettlementFeedback] = useState<string | null>(null);

  const fetchReconciliationData = async () => {
    setLoading(true);
    try {
      const token =
        (typeof window !== "undefined" ? sessionStorage.getItem("rift_auth_token") : null) ||
        "admin_session";
      const res = await fetch("/api/admin/reconciliation", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReconciliationAvailable(data.available === true);
        setTotals(data.totals);
        setLedger(Array.isArray(data.ledger) ? data.ledger : []);
        setRefunds(Array.isArray(data.refunds) ? data.refunds : []);
        setSettlements(Array.isArray(data.settlements) ? data.settlements : []);
        setReceiptReviews(Array.isArray(data.receiptReviews) ? data.receiptReviews : []);
      }
    } catch (err) {
      console.warn("Error loading reconciliation ledger:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliationData();
  }, []);

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !refundReason ||
      (!refundOrderId && !refundTicketCode) ||
      !reversalReference ||
      !confirmedExternalReversal
    )
      return;

    setIsProcessingRefund(true);
    setRefundFeedback(null);

    try {
      const token =
        (typeof window !== "undefined" ? sessionStorage.getItem("rift_auth_token") : null) ||
        "admin_session";
      const res = await fetch("/api/admin/refunds/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: refundOrderId || undefined,
          ticketNumber: refundTicketCode || undefined,
          amountKes: Number(refundAmount),
          reason: refundReason,
          refundType,
          reversalReference,
          externalReversalProcessedAt: new Date(reversalProcessedAt).toISOString(),
          confirmedExternalReversal,
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setRefundFeedback({ success: true, message: result.message });
        setTimeout(() => {
          setIsRefundModalOpen(false);
          setRefundReason("");
          setRefundOrderId("");
          setRefundTicketCode("");
          setReversalReference("");
          setConfirmedExternalReversal(false);
          fetchReconciliationData();
        }, 1500);
      } else {
        setRefundFeedback({
          success: false,
          message: result.message || "Failed to execute refund.",
        });
      }
    } catch {
      setRefundFeedback({
        success: false,
        message: "Could not check reversal-recording status.",
      });
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettlement(true);
    setSettlementFeedback(null);
    try {
      const token = sessionStorage.getItem("rift_auth_token") || "admin_session";
      const res = await fetch("/api/admin/payments/settlements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settlementReference,
          amountKes: Number(settlementAmount),
          settledAt: new Date(settlementDate).toISOString(),
          evidenceNote: settlementEvidenceNote,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setSettlementFeedback(result.message || "The settlement could not be recorded.");
        return;
      }
      setSettlementFeedback("External settlement statement recorded.");
      setSettlementReference("");
      setSettlementAmount("");
      setSettlementEvidenceNote("");
      await fetchReconciliationData();
    } catch {
      setSettlementFeedback("Network error recording the settlement evidence.");
    } finally {
      setIsSavingSettlement(false);
    }
  };

  const filteredLedger = ledger.filter((item) => {
    const matchesSearch =
      item.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.attendeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.gatewayRef.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" || item.status.toUpperCase() === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div
      id="reconciliation-page"
      className="min-h-screen bg-[#07090E] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 text-emerald-400">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white font-serif">
                  Financial Reconciliation
                </h1>
                <p className="text-sm text-slate-400">
                  Record receipts and settlements from organizer-held M-Pesa statements. Entries are
                  manual evidence, not provider-verified. Refund recording remains disabled until
                  external reversal references can be independently verified.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-mono text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>
                {reconciliationAvailable
                  ? "Manual evidence available"
                  : "Awaiting statement evidence"}
              </span>
            </div>

            <button
              id="open-refund-modal-btn"
              disabled
              title="Independent M-Pesa reversal verification is not configured."
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-white/10 text-slate-500 flex items-center gap-2 cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reversal recording unavailable
            </button>

            <button
              id="export-pdf-btn"
              onClick={() => exportFinancialReportPDF(ledger, totals)}
              disabled={!reconciliationAvailable}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              PDF Audit
            </button>

            <button
              id="export-csv-btn"
              onClick={() => exportFinancialLedgerCSV(ledger)}
              disabled={!reconciliationAvailable}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              CSV Ledger
            </button>

            <button
              id="refresh-recon-btn"
              onClick={fetchReconciliationData}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 transition"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Financial Summary Metric Cards */}
        <div
          id="financial-summary-cards"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Gross Ticket Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {ledger.length > 0 ? `KES ${totals.grossRevenueKes.toLocaleString()}` : "Unavailable"}
            </div>
            <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {ledger.length > 0
                ? `${totals.totalTicketsSold} tickets issued`
                : "Verified settlement data unavailable"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Total Refunds Processed</span>
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400 tracking-tight">
              {reconciliationAvailable
                ? `KES ${totals.totalRefundsKes.toLocaleString()}`
                : "Unavailable"}
            </div>
            <div className="text-xs text-slate-400 mt-2">
              {reconciliationAvailable
                ? `${totals.totalRefundsCount} transaction(s) reversed`
                : "Refund verification unavailable"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>M-Pesa Gateway Fee</span>
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 tracking-tight">
              {totals.platformFeesKes === null
                ? "Not supplied"
                : `KES ${totals.platformFeesKes.toLocaleString()}`}
            </div>
            <div className="text-xs text-slate-400 mt-2">
              No provider fee is inferred or estimated
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900/80 border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden shadow-xl">
            <div className="flex items-center justify-between text-xs text-emerald-400 mb-1.5 font-medium">
              <span>Recorded Settlements</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-300 tracking-tight">
              {settlements.length > 0
                ? `KES ${totals.totalSettlementsKes.toLocaleString()}`
                : "No records"}
            </div>
            <div className="text-xs text-emerald-400/80 mt-2">
              {settlements.length} manually recorded statement(s)
            </div>
          </div>
        </div>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <form
            onSubmit={handleRecordSettlement}
            className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Record M-Pesa Settlement
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Transcribe an external merchant-statement entry. This app does not verify or
                initiate payouts.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs text-slate-300">
                Statement reference
                <input
                  required
                  minLength={5}
                  maxLength={40}
                  value={settlementReference}
                  onChange={(event) => setSettlementReference(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white font-mono"
                />
              </label>
              <label className="space-y-1.5 text-xs text-slate-300">
                Amount received (KES)
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={settlementAmount}
                  onChange={(event) => setSettlementAmount(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white font-mono"
                />
              </label>
              <label className="space-y-1.5 text-xs text-slate-300">
                Settlement date and time
                <input
                  required
                  type="datetime-local"
                  value={settlementDate}
                  onChange={(event) => setSettlementDate(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white"
                />
              </label>
              <label className="space-y-1.5 text-xs text-slate-300">
                Evidence note
                <input
                  required
                  value={settlementEvidenceNote}
                  onChange={(event) => setSettlementEvidenceNote(event.target.value)}
                  placeholder="Merchant statement date or page"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white"
                />
              </label>
            </div>
            {settlementFeedback && (
              <p role="status" className="text-xs text-amber-200">
                {settlementFeedback}
              </p>
            )}
            <button
              type="submit"
              disabled={isSavingSettlement}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isSavingSettlement ? "Saving..." : "Save settlement evidence"}
            </button>
          </form>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Manual Statement Records
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Provider fees and receipt-to-payout matching are not inferred.
              </p>
            </div>
            {settlements.length === 0 ? (
              <p className="text-xs text-slate-500">No settlement entries recorded.</p>
            ) : (
              <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
                {settlements.map((settlement) => (
                  <div
                    key={settlement.id}
                    className="py-2 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-mono text-slate-200">{settlement.settlementReference}</p>
                      <p className="text-slate-500">
                        {new Date(settlement.settledAt).toLocaleString()} · {settlement.recordedBy}
                      </p>
                      <p className="text-slate-400">{settlement.evidenceNote}</p>
                    </div>
                    <strong className="text-emerald-300 whitespace-nowrap">
                      KES {settlement.amountKes.toLocaleString()}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            {refunds.length > 0 && (
              <div className="border-t border-white/10 pt-3">
                <h3 className="text-xs font-semibold text-slate-200 mb-2">
                  Recorded external reversals
                </h3>
                {refunds.map((refund) => (
                  <p key={refund.id} className="text-xs text-slate-400 py-1">
                    {refund.reversalReference} · KES {refund.amountKes.toLocaleString()} ·{" "}
                    {refund.processedBy}
                  </p>
                ))}
              </div>
            )}
            {receiptReviews.some((review) => review.status !== "accepted") && (
              <div className="border-t border-amber-500/20 pt-3">
                <h3 className="text-xs font-semibold text-amber-200 mb-2">Receipt exceptions</h3>
                {receiptReviews
                  .filter((review) => review.status !== "accepted")
                  .slice(0, 5)
                  .map((review) => (
                    <p key={review.id} className="text-xs text-amber-100/80 py-1">
                      {review.status.replaceAll("_", " ")} · {review.receiptReference} ·{" "}
                      {review.evidenceNote}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </section>

        {/* Search and Filters Bar */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <input
              id="recon-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Order #, Name, M-Pesa..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Status:</span>
            <select
              id="status-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Statuses ({ledger.length})</option>
              <option value="VERIFIED RECEIPT">Verified Receipt</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DISCREPANCY">Discrepancy</option>
              <option value="PENDING SETTLEMENT">Pending Settlement</option>
            </select>
          </div>
        </div>

        {/* Reconciliation Ledger Table */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Transaction Reconciliation Ledger
              </h2>
              <p className="text-xs text-slate-400">
                Organizer-recorded receipt evidence; not verified by the M-Pesa provider
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Showing {filteredLedger.length} of {ledger.length} entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-white/10 font-semibold">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Gateway Ref</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Pass Tier</th>
                  <th className="py-3 px-4 text-right">Gross (KES)</th>
                  <th className="py-3 px-4 text-right">Fee (KES)</th>
                  <th className="py-3 px-4 text-right">Net (KES)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      {reconciliationAvailable
                        ? "No reconciliation records matching your filter."
                        : "Reconciliation is unavailable until verified M-Pesa settlement records are configured."}
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((item) => (
                    <tr key={item.transactionId} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                        {item.orderNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{item.gatewayRef}</td>
                      <td className="py-3.5 px-4 font-semibold text-white">{item.attendeeName}</td>
                      <td className="py-3.5 px-4 text-slate-300">{item.tierName}</td>
                      <td className="py-3.5 px-4 text-right font-medium text-white">
                        {item.amountKes.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        {item.gatewayFeeKes?.toLocaleString() || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                        {item.netRevenueKes?.toLocaleString() || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.status === "Verified Receipt"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : item.status === "Refunded"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : item.status === "Discrepancy"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-slate-500">Reversal verification unavailable</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Process Refund Modal */}
        {isRefundModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5 text-rose-400 font-bold font-serif text-lg">
                  <RotateCcw className="w-5 h-5" />
                  Record External M-Pesa Reversal
                </div>
                <button
                  onClick={() => setIsRefundModalOpen(false)}
                  className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg"
                >
                  ✕ Close
                </button>
              </div>

              {refundFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    refundFeedback.success
                      ? "bg-emerald-950/50 border border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/50 border border-rose-500/40 text-rose-300"
                  }`}
                >
                  {refundFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {refundFeedback.message}
                </div>
              )}

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                Refund recording is disabled until external M-Pesa reversals can be independently
                verified. This app never initiates reversals.
              </div>

              <form onSubmit={handleProcessRefund} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">
                    Order Number or Ticket Code
                  </label>
                  <input
                    type="text"
                    required
                    value={refundOrderId || refundTicketCode}
                    onChange={(e) => {
                      setRefundOrderId(e.target.value);
                      setRefundTicketCode(e.target.value);
                    }}
                    placeholder="e.g. HR-2026-9042 or HR-7892-4910"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono uppercase focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-semibold">Refund Type</label>
                    <select
                      value={refundType}
                      onChange={(e) => setRefundType(e.target.value as "full" | "partial")}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none"
                    >
                      <option value="full">Full Reversal</option>
                      <option value="partial">Partial Refund</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-semibold">Amount (KES)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Reason for Refund</label>
                  <textarea
                    required
                    rows={3}
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. Customer travel cancellation request within valid policy window."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">
                    External M-Pesa reversal reference
                  </label>
                  <input
                    required
                    minLength={5}
                    maxLength={32}
                    value={reversalReference}
                    onChange={(event) => setReversalReference(event.target.value.toUpperCase())}
                    placeholder="Reference from merchant statement"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">
                    When the external reversal was processed
                  </label>
                  <input
                    required
                    type="datetime-local"
                    value={reversalProcessedAt}
                    onChange={(event) => setReversalProcessedAt(event.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white"
                  />
                </div>

                <label className="flex gap-2 items-start text-amber-100">
                  <input
                    required
                    type="checkbox"
                    checked={confirmedExternalReversal}
                    onChange={(event) => setConfirmedExternalReversal(event.target.checked)}
                    className="mt-0.5 accent-rose-500"
                  />
                  I confirm the external M-Pesa reversal has already been processed and the
                  reference above is copied from organizer evidence.
                </label>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRefundModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled
                    title="Independent M-Pesa reversal verification is not configured."
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50"
                  >
                    {isProcessingRefund ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    Unavailable
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
