import React, { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PaymentStatusCard, PaymentPhase } from "@/components/event/payment-status-card";
import {
  VerveBackButton,
  VervePresenterBadge,
  VerveErrorState,
} from "@/components/brand/verve-logo";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFaviconLoading } from "@/lib/dynamic-favicon";

const paySearchSchema = z.object({
  orderId: z.string().optional(),
  token: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const Route = createFileRoute("/pay")({
  validateSearch: (search) => paySearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Complete Payment — Hauntings of the Rift | Verve & Co." },
      {
        name: "description",
        content:
          "Authoritative M-Pesa checkout and instant cryptographic ticket issuance for Hauntings of the Rift.",
      },
      { property: "og:title", content: "Payment & Confirmation — Hauntings of the Rift" },
      { property: "og:description", content: "Complete your admission payment securely." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PayRouteComponent,
});

interface OrderData {
  orderId: string;
  orderNumber: string;
  ticketName: string;
  quantity: number;
  admitsCount: number;
  totalKes: number;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  status: string;
  expiresAt: string;
  checkoutToken: string;
  mpesaCode?: string;
  rejectionReason?: string;
}

function PayRouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);
  const [firstTicketCode, setFirstTicketCode] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | undefined>(undefined);

  // Dynamic favicon indicates active order lookup or M-Pesa verification
  useFaviconLoading(
    loading || paymentPhase === "submitting" || paymentPhase === "pending_approval",
  );

  // Stable idempotency key initialization — preserved across all retries in this session

  // Expiration countdown timer
  useEffect(() => {
    if (!order || !order.expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.round((new Date(order.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);
      if (remaining <= 0 && paymentPhase !== "paid") {
        setPaymentPhase("failed");
        setPaymentError("Your 10-minute reservation has expired. Please select passes again.");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order, paymentPhase]);

  // Authoritatively issue and verify payment via idempotency gate
  const handleVerifyCompletedPayment = useCallback(
    async (orderId: string, token: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/pay/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: `${orderId}:ticket-issue`,
            order_id: orderId,
            checkout_token: token,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.tickets) || data.tickets.length === 0) {
          return false;
        }
        setFirstTicketCode(data.tickets[0].ticketNumber);
        return true;
      } catch (e) {
        console.warn("Could not verify tickets:", e);
        return false;
      }
    },
    [],
  );

  // Fetch authoritative order details
  useEffect(() => {
    async function loadOrder() {
      if (!search.orderId || !search.token) {
        setLoading(false);
        setErrorMessage("No active order or authorization token provided in link.");
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/orders/${search.orderId}?token=${search.token}`, {
          headers: {
            Authorization: `Bearer ${search.token}`,
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(
            errData.message || "Order reservation not found or authorization expired.",
          );
          setLoading(false);
          return;
        }

        const data = (await res.json()) as OrderData;
        setOrder(data);

        if (data.status === "paid" || data.status === "approved" || data.status === "completed") {
          const verified = await handleVerifyCompletedPayment(data.orderId, data.checkoutToken);
          if (verified) {
            setPaymentPhase("paid");
          } else {
            setPaymentPhase("pending_approval");
            setPaymentError("Payment is approved, but ticket issuance could not be confirmed yet.");
          }
        }
      } catch {
        setErrorMessage("Network error fetching order details. Please try refreshing.");
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [search.orderId, search.token, handleVerifyCompletedPayment]);

  // Poll the authoritative order API; browser-side Firebase mirrors are not authoritative.
  useEffect(() => {
    if (!search.orderId || !search.token) return;
    let disposed = false;
    let refreshing = false;

    const refreshOrder = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        const query = new URLSearchParams({ token: search.token! });
        const response = await fetch(
          `/api/orders/${encodeURIComponent(search.orderId!)}?${query.toString()}`,
        );
        if (!response.ok) {
          console.error("Could not refresh order status:", response.status);
          return;
        }

        const currentOrder = (await response.json()) as OrderData;
        if (disposed) return;
        setOrder(currentOrder);
        if (currentOrder.mpesaCode) setMpesaReceipt(currentOrder.mpesaCode);

        if (
          currentOrder.status === "approved" ||
          currentOrder.status === "paid" ||
          currentOrder.status === "completed"
        ) {
          const issued = await handleVerifyCompletedPayment(
            currentOrder.orderId,
            search.token!,
          );
          if (issued) {
            setPaymentPhase("paid");
            setPaymentError(null);
          } else {
            setPaymentPhase("pending_approval");
            setPaymentError("Payment was approved, but ticket issuance is not confirmed yet.");
          }
        } else if (currentOrder.status === "pending_approval") {
          setPaymentPhase("pending_approval");
        } else if (currentOrder.status === "rejected") {
          setPaymentPhase("failed");
          setPaymentError(currentOrder.rejectionReason || "The organizer rejected this payment claim.");
        }
      } catch (error) {
        console.error("Could not refresh order status:", error);
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => void refreshOrder(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [search.orderId, search.token, handleVerifyCompletedPayment]);

  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Submit M-Pesa Confirmation SMS / 10-Digit Code
  const handleSubmitMpesaCode = async (code: string, rawMessage?: string, email?: string) => {
    if (!order) return;
    setIsSubmittingCode(true);
    setPaymentError(null);

    const buyerEmail = (email || order.buyerEmail || "").trim().toLowerCase();

    try {
      // 1. Submit to Backend API
      const res = await fetch("/api/orders/submit-mpesa-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${order.checkoutToken}`,
        },
        body: JSON.stringify({
          order_id: order.orderId,
          mpesa_code: code,
          mpesa_message: rawMessage || code,
          buyer_email: buyerEmail,
          token: order.checkoutToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPaymentError(
          data.message || "Failed to submit M-Pesa code. Please check and try again.",
        );
        setIsSubmittingCode(false);
        return;
      }

      setMpesaReceipt(code);
      setPaymentPhase("pending_approval");
    } catch {
      setPaymentError("Network error submitting M-Pesa code. Please try again.");
    } finally {
      setIsSubmittingCode(false);
    }
  };

  // Manual Status Check
  const handleCheckStatusAgain = async () => {
    if (!order) return;
    try {
      const res = await fetch(`/api/orders/${order.orderId}?token=${order.checkoutToken}`, {
        headers: { Authorization: `Bearer ${order.checkoutToken}` },
      });
      const data = await res.json();
      if (res.ok && ["paid", "approved", "completed"].includes(data.status)) {
        const verified = await handleVerifyCompletedPayment(
          order.orderId,
          order.checkoutToken,
          data.mpesaCode,
        );
        if (verified) {
          setPaymentPhase("paid");
          setMpesaReceipt(data.mpesaCode || null);
        }
      }
    } catch {
      // noop
    }
  };

  // Cancel reservation
  const handleCancelReservation = async () => {
    if (!order) return;
    try {
      await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.orderId,
          token: order.checkoutToken,
        }),
      });
    } catch {
      // noop
    } finally {
      navigate({ to: "/checkout" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="size-8 animate-spin text-oxblood-light mx-auto" />
          <p className="font-display text-lg text-bone">Loading reservation status...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !order) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="mb-6">
            <VerveBackButton to="/checkout" label="Return to Ticket Selection" />
          </div>
          <VerveErrorState
            code="400"
            title="Reservation Unavailable"
            description={
              errorMessage || "We could not find an active reservation for this session."
            }
            actionLabel="Select Tickets"
            actionTo="/checkout"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-bone/15 pb-4 mb-8">
          <Button asChild variant="ghost" size="sm" className="text-bone-muted hover:text-bone">
            <Link to="/checkout">
              <ArrowLeft className="mr-2 size-4" /> Change Selection
            </Link>
          </Button>
          <VervePresenterBadge />
        </div>

        {/* Page Title */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-oxblood-light">
            Secure Payment Gateway
          </p>
          <h1 className="text-3xl font-display text-bone sm:text-4xl mt-1">CONFIRM &amp; PAY</h1>
          <p className="text-sm text-bone-muted mt-1">
            Complete your M-Pesa transaction to receive your cryptographic admission pass.
          </p>
        </div>

        {/* Payment Component Card */}
        <PaymentStatusCard
          orderId={order.orderId}
          orderNumber={order.orderNumber}
          buyerName={order.buyerName}
          buyerPhone={order.buyerPhone}
          buyerEmail={order.buyerEmail}
          ticketName={order.ticketName}
          quantity={order.quantity}
          totalKes={order.totalKes}
          paymentPhase={paymentPhase}
          paymentError={paymentError}
          mpesaReceipt={mpesaReceipt}
          firstTicketCode={firstTicketCode}
          secondsRemaining={secondsRemaining}
          isSubmittingCode={isSubmittingCode}
          onSubmitMpesaCode={handleSubmitMpesaCode}
          onCheckStatusAgain={handleCheckStatusAgain}
          onCancelReservation={handleCancelReservation}
        />
      </div>
    </div>
  );
}
