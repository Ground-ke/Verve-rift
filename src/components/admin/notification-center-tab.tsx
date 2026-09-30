import { useState } from "react";
import {
  MessageSquare,
  Mail,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  generateBookingConfirmationEmailHtml,
  generateEventReminder24hEmailHtml,
  generateRefundNoticeEmailHtml,
} from "@/lib/email-templates";

type NotificationChannel = "whatsapp" | "email";
type TemplateKey = "booking_confirmation" | "event_reminder_24h" | "refund_notice";

interface DispatchLog {
  id: string;
  time: string;
  channel: string;
  template: string;
  recipient: string;
  status: "sent" | "simulated" | "failed";
  details: string;
}

export function NotificationCenterTab() {
  const [activeChannel, setActiveChannel] = useState<NotificationChannel>("whatsapp");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>("booking_confirmation");

  // Test form state
  const [recipient, setRecipient] = useState("+254712345678");
  const [customerName, setCustomerName] = useState("Valued Guest");
  const [passTier, setPassTier] = useState("VIP Rift Access Pass");
  const [orderId, setOrderId] = useState("HR-2026-9042");
  const [isSending, setIsSending] = useState(false);

  // Pristine real-time dispatch logs (zero hallucinated entries)
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLog[]>([]);

  const handleChannelChange = (channel: NotificationChannel) => {
    setActiveChannel(channel);
    if (channel === "whatsapp" && recipient.includes("@")) {
      setRecipient("+254712345678");
    } else if (channel === "email" && !recipient.includes("@")) {
      setRecipient("guest@verve.co.ke");
    }
  };

  const getPlaintextPreview = () => {
    if (selectedTemplate === "booking_confirmation") {
      return `🎃 *HAUNTINGS OF THE RIFT — TICKET CONFIRMED* 🎃\n\nHey ${customerName}! Your entry pass is secured. Get ready for an unforgettable night at the Rift.\n\n🎟️ *Pass Details:* ${passTier}\n🧾 *Order ID:* ${orderId}\n\n👇 *Access Digital Pass & QR Code:*\nhttps://verve-hauntings.vercel.app/ticket/demo\n\n⚠️ *Gate Rules:* Bring valid ID. Gates open 18:00 EAT. Passes are single-entry only.`;
    }
    if (selectedTemplate === "event_reminder_24h") {
      return `⏰ *TOMORROW AT THE RIFT* ⏰\n\nHey ${customerName}, the gates open in 24 hours for Hauntings of the Rift!\n\n📍 *Venue:* The Lawns Restaurant, Nakuru\n🚪 *Gate Opens:* 16:00 EAT\n\n👇 *Have your QR code ready at the gate:*\nhttps://verve-hauntings.vercel.app/ticket/demo\n\nStrict 18+ verification at entry. Costumes encouraged!`;
    }
    return `🧾 *REFUND PROCESSED — HAUNTINGS OF THE RIFT* 🧾\n\nHi ${customerName},\n\nYour refund for Order ${orderId} has been successfully processed.\n\nAssociated passes have been marked invalidated. Reach out to support@verve.co.ke for any assistance.`;
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim()) return;

    setIsSending(true);
    try {
      if (activeChannel === "whatsapp") {
        const res = await fetch("/api/notifications/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient.trim(),
            templateType: selectedTemplate,
            customer_name: customerName,
            ticket_tier: passTier,
            order_id: orderId,
            ticket_url: "https://verve-hauntings.vercel.app/ticket/demo",
          }),
        });
        const data = await res.json();
        const success = data.success !== false;
        const newLog: DispatchLog = {
          id: `log-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          channel: "WhatsApp (Meta API)",
          template: selectedTemplate,
          recipient: recipient.trim(),
          status: success ? (data.simulated ? "simulated" : "sent") : "failed",
          details: data.message || "Delivered via Meta Cloud API",
        };
        setDispatchLogs((prev) => [newLog, ...prev]);

        if (success) {
          toast.success("WhatsApp Notification Dispatched", {
            description: `Sent to ${recipient.trim()}`,
          });
        } else {
          toast.error(data.message || "Failed to dispatch WhatsApp message");
        }
      } else {
        const res = await fetch("/api/notifications/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient.trim(),
            templateType: selectedTemplate,
            customer_name: customerName,
            ticket_tier: passTier,
            order_id: orderId,
            total_amount: "3,500",
            ticket_url: "https://verve-hauntings.vercel.app/ticket/demo",
          }),
        });
        const data = await res.json();
        const success = data.success !== false;
        const newLog: DispatchLog = {
          id: `log-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          channel: "Transactional Email",
          template: selectedTemplate,
          recipient: recipient.trim(),
          status: success ? (data.simulated ? "simulated" : "sent") : "failed",
          details: data.message || "HTML email transmitted via Gateway",
        };
        setDispatchLogs((prev) => [newLog, ...prev]);

        if (success) {
          toast.success("Transactional Email Dispatched", {
            description: `Sent to ${recipient.trim()}`,
          });
        } else {
          toast.error(data.message || "Failed to dispatch Email");
        }
      }
    } catch {
      toast.error("Network communication error during dispatch.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-border bg-card/70 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl text-bone tracking-wide">
              Notification Gateway &amp; Template Studio
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Automated customer dispatches across WhatsApp Meta Cloud API and Transactional Email.
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
              1. Delivery Channel
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
                WhatsApp (Meta API)
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
                Email (Gmail SMTP)
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
                  desc: "Instant pass & QR code link",
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

          {/* Test Dispatch Form */}
          <form onSubmit={handleSendTest} className="bg-card border border-border p-4 space-y-3">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              3. Dispatch Live Test
            </label>

            <div>
              <label className="text-[11px] font-mono text-lavender block mb-1">
                {activeChannel === "whatsapp"
                  ? "Recipient Mobile Phone (+254...)"
                  : "Recipient Email Address"}
              </label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={activeChannel === "whatsapp" ? "+254712345678" : "guest@verve.co.ke"}
                required
                className="bg-background border-border font-mono text-xs text-bone h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Customer Name
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
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
                  className="bg-background border-border font-mono text-xs text-bone h-8"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSending || !recipient.trim()}
              className="w-full bg-oxblood text-bone hover:bg-oxblood/90 border border-amber-500/30 text-xs font-mono h-9 mt-2"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Dispatching...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-2" />
                  Send Test {activeChannel === "whatsapp" ? "WhatsApp" : "Email"}
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right Column: Live Template Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-base text-bone">Live Template Output Preview</h3>
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
                <div className="text-[10px] text-gray-400 text-right font-mono flex items-center justify-end gap-1">
                  <span>12:00 EAT</span>
                  <CheckCircle2 className="w-3 h-3 text-cyan-400 inline" />
                </div>
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
                  <span className="text-[10px] font-mono text-muted-foreground">31 Oct 2026</span>
                </div>

                <div className="space-y-2 text-xs text-bone/90">
                  <p className="font-medium">Dear {customerName},</p>
                  {selectedTemplate === "booking_confirmation" && (
                    <p className="text-muted-foreground leading-relaxed">
                      Your admission pass for <strong className="text-bone">{passTier}</strong> has
                      been confirmed. Order Reference:{" "}
                      <strong className="text-amber-400 font-mono">{orderId}</strong>.
                    </p>
                  )}
                  {selectedTemplate === "event_reminder_24h" && (
                    <p className="text-muted-foreground leading-relaxed">
                      This is your 24-hour reminder that gates open tomorrow at 18:00 EAT at Top
                      Cliff Lounge, Nakuru.
                    </p>
                  )}
                  {selectedTemplate === "refund_notice" && (
                    <p className="text-muted-foreground leading-relaxed">
                      Your cancellation for Order{" "}
                      <strong className="text-amber-400 font-mono">{orderId}</strong> has been
                      processed and associated passes have been deactivated.
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-[#2e2e2e] text-center">
                  <div className="inline-block bg-oxblood text-bone border border-amber-500/40 text-[11px] font-mono font-bold px-4 py-2 rounded">
                    Access Digital Pass &amp; QR Code
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispatch Activity Audit Table */}
      <div className="bg-card border border-border p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-mono font-semibold text-bone uppercase tracking-wider">
              Live Dispatch Session Log
            </h3>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {dispatchLogs.length} Events
          </Badge>
        </div>

        {dispatchLogs.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-muted-foreground space-y-1">
            <p>No notifications dispatched yet in this session.</p>
            <p className="text-[11px] text-muted-foreground/70">
              Run a test dispatch above to monitor real-time delivery statuses.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-[10px] uppercase">
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Channel</th>
                  <th className="py-2 px-3">Template</th>
                  <th className="py-2 px-3">Recipient</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {dispatchLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-background/40 transition-colors text-[11px]">
                    <td className="py-2.5 px-3 text-muted-foreground">{log.time}</td>
                    <td className="py-2.5 px-3 font-semibold text-bone">{log.channel}</td>
                    <td className="py-2.5 px-3 text-amber-400">{log.template}</td>
                    <td className="py-2.5 px-3 text-lavender">{log.recipient}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] ${
                          log.status === "sent"
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/40"
                            : log.status === "simulated"
                              ? "bg-blue-950/60 text-blue-400 border border-blue-500/40"
                              : "bg-red-950/60 text-red-400 border border-red-500/40"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[10px] truncate max-w-xs">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
