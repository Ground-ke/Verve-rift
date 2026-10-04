import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  XCircle,
  Clock3,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  RotateCcw,
  Ticket,
  ArrowRight,
  Copy,
  Check,
  Info,
  Send,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const mpesaPaymentDetails = {
  paybill: import.meta.env["VITE_MPESA_PAYBILL"]?.trim() || "",
  account: import.meta.env["VITE_MPESA_ACCOUNT"]?.trim() || "",
  accountName: import.meta.env["VITE_MPESA_ACCOUNT_NAME"]?.trim() || "",
};

const isMpesaPaymentConfigured = Object.values(mpesaPaymentDetails).every(Boolean);

export type PaymentPhase =
  "idle" | "submitting" | "pending_approval" | "paid" | "failed" | "timed_out" | "review";

export interface PaymentStatusCardProps {
  orderId: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | undefined;
  ticketName: string;
  quantity: number;
  totalKes: number;
  paymentPhase: PaymentPhase;
  paymentError?: string | null | undefined;
  mpesaReceipt?: string | null | undefined;
  firstTicketCode?: string | null | undefined;
  secondsRemaining?: number | undefined;
  isSubmittingCode?: boolean | undefined;
  onSubmitMpesaCode: (code: string, rawMessage?: string, email?: string) => Promise<void>;
  onCheckStatusAgain?: (() => void) | undefined;
  onCancelReservation?: (() => void) | undefined;
}

