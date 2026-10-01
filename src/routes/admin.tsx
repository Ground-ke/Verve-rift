import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Menu,
  QrCode,
  Settings,
  Ticket,
  Users,
  XCircle,
  ShieldCheck,
  Tag,
  FileText,
  LogOut,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Receipt,
  Camera,
  MessageSquare,
  Send,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerveIcon } from "@/components/brand/verve-logo";
import { ProtectedAdminRoute } from "@/components/admin/protected-admin-route";
import { TicketManagementTab } from "@/components/admin/ticket-management-tab";
import { PromotionManagementTab } from "@/components/admin/promotion-management-tab";
import { ScannerManagementTab } from "@/components/admin/scanner-management-tab";
import { TicketTiersPricingTab } from "@/components/admin/ticket-tiers-pricing-tab";
import { NotificationCenterTab } from "@/components/admin/notification-center-tab";
import { AnalyticsLiveTab } from "@/components/admin/analytics-live-tab";
import { ManualVerificationTab } from "@/components/admin/manual-verification-tab";
import { AudienceBroadcastTab } from "@/components/admin/email-broadcast-tab";
import { useAdminAuth } from "@/lib/auth/admin-auth-context";
import {
  subscribeToTickets,
  subscribeToPendingOrders,
  type FirestoreTicket,
  type FirestoreOrder,
} from "@/lib/firebase/firestore-service";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Operations Portal — Verve & Co. | Hauntings of the Rift" },
      {
        name: "description",
        content:
          "Authoritative event operations, ticket ledger management, gate check-in, and promotional campaign administration.",
      },
      { property: "og:title", content: "Hauntings of the Rift Admin Portal — Verve & Co." },
      { property: "og:description", content: "Executive event operations & gate security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

interface OverviewMetrics {
  totalRevenueKes: number;
  totalTicketsSold: number;
  checkedInCount: number;
  remainingCapacity: number;
  activePromotionsCount: number;
  activeScannersCount: number;
  hourlySalesTrend: Array<{ hour: string; sales: number; count: number }>;
}

function AdminPage() {
  return (
    <ProtectedAdminRoute>
      <AdminDashboardContent />
    </ProtectedAdminRoute>
  );
}

// Safe label guard to prevent "undefined" or null from ever reaching the UI
const getSafeLabel = (val: unknown, fallback = "0"): string => {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  if (!s || s === "undefined" || s === "null") return fallback;
  return s;
};

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  statusPill?: {
    text: string;
    variant: "green" | "amber" | "red" | "grey";
  };
}

