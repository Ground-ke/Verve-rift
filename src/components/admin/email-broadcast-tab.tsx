import React, { useState, useEffect } from "react";
import {
  Mail,
  Send,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Filter,
  Sparkles,
  Ticket,
  Eye,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface BuyerAudienceMember {
  email: string;
  name: string;
  phone: string;
  ticketTier: string;
  orderCount: number;
  totalPaidKes: number;
  status: string;
  latestOrderDate: string;
}

interface AudienceSummary {
  totalPurchasers: number;
  totalTicketsIssued: number;
  checkedInCount: number;
}

export function AudienceBroadcastTab() {
  const [audience, setAudience] = useState<BuyerAudienceMember[]>([]);
  const [summary, setSummary] = useState<AudienceSummary>({
    totalPurchasers: 0,
    totalTicketsIssued: 0,
    checkedInCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  // Broadcast Form State
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [targetFilter, setTargetFilter] = useState("all");
  const [testEmail, setTestEmail] = useState("verve.n.co.ke@gmail.com");

  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Load audience from backend
  const fetchAudience = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/audience");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAudience(data.audience || []);
          if (data.summary) setSummary(data.summary);
        }
      }
    } catch (err) {
      console.warn("Failed fetching audience list:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudience();
  }, []);

  // Quick Preset Templates
  const handleLoadTemplate = (type: "lineup" | "logistics" | "promo") => {
    if (type === "lineup") {
      setSubject("Lineup Reveal & Headliners: Hauntings of the Rift 2026");
      setHeadline("The Darkness Unveiled — Official Artist Lineup");
      setMessage(
        "Greetings,\n\nThe veil is thinning. We are beyond excited to unveil the official sound architects performing at Hauntings of the Rift on Saturday, 31 October 2026 at Top Cliff Lodge, Nakuru.\n\nPrepare for unprecedented sound, immersive kinetic lasers, and spine-chilling electronic rhythms running from 4:00 PM till dawn.\n\nKeep your QR code passes saved to your phone or offline storage.",
      );
      setCtaText("View Stage Timetable");
      setCtaUrl("https://verve-hauntings.vercel.app");
    } else if (type === "logistics") {
      setSubject("Important Entry Instructions & Parking Guide — 31 October");
      setHeadline("Gates Open at 4:00 PM • Fast-Track Verification");
      setMessage(
        "Important Gate & Security Details for Saturday, 31 October:\n\n1. Location: Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru.\n2. Entry Requirement: Physical or Digital Pass QR code with Valid Original ID (Strictly 18+).\n3. Dress Code: Wickedly Fabulous.\n4. Arrive early to ensure swift gate check-in and beat the entry queue.",
      );
      setCtaText("Open My Pass");
      setCtaUrl("https://verve-hauntings.vercel.app/recover");
    } else if (type === "promo") {
      setSubject("Flash Ticket Release & Exclusive Friend Bundles");
      setHeadline("Group of Four Flash Release (Limited Release)");
      setMessage(
        "Hello,\n\nDue to immense demand, we have unlocked additional Group of Four squad passes admitting 4 guests together for KES 3,200.\n\nIf you have friends planning to join you at the Rift, share this exclusive invitation before allocation sells out.",
      );
      setCtaText("Secure Squad Pass");
      setCtaUrl("https://verve-hauntings.vercel.app/checkout");
    }
  };

  // Dispatch Test Email
  const handleSendTest = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Missing content", { description: "Please enter a subject and message body." });
      return;
    }
    if (!testEmail.trim()) {
      toast.error("Missing recipient", { description: "Please enter a test email address." });
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch("/api/admin/audience/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          headline: headline || subject,
          message,
          ctaText,
          ctaUrl,
          testRecipient: testEmail.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Test preview dispatched!", {
          description: `Delivered test email to ${testEmail} via Gmail SMTP.`,
        });
      } else {
        toast.error("Failed sending test", {
          description: data.error || "Please check your SMTP / Gmail configuration.",
        });
      }
    } catch (err) {
      toast.error("Error sending test email", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Dispatch Full Live Broadcast
  const handleSendLiveBroadcast = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }

    const targetedRecipients = getFilteredAudience();
    if (targetedRecipients.length === 0) {
      toast.error("No recipients found", {
        description: "Your selected audience filter currently has 0 recipients.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to send this broadcast to ${targetedRecipients.length} ticket buyer(s)?`,
    );
    if (!confirmed) return;

    setIsSendingBroadcast(true);
    try {
      const res = await fetch("/api/admin/audience/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          headline: headline || subject,
          message,
          ctaText,
          ctaUrl,
          targetFilter,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Broadcast dispatched successfully!", {
          description: `Dispatched to ${data.dispatchedCount} recipient(s).`,
        });
        setSubject("");
        setHeadline("");
        setMessage("");
        setCtaText("");
        setCtaUrl("");
      } else {
        toast.error("Broadcast failed", {
          description: data.error || "Check email credentials and retry.",
        });
      }
    } catch (err) {
      toast.error("Broadcast dispatch failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  // Filter Audience List
  const getFilteredAudience = () => {
    return audience.filter((b) => {
      const matchesSearch =
        b.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.phone.includes(searchTerm);

      let matchesTier = true;
      if (tierFilter !== "all") {
        matchesTier = (b.ticketTier || "").toLowerCase().includes(tierFilter.toLowerCase());
      }

      return matchesSearch && matchesTier;
    });
  };

  const filteredAudience = getFilteredAudience();

  return (
    <div className="space-y-6">
      {/* Top Header Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-mono uppercase tracking-wider">Unique Ticket Buyers</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl text-bone">
            {summary.totalPurchasers || audience.length} Buyers
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            Synced from M-Pesa orders &amp; ticket registry
          </p>
        </div>

        <div className="border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-mono uppercase tracking-wider">
              Passes In Circulation
            </span>
            <Ticket className="w-4 h-4 text-lavender" />
          </div>
          <div className="font-display text-2xl text-bone">{summary.totalTicketsIssued} Issued</div>
          <p className="text-[11px] text-muted-foreground font-mono">
            Single, Couple &amp; Squad Bundles
          </p>
        </div>

        <div className="border border-emerald-500/30 bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-mono uppercase tracking-wider">Email Protocol</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-xl text-emerald-300">Gmail SMTP (Official)</div>
          <p className="text-[11px] text-muted-foreground font-mono">verve.n.co.ke@gmail.com</p>
        </div>
      </div>

      {/* Main Grid: Composer on Left, Audience Roster on Right */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* COMPOSER COLUMN (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h2 className="font-display text-lg text-bone flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-400" />
                  Compose Broadcast Announcement
                </h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Send updates, gate logistics, or artist lineup reveals to ticket buyers
                </p>
              </div>

              {/* Template Presets */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate("lineup")}
                  className="h-7 text-[11px] font-mono border-border"
                >
                  <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
                  Lineup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate("logistics")}
                  className="h-7 text-[11px] font-mono border-border"
                >
                  Gate Guide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate("promo")}
                  className="h-7 text-[11px] font-mono border-border"
                >
                  Flash Sale
                </Button>
              </div>
            </div>

            {/* Target Filter Select */}
            <div className="space-y-1.5">
              <Label className="text-xs text-lavender uppercase font-mono tracking-wider">
                Target Audience Filter
              </Label>
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="w-full bg-background border border-border text-bone text-xs rounded px-3 py-2 font-mono"
              >
                <option value="all">All Ticket Buyers ({audience.length} recipients)</option>
                <option value="approved">Approved &amp; Paid Orders Only</option>
                <option value="tier:early">Early Bird Pass Holders</option>
                <option value="tier:couple">Couple Pass Holders</option>
                <option value="tier:group">Group of Four Pass Holders</option>
              </select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs text-lavender uppercase font-mono tracking-wider">
                Email Subject
              </Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Gate Times & Parking Details — Hauntings of the Rift"
                className="bg-background border-border text-bone font-mono text-sm"
              />
            </div>

            {/* Headline */}
            <div className="space-y-1.5">
              <Label className="text-xs text-lavender uppercase font-mono tracking-wider">
                Banner Headline (Optional)
              </Label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g., Gates Open at 4:00 PM • Fast-Track Verification"
                className="bg-background border-border text-bone font-mono text-sm"
              />
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <Label className="text-xs text-lavender uppercase font-mono tracking-wider">
                Message Body
              </Label>
              <Textarea
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement or instructions here. Use double line-breaks to create separate paragraphs..."
                className="bg-background border-border text-bone text-sm leading-relaxed"
              />
            </div>

            {/* Optional Call to Action */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-mono">
                  Button Text (Optional)
                </Label>
                <Input
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="e.g., View Stage Schedule"
                  className="bg-background border-border text-xs text-bone"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-mono">
                  Button Link (Optional)
                </Label>
                <Input
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://verve-hauntings.vercel.app"
                  className="bg-background border-border text-xs text-bone"
                />
              </div>
            </div>

            {/* Test Preview Section */}
            <div className="border border-border/70 bg-background/60 p-3 rounded space-y-2 mt-2">
              <span className="text-[11px] font-mono text-amber-400 font-semibold block uppercase tracking-wider">
                Step 1: Test Email Dispatch
              </span>
              <div className="flex gap-2">
                <Input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="verve.n.co.ke@gmail.com"
                  className="bg-card border-border text-xs text-bone font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendTest}
                  disabled={isSendingTest}
                  className="text-xs font-mono shrink-0 border-border"
                >
                  {isSendingTest ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  )}
                  Send Preview
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Sends a preview directly to your inbox to inspect HTML layout and rendering.
              </p>
            </div>

            {/* Step 2: Final Dispatch Button */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleSendLiveBroadcast}
                disabled={isSendingBroadcast || !subject.trim() || !message.trim()}
                className="w-full bg-oxblood hover:bg-oxblood/90 text-bone border border-amber-500/40 h-11 font-sans text-sm font-semibold tracking-wide"
              >
                {isSendingBroadcast ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-bone border-t-transparent rounded-full animate-spin" />
                    <span>Dispatching Broadcast...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-amber-400" />
                    <span>Dispatch Broadcast to Ticket Buyers</span>
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* AUDIENCE ROSTER COLUMN (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/80 pb-2">
              <div>
                <h3 className="font-display text-base text-bone flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  Ticket Buyer Email Roster
                </h3>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {filteredAudience.length} registered recipient(s)
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAudience}
                className="h-7 px-2 text-xs font-mono text-muted-foreground hover:text-bone"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search buyer name, email or phone..."
                  className="bg-background border-border text-xs text-bone pl-8"
                />
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>

              <div className="flex gap-1 overflow-x-auto pb-1 text-[11px]">
                <button
                  onClick={() => setTierFilter("all")}
                  className={`px-2 py-0.5 rounded font-mono border ${
                    tierFilter === "all"
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border text-muted-foreground hover:text-bone"
                  }`}
                >
                  All ({audience.length})
                </button>
                <button
                  onClick={() => setTierFilter("early")}
                  className={`px-2 py-0.5 rounded font-mono border ${
                    tierFilter === "early"
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border text-muted-foreground hover:text-bone"
                  }`}
                >
                  Early Bird
                </button>
                <button
                  onClick={() => setTierFilter("couple")}
                  className={`px-2 py-0.5 rounded font-mono border ${
                    tierFilter === "couple"
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border text-muted-foreground hover:text-bone"
                  }`}
                >
                  Couple
                </button>
                <button
                  onClick={() => setTierFilter("group")}
                  className={`px-2 py-0.5 rounded font-mono border ${
                    tierFilter === "group"
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border text-muted-foreground hover:text-bone"
                  }`}
                >
                  Group of 4
                </button>
              </div>
            </div>

            {/* Scrollable Roster List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredAudience.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded">
                  {isLoading
                    ? "Loading audience roster..."
                    : "No ticket buyers match the criteria."}
                </div>
              ) : (
                filteredAudience.map((buyer) => (
                  <div
                    key={buyer.email}
                    className="p-2.5 border border-border/80 bg-background/50 hover:bg-background/80 transition-colors rounded text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-bone truncate max-w-[180px]">
                        {buyer.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono border-amber-500/30 text-amber-300"
                      >
                        {buyer.ticketTier || "Pass"}
                      </Badge>
                    </div>

                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      {buyer.email}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-0.5">
                      <span>KES {buyer.totalPaidKes.toLocaleString()}</span>
                      <span className="text-emerald-400 capitalize">{buyer.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
