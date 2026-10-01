import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Info,
  LockKeyhole,
  Mail,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { validateAndNormalizeKenyanPhone } from "@/lib/validation/phone";
import type { ClientOrderResponse } from "@/server/order-service";
import { VerveBackButton, VerveIcon, VerveLogo } from "@/components/brand/verve-logo";
import { toast } from "sonner";
import { useFaviconLoading } from "@/lib/dynamic-favicon";

const ticketNames = ["early-bird", "couple", "couple-pass", "group-of-four"] as const;
const searchSchema = z.object({
  ticket: z.string().optional().catch(undefined),
  orderId: z.string().optional().catch(undefined),
  token: z.string().optional().catch(undefined),
});

const mpesaPaymentDetails = {
  paybill: import.meta.env["VITE_MPESA_PAYBILL"]?.trim() || "",
  account: import.meta.env["VITE_MPESA_ACCOUNT"]?.trim() || "",
  accountName: import.meta.env["VITE_MPESA_ACCOUNT_NAME"]?.trim() || "",
};

const isMpesaPaymentConfigured = Object.values(mpesaPaymentDetails).every(Boolean);

export const Route = createFileRoute("/checkout")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Ticket Checkout — Hauntings of the Rift" },
      {
        name: "description",
        content: "Reserve your ticket for Hauntings of the Rift on 31 October in Nakuru.",
      },
      { property: "og:title", content: "Hauntings of the Rift Ticket Checkout" },
      { property: "og:description", content: "Reserve your ticket for 31 October in Nakuru." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

interface TicketOption {
  id: string;
  name: string;
  price: number;
  admitsCount: number;
  description: string;
}

const options: TicketOption[] = [
  {
    id: "early-bird",
    name: "Early Bird",
    price: 1000,
    admitsCount: 1,
    description: "Single entry pass",
  },
  {
    id: "couple-pass",
    name: "Couple Pass",
    price: 1800,
    admitsCount: 2,
    description: "Admits 2 guests together (1 QR bundle)",
  },
  {
    id: "group-of-four",
    name: "Group of Four",
    price: 3200,
    admitsCount: 4,
    description: "Admits 4 guests together (1 QR bundle)",
  },
];

function Checkout() {
  const { ticket, orderId: routeOrderId, token: routeToken } = Route.useSearch();
  const navigate = useNavigate();

  // Normalize initial selection from URL
  const initialSelected = useMemo(() => {
    if (ticket === "couple") return "couple-pass";
    if (options.some((o) => o.id === ticket)) return ticket as string;
    return "early-bird";
  }, [ticket]);

  const [selected, setSelected] = useState<string>(initialSelected);
  const [ticketOptions, setTicketOptions] = useState<TicketOption[]>(options);
  const [quantity, setQuantity] = useState<number>(1);
  const [step, setStep] = useState<"select" | "details" | "payment" | "expired">("select");

  // Dynamically synchronize live ticket options & pricing from server
  useEffect(() => {
    fetch("/api/ticket-tiers")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tiers) && data.tiers.length > 0) {
          const mapped: TicketOption[] = data.tiers
            .filter(
              (t: {
                slug: string;
                name: string;
                priceKes: number;
                admitsCount: number;
                active?: boolean;
              }) => t.active !== false,
            )
            .map((t: { slug: string; name: string; priceKes: number; admitsCount: number }) => ({
              id: t.slug,
              name: t.name,
              price: t.priceKes,
              admitsCount: t.admitsCount,
              description:
                t.admitsCount === 1
                  ? "Single entry pass"
                  : `Admits ${t.admitsCount} guests together (1 QR bundle)`,
            }));
          if (mapped.length > 0) {
            setTicketOptions(mapped);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Buyer Form State
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  // Reservation & Order State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ClientOrderResponse | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(600);

  // Manual M-Pesa Identifier & Verification State
  const [mpesaRawInput, setMpesaRawInput] = useState("");
  const [isSubmittingMpesaCode, setIsSubmittingMpesaCode] = useState(false);
  const [mpesaInputError, setMpesaInputError] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Payment Phase State
  const [paymentPhase, setPaymentPhase] = useState<
    "idle" | "submitting" | "pending_approval" | "paid" | "failed" | "timed_out" | "review"
  >("idle");
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Dynamic favicon reflects active order reservation or payment processing
  useFaviconLoading(
    isSubmitting ||
      isSubmittingMpesaCode ||
      paymentPhase === "submitting" ||
      paymentPhase === "pending_approval",
  );

  const choice = ticketOptions.find((o) => o.id === selected) || ticketOptions[0] || options[0];

  // Real-time phone validation
  const phoneValidation = useMemo(() => {
    if (!buyerPhone) return null;
    return validateAndNormalizeKenyanPhone(buyerPhone);
  }, [buyerPhone]);

  // Real-time email validation
  const emailValidation = useMemo(() => {
    if (!buyerEmail) return null;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim());
    return {
      isValid,
      error: isValid ? null : "Please enter a valid email address.",
    };
  }, [buyerEmail]);

  // Extracted M-Pesa 10-character alphanumeric transaction code
  const extractedCode = useMemo(() => {
    if (!mpesaRawInput) return null;
    const match = mpesaRawInput.match(/\b([A-Za-z0-9]{10})\b/);
    return match ? match[1].toUpperCase() : null;
  }, [mpesaRawInput]);

  // Idempotency key per checkout attempt
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(`idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  }, []);

  // Synchronize reservation countdown timer
  useEffect(() => {
    if (step !== "payment" || !activeOrder || paymentPhase === "paid") return;

    const interval = setInterval(() => {
      const targetTime = new Date(activeOrder.expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.round((targetTime - now) / 1000));

      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        setStep("expired");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step, activeOrder, paymentPhase]);

  const hasActiveOrder = Boolean(activeOrder);
  const hasSubmittedCode = Boolean(submittedCode);

  // Refresh the authoritative server order so this page can recover after reloads.
  useEffect(() => {
    const currentOrderId = activeOrder?.orderId || routeOrderId;
    const checkoutToken = activeOrder?.checkoutToken || routeToken;
    if (!currentOrderId || !checkoutToken) return;

    let isRefreshing = false;
    let disposed = false;
    const refreshOrder = async () => {
      if (isRefreshing || disposed) return;
      isRefreshing = true;
      try {
        const query = new URLSearchParams({ token: checkoutToken });
        const response = await fetch(
          `/api/orders/${encodeURIComponent(currentOrderId)}?${query.toString()}`,
        );
        if (!response.ok) {
          if (!hasActiveOrder) {
            setErrorMessage("Order not found or this checkout link is no longer valid.");
          }
          return;
        }

        const currentOrder = (await response.json()) as ClientOrderResponse;
        if (!currentOrder.success) return;
        if (!hasActiveOrder) {
          setActiveOrder(currentOrder);
          setBuyerName(currentOrder.buyerName);
          setBuyerEmail(currentOrder.buyerEmail || "");
          setStep("payment");
        }
        if (currentOrder.mpesaCode && !hasSubmittedCode) setSubmittedCode(currentOrder.mpesaCode);

        if (
          currentOrder.status === "approved" ||
          currentOrder.status === "paid" ||
          currentOrder.status === "completed"
        ) {
          const verification = await fetch("/api/pay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idempotency_key: `${currentOrder.orderId}:ticket-issue`,
              order_id: currentOrder.orderId,
              checkout_token: checkoutToken,
            }),
          });
          const result = await verification.json();
          if (
            verification.ok &&
            result.success &&
            Array.isArray(result.tickets) &&
            result.tickets.length > 0
          ) {
            setPaymentPhase("paid");
            setMpesaReceipt(currentOrder.mpesaCode || null);
          }
        } else if (currentOrder.status === "rejected") {
          setPaymentPhase("failed");
          setPaymentError(
            currentOrder.rejectionReason || "The organizer rejected this payment claim.",
          );
        } else if (currentOrder.status === "pending_approval") {
          setPaymentPhase("pending_approval");
        }
      } catch (error) {
        console.error("Could not refresh the order from the server:", error);
      } finally {
        isRefreshing = false;
      }
    };

    void refreshOrder();
    const interval = window.setInterval(() => void refreshOrder(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [
    activeOrder?.orderId,
    activeOrder?.checkoutToken,
    hasActiveOrder,
    hasSubmittedCode,
    routeOrderId,
    routeToken,
  ]);

  // Handle Order Creation / Reservation
  const handleCreateReservation = async () => {
    setNameTouched(true);
    setPhoneTouched(true);
    setEmailTouched(true);
    setErrorMessage(null);

    if (!buyerName.trim() || buyerName.trim().length < 2) {
      setErrorMessage("Please enter a valid full name (at least 2 characters).");
      return;
    }

    if (!phoneValidation?.isValid) {
      setErrorMessage(phoneValidation?.error || "Please enter a valid Kenyan phone number.");
      return;
    }

    if (!buyerEmail.trim() || !buyerEmail.includes("@") || !buyerEmail.includes(".")) {
      setErrorMessage(
        "Please enter a valid delivery email address where your tickets will be sent.",
      );
      return;
    }

    if (!isMpesaPaymentConfigured) {
      setErrorMessage(
        "Online payment is not available yet. The organizer has not configured verified M-Pesa payment details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let data: ClientOrderResponse | null = null;
      try {
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticket_type_id: choice.id,
            quantity,
            buyer_name: buyerName.trim(),
            buyer_phone: phoneValidation.normalized,
            buyer_email: buyerEmail.trim().toLowerCase(),
            idempotency_key: idempotencyKey,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const responseData = (await response.json()) as ClientOrderResponse & {
          message?: string;
        };
        if (!response.ok || !responseData.success) {
          setErrorMessage(
            responseData.message || "We couldn't reserve these tickets. Please try again.",
          );
          return;
        }
        data = responseData;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.error("Order reservation request failed:", fetchErr);
        setErrorMessage("We couldn't reach the ticket reservation service. Please try again.");
        return;
      }

      if (!data) {
        setErrorMessage("The ticket reservation service returned no order. Please try again.");
        return;
      }

      setActiveOrder(data);

      // Update URL query parameters for session recovery without local storage
      navigate({
        search: {
          ticket: choice.id,
          orderId: data.orderId,
          token: data.checkoutToken,
        },
        replace: true,
      });

      const initialTtl = Math.max(
        0,
        Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(initialTtl > 0 ? initialTtl : 600);
      setPaymentPhase("idle");
      setStep("payment");
    } catch {
      setErrorMessage(
        "Network error connecting to the ticket reservation service. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle M-Pesa Code Submission for Admin Approval
  const handleSubmitMpesaCode = async () => {
    if (!activeOrder) return;
    setMpesaInputError(null);

    const cleanInput = mpesaRawInput.trim();
    if (!cleanInput || cleanInput.length < 5) {
      setMpesaInputError(
        "Please paste your M-Pesa confirmation SMS or enter your 10-digit transaction code.",
      );
      return;
    }

    const codeToSubmit = extractedCode || cleanInput.toUpperCase();
    if (codeToSubmit.length < 6) {
      setMpesaInputError(
        "M-Pesa transaction codes consist of 10 alphanumeric characters (e.g. TLK99XW82A).",
      );
      return;
    }

    if (!buyerEmail || !buyerEmail.includes("@")) {
      setMpesaInputError(
        "Please provide a valid email address where your approved tickets will be delivered.",
      );
      return;
    }

    setIsSubmittingMpesaCode(true);

    try {
      // 1. Submit to Backend API
      const res = await fetch("/api/orders/submit-mpesa-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeOrder.checkoutToken}`,
        },
        body: JSON.stringify({
          order_id: activeOrder.orderId,
          mpesa_code: codeToSubmit,
          mpesa_message: cleanInput,
          buyer_email: buyerEmail.trim().toLowerCase(),
          token: activeOrder.checkoutToken,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMpesaInputError(data.message || "Failed to submit M-Pesa code. Please try again.");
        setIsSubmittingMpesaCode(false);
        return;
      }

      setSubmittedCode(codeToSubmit);
      setPaymentPhase("pending_approval");
      toast.success("M-Pesa code submitted. Awaiting admin approval.");
    } catch (err) {
      setMpesaInputError("Network error submitting M-Pesa code. Please try again.");
    } finally {
      setIsSubmittingMpesaCode(false);
    }
  };

  // Clipboard copy helper
  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`Copied ${field} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Cancel reservation & release inventory hold
  const handleCancelReservation = async () => {
    if (!activeOrder) {
      handleStartAgain();
      return;
    }

    setIsCancelling(true);
    try {
      await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: activeOrder.orderId,
          token: activeOrder.checkoutToken,
        }),
      });
    } catch (e) {
      console.warn("Cancel order warning:", e);
    } finally {
      setIsCancelling(false);
      handleStartAgain();
    }
  };

  // Format seconds into MM:SS
  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  const handleStartAgain = () => {
    setActiveOrder(null);
    setErrorMessage(null);
    setPaymentError(null);
    setPaymentPhase("idle");
    setMpesaReceipt(null);
    setSubmittedCode(null);
    setMpesaRawInput("");
    setMpesaInputError(null);
    setStep("select");
    navigate({
      search: {
        ticket: choice.id,
      },
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4">
          <VerveBackButton to="/" label="Event" />
          <div className="min-w-0 flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 border-r border-border pr-3">
              <VerveIcon className="size-6 text-amber-400" />
            </div>
            <div>
              <p className="truncate font-display text-xl text-bone">Hauntings of the Rift</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                Verve &amp; Co. Official Ticket Checkout
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-4 text-lavender" />
            <span className="hidden sm:inline">256-bit Encrypted</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 lg:py-12">
        {/* Step Indicator */}
        <div className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
          {[
            { id: "select", label: "Ticket" },
            { id: "details", label: "Buyer Details" },
            { id: "payment", label: "Payment (Gate 4)" },
          ].map((s, i) => {
            const stepOrder = ["select", "details", "payment", "expired"];
            const currentIndex = stepOrder.indexOf(step);
            const isCompleted = currentIndex > i;
            const isCurrent = step === s.id;

            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 ${
                  isCurrent ? "text-primary" : isCompleted ? "text-bone" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`grid size-6 place-items-center border text-xs font-mono transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground font-bold"
                      : isCompleted
                        ? "border-bone text-bone"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
                {i < 2 && <ChevronRight className="size-3 text-muted-foreground/60" />}
              </div>
            );
          })}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          {/* Main Form Body */}
          <section>
            {/* ------------------------------------------------------------- */}
            {/* STEP 1: CHOOSE TICKET & QUANTITY */}
            {/* ------------------------------------------------------------- */}
            {step === "select" && (
              <div>
                <h1 className="font-display text-4xl text-bone sm:text-5xl">Choose your ticket</h1>
                <p className="mt-2 text-muted-foreground">
                  Select your preferred tier. Ticket quantity is reserved for 10 minutes upon
                  proceeding.
                </p>

                <div className="mt-8 grid gap-4" role="radiogroup" aria-label="Ticket options">
                  {ticketOptions.map((o) => {
                    const isSelected = selected === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setSelected(o.id);
                          setQuantity(1);
                        }}
                        className={`group relative grid min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] items-center border p-5 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-oxblood/80 shadow-[0_0_24px_rgba(114,35,53,0.35)]"
                            : "border-border bg-card hover:border-lavender/40 hover:bg-card/80"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-3">
                            <strong className="font-display text-2xl text-bone">{o.name}</strong>
                            <span className="border border-border/80 bg-background/60 px-2 py-0.5 text-xs text-bone-muted uppercase tracking-wider">
                              {o.admitsCount === 1 ? "1 Guest" : `Admits ${o.admitsCount}`}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-display text-2xl text-bone sm:text-3xl">
                            KES {o.price.toLocaleString()}
                          </span>
                          <span className="block text-xs uppercase tracking-widest text-lavender">
                            {o.admitsCount > 1 ? "Per Bundle" : "Per Pass"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quantity Selector */}
                <div className="mt-8 border border-border bg-card p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <Label className="text-base text-bone font-medium">Quantity</Label>
                      <p className="text-xs text-muted-foreground">
                        {choice.admitsCount > 1
                          ? `Each bundle admits ${choice.admitsCount} guests`
                          : "Single pass per guest"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 border-border bg-background text-bone hover:border-lavender"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-10 text-center font-display text-2xl font-bold text-bone">
                        {quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 border-border bg-background text-bone hover:border-lavender"
                        onClick={() => setQuantity((q) => q + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  variant="event"
                  size="xl"
                  className="mt-8 w-full sm:w-auto"
                  onClick={() => setStep("details")}
                >
                  Continue to Buyer Details <ChevronRight className="ml-2 size-5" />
                </Button>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* STEP 2: BUYER DETAILS */}
            {/* ------------------------------------------------------------- */}
            {step === "details" && (
              <div>
                <h1 className="font-display text-4xl text-bone sm:text-5xl">Buyer details</h1>
                <p className="mt-2 text-muted-foreground">
                  Provide your official details and delivery email. Your tickets will be reserved
                  and issued to this email upon payment verification.
                </p>

                {errorMessage && (
                  <div className="mt-6 flex items-start gap-3 border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-200">
                    <AlertCircle className="size-5 shrink-0 text-destructive mt-0.5" />
                    <div>
                      <strong className="block font-bold">Unable to proceed</strong>
                      <span>{errorMessage}</span>
                    </div>
                  </div>
                )}

                <div className="mt-8 grid gap-6">
                  <div>
                    <Label htmlFor="buyer-name" className="text-bone">
                      Full Name <span className="text-primary">*</span>
                    </Label>
                    <Input
                      id="buyer-name"
                      className="mt-2 h-12 bg-card border-border text-bone placeholder:text-muted-foreground focus:border-primary"
                      placeholder="e.g. Amani Mwangi"
                      value={buyerName}
                      onChange={(e) => {
                        setBuyerName(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onBlur={() => setNameTouched(true)}
                    />
                    {nameTouched && (!buyerName.trim() || buyerName.trim().length < 2) && (
                      <p className="mt-1.5 text-xs text-red-400">
                        Please enter a valid full name (minimum 2 characters).
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="buyer-phone" className="text-bone">
                      M-Pesa Phone Number <span className="text-primary">*</span>
                    </Label>
                    <Input
                      id="buyer-phone"
                      type="tel"
                      inputMode="tel"
                      className="mt-2 h-12 bg-card border-border text-bone placeholder:text-muted-foreground focus:border-primary font-mono"
                      placeholder="07XX XXX XXX or 01XX XXX XXX"
                      value={buyerPhone}
                      onChange={(e) => {
                        setBuyerPhone(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onBlur={() => setPhoneTouched(true)}
                    />
                    {phoneValidation && phoneValidation.isValid ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                        <Check className="size-3.5" /> Canonical: {phoneValidation.formatted} (
                        {phoneValidation.operator})
                      </p>
                    ) : phoneTouched && buyerPhone ? (
                      <p className="mt-1.5 text-xs text-red-400">
                        {phoneValidation?.error ||
                          "Enter a valid Kenyan number (e.g. 0712 345 678)."}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Accepts formats: 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="buyer-email" className="text-bone flex items-center gap-1.5">
                      <Mail className="size-4 text-primary" /> Delivery Email Address{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Input
                      id="buyer-email"
                      type="email"
                      className="mt-2 h-12 bg-card border-border text-bone placeholder:text-muted-foreground focus:border-primary font-mono"
                      placeholder="e.g. amani.mwangi@example.com"
                      value={buyerEmail}
                      onChange={(e) => {
                        setBuyerEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onBlur={() => setEmailTouched(true)}
                    />
                    {emailTouched &&
                    (!buyerEmail.trim() ||
                      !buyerEmail.includes("@") ||
                      !buyerEmail.includes(".")) ? (
                      <p className="mt-1.5 text-xs text-red-400">
                        Please enter a valid email address. Your digital tickets will be sent here.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Upon M-Pesa approval by admin, your official ticket pass with QR code is
                        dispatched to this inbox.
                      </p>
                    )}
                  </div>

                  <div className="border border-lavender/30 bg-lavender/5 p-4 text-sm text-bone-muted">
                    <ShieldCheck className="mr-2 inline size-4 text-lavender" />
                    Upon clicking reserve, your {quantity} {choice.name}{" "}
                    {choice.admitsCount > 1 ? "bundle" : "pass"} will be locked in the inventory
                    engine for exactly 10 minutes.
                  </div>

                  {/* DATA PROTECTION & TERMS CONSENT */}
                  <div className="border border-border/80 bg-background/50 p-3.5 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300 font-semibold uppercase tracking-wider">
                      <LockKeyhole className="size-3.5 text-amber-400" />
                      Data Protection &amp; Terms Agreement
                    </div>
                    <p className="text-bone-muted leading-relaxed">
                      By proceeding with this reservation, you confirm you are 18+ and agree to the{" "}
                      <Link
                        to="/terms"
                        target="_blank"
                        className="text-amber-400 hover:text-amber-300 underline font-medium"
                      >
                        Terms of Entry
                      </Link>{" "}
                      and{" "}
                      <Link
                        to="/privacy"
                        target="_blank"
                        className="text-amber-400 hover:text-amber-300 underline font-medium"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Under KDPA 2019, your details are used solely to issue cryptographic admission
                      passes and reconcile Safaricom M-Pesa. Data is never sold.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Button
                      variant="event"
                      size="xl"
                      className="w-full sm:w-auto"
                      disabled={isSubmitting}
                      onClick={handleCreateReservation}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="mr-2 size-4 animate-spin" />
                          Locking Inventory...
                        </>
                      ) : (
                        <>
                          Reserve & Review Payment <ChevronRight className="ml-2 size-5" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xl"
                      className="text-bone hover:bg-card"
                      onClick={() => setStep("select")}
                      disabled={isSubmitting}
                    >
                      Change Ticket
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* STEP 3: PAYMENT / MANUAL M-PESA VERIFICATION & APPROVAL FLOW */}
            {/* ------------------------------------------------------------- */}
            {step === "payment" && activeOrder && (
              <div className="space-y-6">
                {/* Header Status */}
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-12 place-items-center border ${
                      paymentPhase === "paid"
                        ? "bg-emerald-950 text-emerald-400 border-emerald-500/60"
                        : paymentPhase === "pending_approval"
                          ? "bg-amber-950/60 text-amber-400 border-amber-500/60"
                          : "bg-oxblood text-lavender border-lavender/40"
                    }`}
                  >
                    {paymentPhase === "paid" ? (
                      <CheckCircle2 className="size-6" />
                    ) : paymentPhase === "pending_approval" ? (
                      <Clock3 className="size-6 animate-pulse" />
                    ) : (
                      <Smartphone className="size-6" />
                    )}
                  </div>
                  <div>
                    <h1 className="font-display text-3xl text-bone sm:text-4xl">
                      {paymentPhase === "paid"
                        ? "Payment Verified & Tickets Sent"
                        : paymentPhase === "pending_approval"
                          ? "Awaiting Admin Verification"
                          : "M-Pesa Payment Verification"}
                    </h1>
                    <p
                      className={`text-xs uppercase tracking-widest font-mono ${
                        paymentPhase === "paid"
                          ? "text-emerald-400 font-bold"
                          : paymentPhase === "pending_approval"
                            ? "text-amber-400 font-bold"
                            : "text-lavender"
                      }`}
                    >
                      Status:{" "}
                      {paymentPhase === "paid"
                        ? "APPROVED & DISPATCHED"
                        : paymentPhase === "pending_approval"
                          ? "IN ADMIN APPROVAL QUEUE"
                          : "AWAITING M-PESA CONFIRMATION CODE"}
                    </p>
                  </div>
                </div>

                {/* Reservation Countdown Banner (Hidden when Paid) */}
                {paymentPhase !== "paid" && (
                  <div className="flex flex-col justify-between gap-4 border border-lavender/40 bg-card p-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <Clock3 className="size-6 text-lavender animate-pulse" />
                      <div>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          Inventory Hold Timer
                        </p>
                        <p className="text-sm text-bone">
                          Tickets are reserved exclusively for you while awaiting payment
                          verification.
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-3xl font-bold text-lavender">
                        {formatCountdown(secondsRemaining)}
                      </span>
                      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                        Time Remaining
                      </span>
                    </div>
                  </div>
                )}

                {/* Authoritative Order Details Card */}
                <div className="border border-border bg-card p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        Order Reference
                      </span>
                      <p className="font-mono text-lg font-bold text-bone">
                        {activeOrder.orderNumber}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        Buyer Name
                      </span>
                      <p className="text-lg text-bone">{activeOrder.buyerName}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        M-Pesa Phone
                      </span>
                      <p className="font-mono text-lg text-bone">+{activeOrder.buyerPhone}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        Delivery Email
                      </span>
                      <p className="font-mono text-lg text-bone truncate">
                        {buyerEmail || activeOrder.buyerEmail || "Not specified"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        Total Admissions
                      </span>
                      <p className="text-lg text-bone">
                        {activeOrder.quantity * activeOrder.admitsCount} Guests (
                        {activeOrder.quantity} {activeOrder.ticketName})
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border pt-4 flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Amount Payable</span>
                    <strong className="font-display text-3xl text-amber-400">
                      KES {activeOrder.totalKes.toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* PAYMENT STATE 1: IDLE / PASTE M-PESA CODE */}
                {paymentPhase === "idle" && (
                  <div className="border border-border bg-card p-6 space-y-6">
                    <div>
                      <h2 className="text-xl font-display text-bone flex items-center gap-2">
                        <Smartphone className="size-5 text-amber-400" />
                        1. Pay via Safaricom Lipa na M-Pesa
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Use the Paybill details below to transfer the exact ticket amount, then
                        paste your M-Pesa SMS or transaction code below for organizer review.
                      </p>
                    </div>

                    {/* Lipa na M-Pesa Details Box */}
                    <div className="grid gap-3 sm:grid-cols-4 bg-background/60 border border-amber-500/30 p-4">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono block">
                          Business No.
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-mono text-xl font-bold text-amber-300">
                            {mpesaPaymentDetails.paybill}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(mpesaPaymentDetails.paybill, "Business No")}
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
                            {mpesaPaymentDetails.account}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(mpesaPaymentDetails.account, "Account No")}
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
                          <span className="font-mono text-base font-bold text-emerald-300 truncate">
                            {mpesaPaymentDetails.accountName}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleCopy(mpesaPaymentDetails.accountName, "Account Name")
                            }
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
                          <span className="font-mono text-xl font-bold text-amber-400">
                            KES {activeOrder.totalKes.toLocaleString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(String(activeOrder.totalKes), "Amount")}
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

                    {/* Step-by-Step Payment Instructions */}
                    <div className="border border-border/80 bg-card/40 p-4 text-xs font-mono text-muted-foreground space-y-2">
                      <div className="flex items-center gap-2 text-bone font-semibold">
                        <Info className="size-4 text-amber-400" /> M-Pesa Payment Instructions:
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-bone-muted pl-1">
                        <li>
                          Open M-Pesa on your phone &rarr; Select{" "}
                          <strong className="text-bone">Lipa na M-Pesa</strong> &rarr;{" "}
                          <strong className="text-bone">Paybill</strong>
                        </li>
                        <li>
                          Enter Business Number:{" "}
                          <strong className="text-amber-300 font-mono">
                            {mpesaPaymentDetails.paybill}
                          </strong>
                        </li>
                        <li>
                          Enter Account Number:{" "}
                          <strong className="text-bone font-mono">
                            {mpesaPaymentDetails.account}
                          </strong>
                        </li>
                        <li>
                          Confirm payment name displays as:{" "}
                          <strong className="text-emerald-400 font-mono">
                            {mpesaPaymentDetails.accountName}
                          </strong>
                        </li>
                        <li>
                          Enter Amount:{" "}
                          <strong className="text-amber-400 font-mono">
                            KES {activeOrder.totalKes.toLocaleString()}
                          </strong>
                        </li>
                        <li>Enter your M-Pesa PIN and confirm the transaction</li>
                        <li>Copy the M-Pesa SMS confirmation or 10-digit code and paste below</li>
                      </ol>
                      <div className="pt-2 border-t border-amber-500/20 text-amber-300 flex items-start gap-2">
                        <Clock3 className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Manual payment review.</strong> Submitting an M-Pesa message does
                          not confirm payment; tickets are issued only after the organizer verifies
                          the transaction.
                        </span>
                      </div>
                    </div>

                    {/* Code Entry Input Form */}
                    <div className="border-t border-border pt-6 space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="mpesa-code" className="text-bone font-medium">
                            2. Paste M-Pesa Confirmation SMS or 10-Digit Code *
                          </Label>
                          {extractedCode && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 bg-amber-950/30 text-amber-300 font-mono text-[11px]"
                            >
                              Identified Code: {extractedCode}
                            </Badge>
                          )}
                        </div>
                        <Textarea
                          id="mpesa-code"
                          rows={3}
                          className="mt-2 bg-background border-border text-bone font-mono text-sm placeholder:text-muted-foreground focus:border-amber-400"
                          placeholder="e.g. TLK99XW82A or paste the entire SMS: TLK99XW82A Confirmed. Ksh1,000 sent to Verve & Co. on 31/10/26..."
                          value={mpesaRawInput}
                          onChange={(e) => {
                            setMpesaRawInput(e.target.value);
                            if (mpesaInputError) setMpesaInputError(null);
                          }}
                        />
                        {mpesaInputError && (
                          <p className="mt-1.5 text-xs text-red-400">{mpesaInputError}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="confirm-email" className="text-xs text-muted-foreground">
                          Delivery Email (Ticket will be dispatched here immediately after approval)
                        </Label>
                        <div className="relative mt-1">
                          <Input
                            id="confirm-email"
                            type="email"
                            className="bg-background border-border text-bone font-mono text-xs pl-8"
                            value={buyerEmail}
                            onChange={(e) => setBuyerEmail(e.target.value)}
                            placeholder="your.email@example.com"
                          />
                          <Mail className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <Button
                          variant="event"
                          size="xl"
                          onClick={handleSubmitMpesaCode}
                          disabled={isSubmittingMpesaCode}
                          className="w-full sm:w-auto"
                        >
                          {isSubmittingMpesaCode ? (
                            <>
                              <RefreshCw className="mr-2 size-4 animate-spin" /> Submitting for
                              Verification...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 size-4" /> Submit M-Pesa Code for Verification
                            </>
                          )}
                        </Button>
                        <Button
                          variant="spectral"
                          size="xl"
                          onClick={handleCancelReservation}
                          disabled={isCancelling}
                        >
                          {isCancelling ? "Releasing..." : "Cancel Reservation"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAYMENT STATE 2: PENDING APPROVAL (IN ADMIN QUEUE) */}
                {paymentPhase === "pending_approval" && (
                  <div className="border border-amber-500/60 bg-amber-950/20 p-6 sm:p-8 space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="grid size-12 place-items-center bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                        <Clock3 className="size-6 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-display text-bone tracking-wide">
                            VERIFICATION IN PROGRESS
                          </h2>
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-300 font-mono text-xs"
                          >
                            Organizer review required
                          </Badge>
                        </div>
                        <p className="text-sm text-bone-muted leading-relaxed">
                          We have received your M-Pesa transaction reference:{" "}
                          <strong className="text-amber-300 font-mono font-bold">
                            {submittedCode || extractedCode || "SUBMITTED"}
                          </strong>
                          . It is currently being reviewed by the event administrator.
                        </p>
                        <div className="bg-amber-950/80 border border-amber-500/50 p-2.5 my-1.5 text-xs text-amber-200 flex items-start gap-2">
                          <Clock3 className="size-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-amber-300 font-mono uppercase tracking-wider block text-[11px]">
                              Awaiting organizer review
                            </strong>
                            <span>
                              A submitted M-Pesa message is not confirmation of payment. A ticket is
                              issued only after the organizer approves the payment.
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-amber-300 font-mono pt-1 flex items-center gap-1.5">
                          <Mail className="size-3.5" />
                          Tickets will appear here after the organizer approves the payment.
                        </p>
                      </div>
                    </div>

                    <div className="border border-amber-500/30 bg-card/80 p-4 text-xs font-mono text-muted-foreground space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-semibold">
                        <RefreshCw className="size-4 animate-spin text-amber-400 shrink-0" />
                        Checking order status
                      </div>
                      <p>
                        This page checks for status updates periodically. You can also refresh the
                        status manually.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-amber-500/20">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-amber-500/40 text-bone hover:bg-amber-950/40"
                        onClick={() => setPaymentPhase("idle")}
                      >
                        Edit or Re-enter M-Pesa Code
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-bone"
                        onClick={handleCancelReservation}
                        disabled={isCancelling}
                      >
                        Cancel Reservation
                      </Button>
                    </div>
                  </div>
                )}

                {/* PAYMENT STATE 3: SUCCESS / APPROVED & TICKETS ISSUED */}
                {paymentPhase === "paid" && (
                  <div className="border border-emerald-500/60 bg-emerald-950/30 p-6 sm:p-8 space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="grid size-12 place-items-center bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shrink-0">
                        <CheckCircle2 className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-3xl font-display text-bone">
                          PAYMENT APPROVED &amp; TICKETS ISSUED
                        </h2>
                        {(mpesaReceipt || submittedCode) && (
                          <p className="text-sm text-emerald-300 font-mono">
                            M-Pesa Reference:{" "}
                            <strong className="text-bone font-bold">
                              {mpesaReceipt || submittedCode}
                            </strong>
                          </p>
                        )}
                        <p className="text-sm text-bone-muted pt-1">
                          Your payment of{" "}
                          <strong className="text-bone">
                            KES {activeOrder.totalKes.toLocaleString()}
                          </strong>{" "}
                          has been approved by the organizer. Tickets have been issued for this
                          order.
                        </p>
                      </div>
                    </div>

                    <div className="border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-bone-muted space-y-2">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                        <Ticket className="size-4" /> Tickets Available
                      </div>
                      <p>
                        Open the order link to view and save your issued tickets. Keep that link
                        available for access.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
                      <Button asChild variant="event" size="xl" className="w-full sm:w-auto">
                        <Link
                          to="/pay"
                          search={{
                            orderId: activeOrder.orderId,
                            token: activeOrder.checkoutToken,
                          }}
                        >
                          <Ticket className="mr-2 size-5" /> View Digital Ticket Pass
                        </Link>
                      </Button>
                      <Button asChild variant="spectral" size="xl">
                        <Link to="/">
                          <ArrowLeft className="mr-2 size-4" /> Return to Event
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}

                {/* PAYMENT STATE 4: FAILED / DECLINED */}
                {paymentPhase === "failed" && (
                  <div className="border border-destructive/60 bg-destructive/10 p-6 sm:p-8 space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="grid size-12 place-items-center bg-destructive/20 text-destructive border border-destructive/50 shrink-0">
                        <XCircle className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-2xl font-display text-bone">
                          VERIFICATION NOT APPROVED
                        </h2>
                        <p className="text-sm text-destructive-foreground">
                          {paymentError ||
                            "The transaction code could not be verified by the admin."}
                        </p>
                        <p className="text-xs text-bone-muted pt-1">
                          Your reservation remains active for the time remaining on the timer.
                          Please verify your M-Pesa transaction code and retry.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button
                        variant="event"
                        size="xl"
                        onClick={() => {
                          setPaymentPhase("idle");
                          setPaymentError(null);
                        }}
                        className="w-full sm:w-auto"
                      >
                        <RotateCcw className="mr-2 size-4" /> Re-enter M-Pesa Code
                      </Button>
                      <Button
                        variant="spectral"
                        size="xl"
                        onClick={handleCancelReservation}
                        disabled={isCancelling}
                      >
                        Cancel Reservation
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* STEP 4: RESERVATION EXPIRED */}
            {/* ------------------------------------------------------------- */}
            {step === "expired" && (
              <div className="border border-destructive/40 bg-card p-8 text-center sm:p-12">
                <div className="mx-auto grid size-16 place-items-center bg-destructive/20 text-destructive border border-destructive/40">
                  <Clock3 className="size-8" />
                </div>
                <h1 className="mt-6 font-display text-4xl text-bone sm:text-5xl">
                  Your reservation expired
                </h1>
                <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
                  The 10-minute hold on your selected tickets has elapsed. Reserved inventory has
                  been automatically returned to the pool to allow other attendees to purchase.
                </p>
                <div className="mt-8">
                  <Button variant="event" size="xl" onClick={handleStartAgain}>
                    <RotateCcw className="mr-2 size-4" /> Start Again
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* --------------------------------------------------------------- */}
          {/* Order Summary Sidebar */}
          {/* --------------------------------------------------------------- */}
          <aside className="h-fit border border-border bg-card p-6 lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase tracking-widest text-lavender">
              Order summary
            </p>
            <h2 className="mt-4 font-display text-3xl text-bone">{choice.name}</h2>
            <p className="text-sm text-bone-muted">
              {choice.admitsCount === 1
                ? "1 Guest pass"
                : `Bundle for ${choice.admitsCount} guests`}
            </p>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground border-y border-border/80 py-3">
              <p>31 October 2026 · 4 PM till late</p>
              <p>The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru</p>
              <p>Age: 18+</p>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Unit Price</span>
                <span className="font-mono text-bone">KES {choice.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Quantity</span>
                <span className="font-mono text-bone">× {quantity}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Admissions</span>
                <span className="font-mono text-bone">{quantity * choice.admitsCount} Guests</span>
              </div>
            </div>

            <div className="mt-6 flex justify-between border-t border-border pt-4 items-baseline">
              <div>
                <span className="text-xs uppercase tracking-widest text-lavender block">
                  Total Amount
                </span>
                <span className="text-xs text-muted-foreground">Inclusive of VAT</span>
              </div>
              <strong className="font-display text-3xl text-bone">
                KES {(choice.price * quantity).toLocaleString()}
              </strong>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border/80 bg-card/30 px-4 py-6 text-center text-xs font-mono text-muted-foreground mt-12">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-4">
          <p>&copy; 2026 Verve &amp; Co. · Official Ticketing Portal</p>
          <div className="flex items-center gap-4 text-lavender">
            <Link to="/terms" className="hover:text-bone underline">
              Terms &amp; Conditions
            </Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-bone underline">
              Privacy Policy
            </Link>
            <span>·</span>
            <Link to="/recover" className="hover:text-bone underline">
              Ticket Recovery
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