function AdminDashboardContent() {
  const { user, role, signOut } = useAdminAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab");
        if (tab === "verifications" || tab === "verification") return "verifications";
        if (tab === "tickets") return "tickets";
        if (tab === "promotions") return "promotions";
        if (tab === "scanners") return "scanners";
        if (tab === "tiers" || tab === "pricing") return "tiers";
        if (tab === "analytics") return "analytics";
        if (tab === "broadcast") return "broadcast";
        if (tab === "notifications") return "notifications";
      } catch (_e) {
        /* ignore */
      }
    }
    return "overview";
  });

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      } catch (_e) {
        /* ignore */
      }
    }
  };

  // Synchronous hydration from localStorage with explicit provisional labeling
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("rift_admin_metrics_cache");
        if (cached) return JSON.parse(cached);
      } catch (_e) {
        /* ignore */
      }
    }
    return null;
  });
  const [isProvisionalMetrics, setIsProvisionalMetrics] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return Boolean(localStorage.getItem("rift_admin_metrics_cache"));
    }
    return false;
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(!metrics);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("rift_admin_pending_count");
        if (cached) return Number(cached) || 0;
      } catch (_e) {
        /* ignore */
      }
    }
    return 0;
  });
  const [pendingRevenueKes, setPendingRevenueKes] = useState<number>(0);

  // Fetch overview metrics from backend and subscribe to live Firestore updates
  const fetchMetrics = async () => {
    try {
      const token =
        (typeof window !== "undefined" ? sessionStorage.getItem("rift_auth_token") : null) ||
        user?.token ||
        "admin_session";
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const res = await fetch("/api/admin/overview", { headers });
      const data = await res.json();
      if (data.success) {
        const loadedMetrics: OverviewMetrics = {
          totalRevenueKes: data.totalRevenueKes ?? 0,
          totalTicketsSold: data.totalTicketsSold ?? data.totalSold ?? 0,
          checkedInCount: data.checkedInCount ?? data.totalUsed ?? 0,
          remainingCapacity: data.remainingCapacity ?? 900,
          activePromotionsCount: data.activePromotionsCount ?? 4,
          activeScannersCount: data.activeScannersCount ?? 3,
          hourlySalesTrend: data.hourlySalesTrend || [],
        };
        setMetrics(loadedMetrics);
        setIsProvisionalMetrics(false);
        try {
          localStorage.setItem("rift_admin_metrics_cache", JSON.stringify(loadedMetrics));
        } catch (_e) {
          /* ignore */
        }
      }

      // Concurrently fetch pending orders to show pending revenue & queue size immediately
      try {
        const pendingRes = await fetch("/api/admin/orders/pending", { headers });
        const pendingData = await pendingRes.json();
        if (pendingData.success && Array.isArray(pendingData.orders)) {
          setPendingOrdersCount(pendingData.orders.length);
          try {
            localStorage.setItem("rift_admin_pending_count", String(pendingData.orders.length));
          } catch (_e) {
            /* ignore */
          }
          const totalKes = pendingData.orders.reduce(
            (sum: number, o: { totalKes?: number }) => sum + (o.totalKes || 0),
            0,
          );
          setPendingRevenueKes(totalKes);
        }
      } catch {
        // noop
      }
    } catch (err) {
      console.warn("Failed to load metrics from API:", err);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  const handleManualRefresh = async () => {
    await fetchMetrics();
    toast.success("Dashboard metrics refreshed");
  };

  useEffect(() => {
    fetchMetrics();

    // Subscribe to live Firestore tickets to keep dashboard metrics in sync
    const unsubscribeTickets = subscribeToTickets((liveTickets: FirestoreTicket[]) => {
      if (liveTickets && liveTickets.length > 0) {
        setMetrics((prev) => {
          const totalSold = liveTickets.length;
          const checkedInCount = liveTickets.filter((t) => t.status === "used").length;
          const totalRevenueKes = liveTickets
            .filter((t) => t.status !== "cancelled" && t.status !== "refunded")
            .reduce((sum, t) => sum + (t.priceKes || 0), 0);
          const totalCapacity = 800;
          const remainingCapacity = Math.max(0, totalCapacity - totalSold);

          // Compute hourly sales velocity from actual timestamps
          const hourMap = new Map<string, { sales: number; count: number }>();
          liveTickets
            .filter((t) => t.status !== "cancelled")
            .forEach((t) => {
              const d = new Date(t.createdAt || t.scannedAt || Date.now());
              const hourKey = `${String(d.getHours()).padStart(2, "0")}:00`;
              const current = hourMap.get(hourKey) || { sales: 0, count: 0 };
              current.sales += t.priceKes || 0;
              current.count += 1;
              hourMap.set(hourKey, current);
            });
          const sortedHours = Array.from(hourMap.keys()).sort();
          const hourlySalesTrend = sortedHours.map((hour) => ({
            hour,
            sales: hourMap.get(hour)!.sales,
            count: hourMap.get(hour)!.count,
          }));

          const updated: OverviewMetrics = {
            totalRevenueKes,
            totalTicketsSold: totalSold,
            checkedInCount,
            remainingCapacity,
            activePromotionsCount: prev?.activePromotionsCount ?? 4,
            activeScannersCount: prev?.activeScannersCount ?? 3,
            hourlySalesTrend:
              hourlySalesTrend.length > 0 ? hourlySalesTrend : (prev?.hourlySalesTrend ?? []),
          };
          try {
            localStorage.setItem("rift_admin_metrics_cache", JSON.stringify(updated));
          } catch (_e) {
            /* ignore */
          }
          return updated;
        });
      }
      setIsLoadingMetrics(false);
    });

    // Subscribe to live Firestore pending approval orders
    const unsubscribePending = subscribeToPendingOrders((pendingOrders: FirestoreOrder[]) => {
      if (pendingOrders && pendingOrders.length >= 0) {
        setPendingOrdersCount(pendingOrders.length);
        try {
          localStorage.setItem("rift_admin_pending_count", String(pendingOrders.length));
        } catch (_e) {
          /* ignore */
        }
        const totalKes = pendingOrders.reduce((sum, o) => sum + (o.totalKes || 0), 0);
        setPendingRevenueKes(totalKes);
      }
    });

    return () => {
      if (unsubscribeTickets) unsubscribeTickets();
      if (unsubscribePending) unsubscribePending();
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    toast.info("Signed out of Admin Portal");
  };

  // Operational status pills only — tech/vendor names removed from organizer UI
  const navItems: NavItem[] = [
    {
      id: "overview",
      label: "Dashboard Overview",
      icon: LayoutDashboard,
    },
    {
      id: "verifications",
      label: "M-Pesa Verification",
      icon: ShieldCheck,
      statusPill:
        pendingOrdersCount > 0
          ? { text: `${pendingOrdersCount} Pending`, variant: "amber" }
          : { text: "All Verified", variant: "green" },
    },
    {
      id: "tickets",
      label: "Ticket Management",
      icon: Ticket,
      statusPill: {
        text: `${metrics?.totalTicketsSold ?? 0} Sold`,
        variant: "green",
      },
    },
    {
      id: "promotions",
      label: "Promotion Codes",
      icon: Tag,
      statusPill: {
        text: `${metrics?.activePromotionsCount ?? 4} Active`,
        variant: "green",
      },
    },
    {
      id: "scanners",
      label: "Check-in Devices",
      icon: QrCode,
      statusPill: {
        text: `${metrics?.activeScannersCount ?? 3} Active`,
        variant: "green",
      },
    },
    {
      id: "tiers",
      label: "Ticket Tiers & Pricing",
      icon: CircleDollarSign,
    },
    {
      id: "analytics",
      label: "Page Analytics",
      icon: BarChart3,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: MessageSquare,
    },
    {
      id: "broadcast",
      label: "Audience Announcements",
      icon: Send,
    },
  ];

  return (
    <div className="min-h-screen bg-oxblood-darker lg:grid lg:grid-cols-[16rem_1fr] text-bone">
      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`${
          mobileNavOpen ? "fixed inset-0 z-50 block" : "hidden"
        } border-r border-border/80 bg-card/95 p-4 backdrop-blur-md lg:static lg:flex lg:flex-col lg:justify-between lg:min-h-screen`}
      >
        <div className="space-y-6">
          {/* Top Brand Header */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5" aria-label="Return to public site">
              <VerveIcon className="size-7 text-amber-400" />
              <div>
                <span className="font-display text-lg text-bone tracking-wide block leading-none">
                  Verve &amp; Co.
                </span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1 block">
                  Admin Portal
                </span>
              </div>
            </Link>
            <Button
              className="lg:hidden"
              variant="ghost"
              size="icon"
              aria-label="Close admin menu"
              onClick={() => setMobileNavOpen(false)}
            >
              <XCircle className="size-5 text-muted-foreground" />
            </Button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map(({ id, label, icon: Icon, statusPill }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-sans rounded-none transition-colors ${
                    isActive
                      ? "bg-oxblood text-bone font-medium border-l-2 border-amber-400 shadow-sm"
                      : "text-muted-foreground hover:bg-background/80 hover:text-bone"
                  }`}
                  aria-label={`Open ${label}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`size-4 shrink-0 ${isActive ? "text-amber-400" : "text-lavender/60"}`}
                    />
                    <span className="truncate">{label}</span>
                  </div>
                  {statusPill && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
                        statusPill.variant === "green"
                          ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                          : statusPill.variant === "amber"
                            ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                            : statusPill.variant === "red"
                              ? "bg-red-950/60 border-red-500/40 text-red-300"
                              : "bg-muted/30 border-border text-muted-foreground"
                      }`}
                    >
                      {getSafeLabel(statusPill.text, "Active")}
                    </span>
                  )}
                </button>
              );
            })}

            {/* LIVE EVENT TOOLS GROUP */}
            <div className="pt-4 mt-3 border-t border-border/50 space-y-1.5">
              <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                Live Event Tools
              </div>

              <Link to="/admin/scan" className="w-full block" aria-label="Open Live Gate Scanner">
                <div className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-sans text-amber-200 hover:bg-card/90 border-l-2 border-amber-400 bg-card/40 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Camera className="size-4 text-amber-400 shrink-0" />
                    <span>Live Gate Scanner</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 font-bold tracking-wider">
                    LIVE
                  </span>
                </div>
              </Link>

              <Link
                to="/admin/reconciliation"
                className="w-full block"
                aria-label="Open Payment Reconciliation"
              >
                <div className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-sans text-emerald-200 hover:bg-card/90 border-l-2 border-emerald-400 bg-card/40 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Receipt className="size-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-bone">Reconciliation</span>
                      <span className="block text-[10px] text-muted-foreground font-mono truncate">
                        M-Pesa payment auditing
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider shrink-0 ml-2">
                    AUDIT
                  </span>
                </div>
              </Link>
            </div>
          </nav>
        </div>

        {/* Bottom User Profile & Public Site CTA */}
        <div className="pt-4 border-t border-border/80 space-y-3 mt-4">
          <div className="flex items-center justify-between text-xs font-mono px-1">
            <span className="text-muted-foreground truncate" title={user?.email || "Organizer"}>
              {user?.email || "Organizer"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
              aria-label="Open public event site in new tab"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full text-[11px] font-mono border-border text-muted-foreground hover:text-bone hover:border-amber-400/50 h-8 transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="size-3" />
                Public Site
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-[11px] font-mono text-red-400/80 hover:text-red-300 hover:bg-red-950/40 h-8 px-2.5 transition-colors"
              title="Sign Out"
              aria-label="Sign out of Admin Portal"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="min-w-0 flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-border/80 bg-card/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              className="lg:hidden size-9"
              variant="ghost"
              size="icon"
              aria-label="Open admin menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5 text-bone" />
            </Button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-base sm:text-lg text-bone tracking-wide">
                  Hauntings of the Rift
                </h1>
                <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
                  · 31 Oct 2026
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono truncate hidden sm:block">
                Top Cliff Lodge, Nakuru · Official Organizer Console
              </p>
            </div>
          </div>

          {/* Right Header: Role & Interactive Refresh */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Firestore Sync Status */}
            <div className="flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-emerald-400 font-mono text-[11px]">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline font-semibold">LIVE SYNC</span>
            </div>

            {/* Role Badge */}
            <div className="flex items-center gap-1.5 border border-amber-500/50 bg-amber-950/40 px-2.5 py-1">
              <ShieldCheck className="size-3.5 text-amber-400 animate-pulse" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                ROLE: {role?.toUpperCase() || "ADMIN"}
              </span>
            </div>

            {/* Interactive Refresh Button with Spin State and Feedback */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              className="border-border text-lavender hover:text-bone text-xs h-8 px-2.5 hidden sm:flex items-center transition-colors"
              title="Refresh Dashboard Metrics"
              aria-label="Refresh dashboard metrics"
              disabled={isLoadingMetrics}
            >
              <RefreshCw
                className={`size-3.5 ${isLoadingMetrics ? "animate-spin text-amber-400" : ""}`}
              />
            </Button>
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* TAB 1: OVERVIEW & REAL-TIME METRICS */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* PROVISIONAL CACHE NOTICE */}
              {isProvisionalMetrics && (
                <div className="flex items-center justify-between border border-amber-500/40 bg-amber-950/20 px-3.5 py-2 text-xs text-amber-300 font-mono">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-3.5 animate-spin text-amber-400 shrink-0" />
                    <span>
                      Displaying provisional cached figures while synchronizing with authoritative
                      live database...
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 bg-amber-950/40 text-amber-300 text-[10px] font-mono shrink-0"
                  >
                    Provisional
                  </Badge>
                </div>
              )}

              {/* PENDING APPROVALS ALERT BANNER */}
              {pendingOrdersCount > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-amber-500/60 bg-amber-950/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                      <ShieldCheck className="size-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base text-amber-300">
                          {pendingOrdersCount} M-Pesa Transaction{pendingOrdersCount > 1 ? "s" : ""}{" "}
                          Awaiting Verification (KES {pendingRevenueKes.toLocaleString()})
                        </h3>
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-950/50 text-amber-300 font-mono text-[10px]"
                        >
                          24h SLA Active
                        </Badge>
                      </div>
                      <p className="text-xs text-bone-muted mt-0.5">
                        Attendees submitted their M-Pesa transaction messages. Once you approve them
                        in the Verification Queue, confirmed sales and QR passes are issued.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="event"
                    size="sm"
                    onClick={() => setActiveTab("verifications")}
                    className="shrink-0 font-mono text-xs"
                    aria-label="Open M-Pesa Verification Queue"
                  >
                    Open Verification Queue ({pendingOrdersCount}) &rarr;
                  </Button>
                </div>
              )}

              {/* PRIMARY METRIC CARDS — UNIFORM TYPOGRAPHY & DELIBERATE EMPTY STATES */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {/* 1. Gross Revenue */}
                <div className="border border-border bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-mono uppercase tracking-wider">
                      Gross Revenue
                    </span>
                    <CircleDollarSign className="size-5 text-amber-400 opacity-90 shrink-0" />
                  </div>
                  <div className="font-display text-3xl text-bone tracking-tight">
                    KES {(metrics?.totalRevenueKes ?? 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(metrics?.totalRevenueKes ?? 0) > 0
                      ? "Direct M-Pesa Paybill (522533)"
                      : pendingRevenueKes > 0
                        ? `KES ${pendingRevenueKes.toLocaleString()} pending in verification queue`
                        : "No revenue collected yet"}
                  </p>
                </div>

                {/* 2. Passes Issued */}
                <div className="border border-border bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-mono uppercase tracking-wider">
                      Passes Issued
                    </span>
                    <Ticket className="size-5 text-lavender opacity-90 shrink-0" />
                  </div>
                  <div className="font-display text-3xl text-bone tracking-tight">
                    {metrics?.totalTicketsSold ?? 0}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(metrics?.totalTicketsSold ?? 0) > 0
                      ? "Verified QR passes"
                      : pendingOrdersCount > 0
                        ? `${pendingOrdersCount} pass${pendingOrdersCount > 1 ? "es" : ""} awaiting approval`
                        : "No passes issued yet"}
                  </p>
                </div>

                {/* 3. Gate Check-ins */}
                <div className="border border-border bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-mono uppercase tracking-wider">
                      Gate Check-ins
                    </span>
                    <CheckCircle2 className="size-5 text-emerald-400 opacity-90 shrink-0" />
                  </div>
                  <div className="font-display text-3xl text-bone tracking-tight">
                    {metrics?.checkedInCount ?? 0} / {metrics?.totalTicketsSold ?? 0}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(metrics?.checkedInCount ?? 0) > 0
                      ? "Checked in at the gate"
                      : "No check-ins recorded yet"}
                  </p>
                </div>

                {/* 4. Available Capacity */}
                <div className="border border-border bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-mono uppercase tracking-wider">
                      Available Capacity
                    </span>
                    <Users className="size-5 text-amber-400 opacity-90 shrink-0" />
                  </div>
                  <div className="font-display text-3xl text-bone tracking-tight">
                    {metrics?.remainingCapacity ?? 800} / 800
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Venue capacity (800 max)
                  </p>
                </div>
              </div>

              {/* SALES VELOCITY CHART */}
              <div className="border border-border bg-card p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-base sm:text-lg text-bone flex items-center gap-2">
                      <TrendingUp className="size-4 text-amber-400" />
                      Hourly Ticket Sales Trend
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Sales activity for 31 October 2026
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                    Hourly Velocity
                  </span>
                </div>

                {metrics?.hourlySalesTrend && metrics.hourlySalesTrend.length > 0 ? (
                  <div className="mt-6 flex h-48 items-end gap-2 border-b border-l border-border/80 px-2 pb-2">
                    {metrics.hourlySalesTrend.map((item, idx) => {
                      const maxSale = Math.max(
                        ...metrics.hourlySalesTrend.map((t) => t.sales),
                        10000,
                      );
                      const heightPercent = Math.max(12, Math.round((item.sales / maxSale) * 100));
                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center gap-1 group relative"
                        >
                          {/* Tooltip on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-background border border-border px-2 py-1 text-[10px] font-mono text-bone whitespace-nowrap z-10 pointer-events-none">
                            KES {item.sales.toLocaleString()} ({item.count} tickets)
                          </div>
                          <div
                            className="w-full bg-gradient-to-t from-oxblood via-oxblood/80 to-amber-500/80 hover:to-amber-400 transition-all"
                            style={{ height: `${heightPercent}%` }}
                          />
                          <span className="text-[9px] font-mono text-muted-foreground">
                            {item.hour}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 flex h-44 items-center justify-center border-b border-l border-border/80 px-4 pb-2 text-center text-xs font-mono text-muted-foreground">
                    <div className="space-y-1.5">
                      <div className="size-2 rounded-full bg-emerald-400 animate-pulse mx-auto" />
                      <p className="text-bone font-medium">No sales recorded yet</p>
                      <p className="text-[11px] text-muted-foreground max-w-sm">
                        Hourly checkout velocity will graph here automatically as passes are issued.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* LIVE OPERATIONS QUICK ACTIONS — TIGHTENS MOBILE VIEWPORT */}
              <div className="border border-border bg-card p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base text-bone flex items-center gap-2">
                    <ShieldCheck className="size-4 text-amber-400" />
                    Event Operations Hub
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Quick Dispatch
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    onClick={() => setActiveTab("verifications")}
                    className="text-left p-3.5 border border-border/80 bg-background/50 hover:bg-background hover:border-amber-400/60 transition-colors group"
                    aria-label="Open M-Pesa Verifications Queue"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted-foreground group-hover:text-amber-300">
                        M-Pesa Queue
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-sm font-semibold text-bone">
                      {pendingOrdersCount > 0
                        ? `${pendingOrdersCount} Awaiting Review`
                        : "All Clear"}
                    </p>
                    <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                      Audit attendee SMS receipts
                    </span>
                  </button>

                  <Link
                    to="/admin/scan"
                    className="block p-3.5 border border-border/80 bg-background/50 hover:bg-background hover:border-amber-400/60 transition-colors group"
                    aria-label="Launch Live Gate Scanner"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted-foreground group-hover:text-amber-300">
                        Gate Scanner
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-sm font-semibold text-bone">
                      {metrics?.checkedInCount ?? 0} Admitted
                    </p>
                    <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                      Fast gate check-in
                    </span>
                  </Link>

                  <button
                    onClick={() => setActiveTab("tickets")}
                    className="text-left p-3.5 border border-border/80 bg-background/50 hover:bg-background hover:border-amber-400/60 transition-colors group"
                    aria-label="Open Ticket Management"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted-foreground group-hover:text-amber-300">
                        Ticket Registry
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-sm font-semibold text-bone">
                      {metrics?.totalTicketsSold ?? 0} Passes Active
                    </p>
                    <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                      Manage attendee entries
                    </span>
                  </button>

                  <Link
                    to="/admin/reconciliation"
                    className="block p-3.5 border border-border/80 bg-background/50 hover:bg-background hover:border-emerald-400/60 transition-colors group"
                    aria-label="Open Payment Reconciliation"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted-foreground group-hover:text-emerald-300">
                        Reconciliation
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-sm font-semibold text-bone">Audited Ledger</p>
                    <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                      Bank &amp; Paybill settlement
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PAGE ANALYTICS */}
          {activeTab === "analytics" && <AnalyticsLiveTab />}

          {/* TAB: M-PESA APPROVAL QUEUE */}
          {activeTab === "verifications" && <ManualVerificationTab />}

          {/* TAB: TICKET MANAGEMENT */}
          {activeTab === "tickets" && <TicketManagementTab />}

          {/* TAB: NOTIFICATIONS */}
          {activeTab === "notifications" && <NotificationCenterTab />}

          {/* TAB: AUDIENCE ANNOUNCEMENTS */}
          {activeTab === "broadcast" && <AudienceBroadcastTab />}

          {/* TAB: PROMOTION MANAGEMENT */}
          {activeTab === "promotions" && <PromotionManagementTab />}

          {/* TAB: CHECK-IN DEVICES */}
          {activeTab === "scanners" && <ScannerManagementTab />}

          {/* TAB: TICKET TIERS & PRICING */}
          {activeTab === "tiers" && <TicketTiersPricingTab />}
        </main>
      </div>
    </div>
  );
}