export const PaymentStatusCard: React.FC<PaymentStatusCardProps> = ({
  orderNumber,
  buyerName,
  buyerPhone,
  buyerEmail: initialBuyerEmail = "",
  ticketName,
  quantity,
  totalKes,
  paymentPhase,
  paymentError,
  mpesaReceipt,
  firstTicketCode,
  secondsRemaining,
  isSubmittingCode = false,
  onSubmitMpesaCode,
  onCheckStatusAgain,
  onCancelReservation,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [rawMpesaInput, setRawMpesaInput] = useState("");
  const [deliveryEmail, setDeliveryEmail] = useState(initialBuyerEmail);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Real-time regex extraction of 10-character M-Pesa transaction code
  const extractedCode = useMemo(() => {
    if (!rawMpesaInput.trim()) return null;
    const match = rawMpesaInput.match(/\b([A-Z0-9]{10})\b/i);
    return match?.[1] ? match[1].toUpperCase() : null;
  }, [rawMpesaInput]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!isMpesaPaymentConfigured) {
      setFormError(
        "M-Pesa payment details have not been configured. Please contact the organizers.",
      );
      return;
    }

    const cleanInput = rawMpesaInput.trim();
    if (!cleanInput) {
      setFormError(
        "Please paste your M-Pesa SMS confirmation message or enter the 10-digit reference code.",
      );
      return;
    }

    const codeToSubmit =
      extractedCode || (cleanInput.length === 10 ? cleanInput.toUpperCase() : null);
    if (!codeToSubmit || codeToSubmit.length !== 10) {
      setFormError(
        "Could not find a valid 10-character M-Pesa transaction code (e.g. TLK99XW82A). Please check the pasted text.",
      );
      return;
    }

    const emailToUse = deliveryEmail.trim().toLowerCase();
    if (!emailToUse || !emailToUse.includes("@")) {
      setFormError("Please enter a valid email address where your tickets will be dispatched.");
      return;
    }

    setSubmittedCode(codeToSubmit);
    try {
      await onSubmitMpesaCode(codeToSubmit, cleanInput, emailToUse);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to submit M-Pesa code. Please try again.";
      setFormError(msg);
    }
  };

  return (
    <div className="space-y-6" id="payment-status-container">
      {/* Reservation Expiry Timer Warning if active */}
      {secondsRemaining !== undefined &&
        secondsRemaining > 0 &&
        paymentPhase !== "paid" &&
        paymentPhase !== "pending_approval" &&
        paymentPhase !== "review" && (
        <div className="flex items-center justify-between border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-amber-400 shrink-0" />
            <span>
              Inventory held for your reservation:{" "}
              <strong className="font-mono text-amber-300">
                {Math.floor(secondsRemaining / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(secondsRemaining % 60).toString().padStart(2, "0")}
              </strong>
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:inline">
            Active Hold
          </span>
        </div>
      )}

      {/* Summary Card */}
      <div className="border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Order Reference
            </span>
            <p className="font-mono text-lg font-bold text-bone">{orderNumber}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Purchaser
            </span>
            <p className="text-lg text-bone">{buyerName}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              M-Pesa Mobile
            </span>
            <p className="font-mono text-lg text-bone">+{buyerPhone}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Pass Selection
            </span>
            <p className="text-lg text-bone">
              {quantity} × {ticketName}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Authoritative Due</span>
          <strong className="font-display text-3xl text-bone">
            KES {totalKes.toLocaleString()}
          </strong>
        </div>
      </div>

      {/* Official M-Pesa Paybill Instructions */}
      <div className="border border-amber-500/30 bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-display text-bone flex items-center gap-2">
            <Smartphone className="size-5 text-amber-400" />
            Official Safaricom M-Pesa Paybill
          </h2>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Pay using the details below, then paste the confirmation message for organizer review:
          </p>
        </div>

        {!isMpesaPaymentConfigured && (
          <p
            role="alert"
            className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-300"
          >
            M-Pesa payment details have not been configured. Do not send money until the organizers
            publish verified payment instructions.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-4 bg-background/60 border border-amber-500/20 p-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono block">
              Business No.
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xl font-bold text-amber-300">
                {mpesaPaymentDetails.paybill || "Not configured"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(mpesaPaymentDetails.paybill, "Business No")}
                disabled={!isMpesaPaymentConfigured}
                className="h-7 px-2 text-xs text-amber-300 hover:bg-amber-950/40"
                title="Copy Business No"
              >
                {copiedField === "Business No" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono block">
              Account No.
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xl font-bold text-bone">
                {mpesaPaymentDetails.account || "Not configured"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(mpesaPaymentDetails.account, "Account No")}
                disabled={!isMpesaPaymentConfigured}
                className="h-7 px-2 text-xs text-bone hover:bg-card"
                title="Copy Account No"
              >
                {copiedField === "Account No" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono block">
              Account Name
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-sm font-bold text-emerald-300 truncate">
                {mpesaPaymentDetails.accountName || "Not configured"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(mpesaPaymentDetails.accountName, "Account Name")}
                disabled={!isMpesaPaymentConfigured}
                className="h-7 px-2 text-xs text-emerald-300 hover:bg-emerald-950/40"
                title="Copy Account Name"
              >
                {copiedField === "Account Name" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono block">
              Amount Due
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-lg font-bold text-amber-400">
                KES {totalKes.toLocaleString()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(String(totalKes), "Amount")}
                className="h-7 px-2 text-xs text-amber-400 hover:bg-amber-950/40"
                title="Copy Amount"
              >
                {copiedField === "Amount" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Step-by-Step Guidance */}
        <div className="border border-border/80 bg-card/40 p-3.5 text-xs font-mono text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-2 text-bone font-semibold">
            <Info className="size-4 text-amber-400" /> Quick Steps:
          </div>
          <p className="text-bone-muted">
            1. Open M-Pesa &rarr; Lipa na M-Pesa &rarr; Paybill &rarr; Business:{" "}
            <strong className="text-amber-300 font-mono">
              {mpesaPaymentDetails.paybill || "Not configured"}
            </strong>{" "}
            &rarr; Account:{" "}
            <strong className="text-bone font-mono">
              {mpesaPaymentDetails.account || "Not configured"}
            </strong>
          </p>
          <p className="text-bone-muted">
            2. Verify name reads:{" "}
            <strong className="text-emerald-400 font-mono">
              {mpesaPaymentDetails.accountName || "Not configured"}
            </strong>{" "}
            &rarr; Amount:{" "}
            <strong className="text-amber-400 font-mono">KES {totalKes.toLocaleString()}</strong>
          </p>
          <p className="text-bone-muted">
            3. Enter PIN &amp; confirm. Once you receive the confirmation SMS from M-Pesa, paste the
            message or reference code below.
          </p>
          <div className="pt-1.5 border-t border-amber-500/20 text-amber-300/90 flex items-start gap-1.5">
            <Clock3 className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              A submitted M-Pesa message is not proof of payment. The organizer must verify the
              transaction before tickets are issued.
            </span>
          </div>
        </div>
      </div>

      {/* STATE 1: IDLE / FORM ENTRY */}
      {(paymentPhase === "idle" || paymentPhase === "failed") && (
        <form onSubmit={handleSubmit} className="border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="mpesa-msg-input" className="text-bone font-medium text-base">
              Paste M-Pesa Confirmation SMS or 10-Digit Code *
            </Label>
            {extractedCode && (
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-950/30 text-amber-300 font-mono text-xs"
              >
                Detected Code: {extractedCode}
              </Badge>
            )}
          </div>

          <Textarea
            id="mpesa-msg-input"
            rows={3}
            className="bg-background border-border text-bone font-mono text-sm placeholder:text-muted-foreground focus:border-amber-400"
            placeholder="Paste the M-Pesa confirmation SMS or transaction code"
            value={rawMpesaInput}
            onChange={(e) => {
              setRawMpesaInput(e.target.value);
              if (formError) setFormError(null);
            }}
          />

          {(formError || paymentError) && (
            <div className="border border-destructive/40 bg-destructive/10 p-3 text-xs text-red-400">
              {formError || paymentError}
            </div>
          )}

          <div>
            <Label htmlFor="ticket-delivery-email" className="text-xs text-muted-foreground">
              Delivery Email Address (Ticket will be dispatched here immediately upon verification)
            </Label>
            <div className="relative mt-1">
              <Input
                id="ticket-delivery-email"
                type="email"
                className="bg-background border-border text-bone font-mono text-xs pl-8"
                value={deliveryEmail}
                onChange={(e) => setDeliveryEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
              />
              <Mail className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              type="submit"
              variant="event"
              size="xl"
              disabled={isSubmittingCode || !isMpesaPaymentConfigured}
              className="w-full sm:w-auto"
            >
              {isSubmittingCode ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" /> Verifying Code...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" /> Verify &amp; Submit Payment
                </>
              )}
            </Button>
            {onCancelReservation && (
              <Button type="button" variant="spectral" size="xl" onClick={onCancelReservation}>
                Cancel Reservation
              </Button>
            )}
          </div>
        </form>
      )}

      {/* STATE 2: PENDING APPROVAL (LIVE FIRESTORE SYNC) */}
      {(paymentPhase === "pending_approval" || paymentPhase === "review") && (
        <div className="border border-amber-500/60 bg-amber-950/20 p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              <Clock3 className="size-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/30 uppercase tracking-widest font-mono">
                  Verification in Progress
                </span>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300 font-mono text-[10px]"
                >
                  Payment message received
                </Badge>
              </div>
              <h2 className="text-2xl font-display text-bone">AWAITING ADMIN CONFIRMATION</h2>
              <div className="bg-amber-950/60 border border-amber-500/40 p-3 my-2 text-xs text-amber-200 flex items-start gap-2">
                <Clock3 className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300 uppercase tracking-wider block font-mono text-[11px]">
                    Awaiting organizer review
                  </strong>
                  <span>
                    Payment received and awaiting verification. Tickets are issued within 24 hours.
                  </span>
                </div>
              </div>
              <p className="text-sm text-bone-muted leading-relaxed">
                We received your M-Pesa transaction reference:{" "}
                <strong className="text-amber-300 font-mono font-bold">
                  {submittedCode || extractedCode || mpesaReceipt || "SUBMITTED"}
                </strong>
                . This message has been submitted for organizer review; it has not yet been
                verified.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-amber-500/30 pt-4 text-xs text-amber-200/90 font-mono">
            <RefreshCw className="size-4 animate-spin text-amber-400 shrink-0" />
            <span>
              This page checks for order-status updates periodically. Use the button below to
              refresh now.
            </span>
          </div>

          {onCheckStatusAgain && (
            <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-amber-500/20">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-500/40 text-bone hover:bg-amber-950/40"
                onClick={onCheckStatusAgain}
              >
                Refresh Approval Status
              </Button>
            </div>
          )}
        </div>
      )}

      {/* STATE 3: SUCCESS / PAID */}
      {paymentPhase === "paid" && (
        <div className="border border-emerald-500/60 bg-emerald-950/30 p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shrink-0">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="space-y-1">
              <div className="inline-block bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/40 uppercase tracking-widest font-mono">
                Organizer Approved
              </div>
              <h2 className="text-3xl font-display text-bone">PAYMENT APPROVED</h2>
              {(mpesaReceipt || submittedCode) && (
                <p className="text-sm text-emerald-300 font-mono">
                  M-Pesa Reference:{" "}
                  <strong className="text-bone font-bold">{mpesaReceipt || submittedCode}</strong>
                </p>
              )}
              <p className="text-sm text-bone-muted pt-1">
                The organizer approved this payment claim for{" "}
                <strong className="text-bone">KES {totalKes.toLocaleString()}</strong>. Your tickets
                have been issued.
              </p>
            </div>
          </div>

          <div className="border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-bone-muted space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <ShieldCheck className="size-4" /> Cryptographic Digital Pass Issued
            </div>
            <p>
              Tickets for order <strong className="text-bone font-mono">{orderNumber}</strong> are
              available to view and save.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {firstTicketCode ? (
              <Button asChild variant="event" size="xl" className="w-full sm:w-auto">
                <Link to="/ticket/$code" params={{ code: firstTicketCode }}>
                  <Ticket className="mr-2 size-5" /> View Digital Ticket &amp; QR
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-bone-muted self-center">
                Your tickets will be emailed to you once your payment is verified.
              </p>
            )}
            <Button asChild variant="spectral" size="xl">
              <Link to="/">
                Return Home <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* STATE 4: TIMED OUT / EXPIRED */}
      {paymentPhase === "timed_out" && (
        <div className="border border-amber-500/50 bg-card p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              <Clock3 className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-display text-bone">RESERVATION EXPIRED</h2>
              <p className="text-sm text-bone-muted">
                {paymentError ||
                  "The 30-minute inventory reservation window has expired. Please select your passes again to complete your booking."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild variant="event" size="xl">
              <Link to="/checkout">
                Book Again <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
