import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Mail,
  Eye,
  AlertCircle,
  ExternalLink,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { NotificationOutboxRecord } from "@/server/notification-outbox";

type NotificationChannel = "whatsapp" | "email";
type TemplateKey = "booking_confirmation" | "event_reminder_24h" | "refund_notice";

export function NotificationCenterTab() {
  const [outbox, setOutbox] = useState<NotificationOutboxRecord[]>([]);
  const [outboxError, setOutboxError] = useState("");
  const [outboxBusy, setOutboxBusy] = useState(false);
  const [activeChannel, setActiveChannel] = useState<NotificationChannel>("whatsapp");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>("booking_confirmation");

  // Preview values are local only; customer notifications use verified server records.
  const [customerName, setCustomerName] = useState("");
  const [passTier, setPassTier] = useState("");
  const [orderId, setOrderId] = useState("");

  const handleChannelChange = (channel: NotificationChannel) => {
    setActiveChannel(channel);
  };

  const fetchOutbox = useCallback(async () => {
    setOutboxBusy(true);
    setOutboxError("");
    try {
      const token = sessionStorage.getItem("rift_auth_token") || "admin_session";
      const response = await fetch("/api/admin/notifications/outbox", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.outbox)) {
        throw new Error(result.message || "Notification outbox is unavailable.");
      }
      setOutbox(result.outbox as NotificationOutboxRecord[]);
    } catch (error) {
      setOutboxError(
        error instanceof Error ? error.message : "Notification outbox is unavailable.",
      );
    } finally {
      setOutboxBusy(false);
    }
  }, []);

  const retryDueNotifications = useCallback(async () => {
    setOutboxBusy(true);
    setOutboxError("");
    try {
      const token = sessionStorage.getItem("rift_auth_token") || "admin_session";
      const response = await fetch("/api/admin/notifications/outbox/process", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Due notifications could not be processed.");
      }
      await fetchOutbox();
    } catch (error) {
      setOutboxError(
        error instanceof Error ? error.message : "Due notifications could not be processed.",
      );
      setOutboxBusy(false);
    }
  }, [fetchOutbox]);

  useEffect(() => {
    void fetchOutbox();
  }, [fetchOutbox]);

  const getPlaintextPreview = () => {
    if (selectedTemplate === "booking_confirmation") {
      return `TEST MESSAGE — Hauntings of the Rift ticket notification preview.\n\nCustomer: ${customerName || "[customer name]"}\nPass: ${passTier || "[ticket tier]"}\nOrder: ${orderId || "[order number]"}\n\nThis test does not confirm payment or issue a ticket.`;
    }
    if (selectedTemplate === "event_reminder_24h") {
      return `TEST MESSAGE — Hauntings of the Rift event reminder preview.\n\nCustomer: ${customerName || "[customer name]"}\nOrder: ${orderId || "[order number]"}\n\nConfirm the event details and ticket status before sending a real reminder.`;
    }
    return `TEST MESSAGE — Hauntings of the Rift refund notification preview.\n\nCustomer: ${customerName || "[customer name]"}\nOrder: ${orderId || "[order number]"}\n\nThis test does not confirm that a refund was processed or tickets were cancelled.`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-border bg-card/70 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl text-bone tracking-wide">
              Notification Template Preview
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Preview notification wording. Customer messages are sent only from verified order and
            ticket actions.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/60 px-3 py-1.5 border border-border">
          <span>Need bulk broadcast?</span>
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              const tab = document.querySelector('[data-tab="broadcast"]') as HTMLElement | null;
              if (tab) tab.click();
            }}
            className="text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1"
          >
            Email List &amp; Broadcast Tab &rarr;
          </a>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls & Dispatch Tester (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Channel Selector */}
          <div className="bg-card border border-border p-4 space-y-3">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              1. Preview Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleChannelChange("whatsapp")}
                className={`flex items-center justify-center gap-2 p-3 border text-xs font-mono transition-all ${
                  activeChannel === "whatsapp"
                    ? "border-green-500/80 bg-green-950/40 text-green-300 font-bold"
                    : "border-border bg-background/60 text-muted-foreground hover:text-bone"
                }`}
              >
                <Smartphone className="w-4 h-4 text-green-400" />
                WhatsApp layout
              </button>
              <button
                type="button"
                onClick={() => handleChannelChange("email")}
                className={`flex items-center justify-center gap-2 p-3 border text-xs font-mono transition-all ${
                  activeChannel === "email"
                    ? "border-amber-500/80 bg-amber-950/40 text-amber-300 font-bold"
                    : "border-border bg-background/60 text-muted-foreground hover:text-bone"
                }`}
              >
                <Mail className="w-4 h-4 text-amber-400" />
                Email layout
              </button>
            </div>
          </div>

          {/* Template Selector */}
          <div className="bg-card border border-border p-4 space-y-3">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              2. Notification Template
            </label>
            <div className="space-y-1.5">
              {[
                {
                  id: "booking_confirmation",
                  label: "Ticket Pass Confirmation",
                  desc: "Preview only; issued passes come from approved orders",
                },
                {
                  id: "event_reminder_24h",
                  label: "24-Hour Gate Reminder",
                  desc: "Arrival & venue guidelines",
                },
                {
                  id: "refund_notice",
                  label: "Cancellation & Refund Notice",
                  desc: "Pass invalidation confirmation",
                },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedTemplate(tmpl.id as TemplateKey)}
                  className={`w-full text-left p-2.5 border transition-all ${
                    selectedTemplate === tmpl.id
                      ? "border-amber-500/60 bg-amber-950/20 text-bone"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:text-bone"
                  }`}
                >
                  <div className="text-xs font-mono font-bold text-amber-400">{tmpl.label}</div>
                  <div className="text-[11px] text-muted-foreground">{tmpl.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview Values */}
          <div className="bg-card border border-border p-4 space-y-3">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              3. Preview Values
            </label>
            <p className="text-xs text-muted-foreground">
              This preview does not send messages or confirm payment, refunds, or ticket issuance.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Customer Name
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Sample name"
                  className="bg-background border-border font-mono text-xs text-bone h-8"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Order Ref
                </label>
                <Input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Sample order reference"
                  className="bg-background border-border font-mono text-xs text-bone h-8"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                Ticket Tier
              </label>
              <Input
                value={passTier}
                onChange={(e) => setPassTier(e.target.value)}
                placeholder="Sample ticket tier"
                className="bg-background border-border font-mono text-xs text-bone h-8"
              />
            </div>
          </div>

          <section className="bg-card border border-border p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-bone">Delivery Outbox</h3>
                <p className="text-xs text-muted-foreground">
                  Provider acceptance is shown separately from confirmed recipient delivery.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchOutbox()}
                  disabled={outboxBusy}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${outboxBusy ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  variant="event"
                  size="sm"
                  onClick={() => void retryDueNotifications()}
                  disabled={outboxBusy}
                >
                  Process due retries
                </Button>
              </div>
            </div>
            {outboxError && (
              <p role="alert" className="text-xs text-rose-300">
                {outboxError}
              </p>
            )}
            {outbox.length === 0 && !outboxBusy ? (
              <p className="text-xs text-muted-foreground">No notification attempts recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground uppercase border-b border-border">
                    <tr>
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 pr-3">Channel / type</th>
                      <th className="py-2 pr-3">Recipient</th>
                      <th className="py-2 pr-3">Provider status</th>
                      <th className="py-2 pr-3">Attempts / next retry</th>
                      <th className="py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {outbox.map((record) => (
                      <tr key={record.id}>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {new Date(record.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-bone">
                          {record.channel} / {record.notificationType}
                          <div className="text-[10px] uppercase text-amber-300">
                            {record.status}
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">
                          {record.recipient}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {record.providerStatus || "not attempted"}
                          {record.providerMessageId && (
                            <div className="font-mono text-[10px]">{record.providerMessageId}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {record.attempts} · {new Date(record.availableAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-rose-300">{record.lastError || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Retry processing runs when the organizer triggers it or a deployment scheduler calls
              the protected endpoint. Accepted messages are not marked delivered without provider
              delivery receipts.
            </p>
          </section>
        </div>

        {/* Right Column: Live Template Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-base text-bone">Template Preview</h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-lavender border-border">
              {activeChannel === "whatsapp" ? "WhatsApp Message Bubble" : "HTML Email Card"}
            </Badge>
          </div>

          {activeChannel === "whatsapp" ? (
            /* WhatsApp Chat Bubble Mockup */
            <div className="bg-[#0b141a] border border-[#222d34] p-6 rounded-lg shadow-xl font-sans min-h-[380px]">
              <div className="max-w-md bg-[#202c33] text-[#e9edef] rounded-lg rounded-tl-none p-4 shadow-md space-y-3">
                <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {getPlaintextPreview()}
                </div>
                <div className="text-[10px] text-gray-400 text-right font-mono">Preview only</div>
              </div>
            </div>
          ) : (
            /* Email Card Mockup */
            <div className="bg-[#111111] border border-border p-6 rounded-lg shadow-xl min-h-[380px]">
              <div className="max-w-md mx-auto bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-5 space-y-4 text-bone">
                <div className="border-b border-[#2e2e2e] pb-3 flex items-center justify-between">
                  <span className="font-display text-sm uppercase tracking-wider text-amber-400">
                    Hauntings of the Rift
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">Preview only</span>
                </div>

                <div className="space-y-2 text-xs text-bone/90">
                  <p className="font-medium">Dear {customerName || "[customer name]"},</p>
                  {selectedTemplate === "booking_confirmation" && (
                    <p className="text-muted-foreground leading-relaxed">
                      Ticket confirmation example for{" "}
                      <strong className="text-bone">{passTier || "[ticket tier]"}</strong>. This
                      preview does not confirm a purchase. Order reference:{" "}
                      <strong className="text-amber-400 font-mono">
                        {orderId || "[order number]"}
                      </strong>
                      .
                    </p>
                  )}
                  {selectedTemplate === "event_reminder_24h" && (
                    <p className="text-muted-foreground leading-relaxed">
                      Reminder example only. Confirm the event date, venue, and attendee ticket
                      status before sending.
                    </p>
                  )}
                  {selectedTemplate === "refund_notice" && (
                    <p className="text-muted-foreground leading-relaxed">
                      Refund notice example only. Verify the refund and ticket status before
                      sending. Order reference:{" "}
                      <strong className="text-amber-400 font-mono">
                        {orderId || "[order number]"}
                      </strong>
                      .
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-[#2e2e2e] text-center">
                  <div className="inline-block bg-oxblood text-bone border border-amber-500/40 text-[11px] font-mono font-bold px-4 py-2 rounded">
                    Preview only — no ticket link
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
