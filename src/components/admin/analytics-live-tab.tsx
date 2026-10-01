import { useState, useEffect } from "react";
import {
  subscribeToAdminAnalytics,
  calculateAnalyticsSummary,
  logFirebaseAnalyticsEvent,
  type StoredAnalyticsEvent,
  type AnalyticsSummary,
} from "@/lib/firebase/analytics-service";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import {
  Activity,
  Users,
  Eye,
  Smartphone,
  Monitor,
  Tablet,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AnalyticsLiveTab() {
  const [events, setEvents] = useState<StoredAnalyticsEvent[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    setIsLoading(true);

    const unsubscribe = subscribeToAdminAnalytics(
      (newEvents) => {
        setEvents(newEvents);
        setSummary(calculateAnalyticsSummary(newEvents));
        setIsLoading(false);
        setIsLiveConnected(true);
        setErrorMessage(null);
      },
      (error) => {
        setIsLoading(false);
        setIsLiveConnected(false);
        setErrorMessage(error.message);
      },
      60,
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleSendTestTelemetry = async () => {
    setIsSimulating(true);
    try {
      await logFirebaseAnalyticsEvent("admin_telemetry_ping", {
        origin: "Admin Portal",
        action: "live_sync_verification",
        triggeredAt: new Date().toISOString(),
      });
      toast.success("Page Telemetry Dispatched", {
        description: "Sent to Firestore /analytics_events stream",
      });
    } catch (err) {
      toast.error("Telemetry Dispatch Error", {
        description: err instanceof Error ? err.message : "Failed to emit event",
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl text-bone tracking-tight">
              Real-time Page Analytics
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${
                isLiveConnected
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-950/40 text-amber-400 border-amber-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isLiveConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              {isLiveConnected ? "Live Firestore Stream" : "Connecting..."}
            </span>
          </div>
          <p className="text-xs text-lavender/70 font-sans mt-1">
            Real-time telemetry and user behavior stream dispatched directly from visitor pages to
            the admin console.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSendTestTelemetry}
            disabled={isSimulating}
            size="sm"
            className="bg-oxblood hover:bg-oxblood/90 text-bone border border-amber-500/30 text-xs font-mono h-9"
          >
            {isSimulating ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Radio className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            )}
            Send Test Ping
          </Button>
        </div>
      </div>

      {/* Cloud Configuration Bar */}
      <div className="p-3.5 border border-border/70 bg-card/60 rounded-none flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="font-mono text-xs">
            <span className="text-muted-foreground">Project: </span>
            <span className="text-bone font-semibold">verve-509008</span>
            <span className="text-muted-foreground mx-2">·</span>
            <span className="text-muted-foreground">Region: </span>
            <span className="text-bone">europe-west2</span>
            <span className="text-muted-foreground mx-2">·</span>
            <span className="text-muted-foreground">Database: </span>
            <span className="text-emerald-400 font-semibold">Firestore Active</span>
          </div>
        </div>
        <div className="text-[11px] font-mono text-lavender/60">
          Target: Top Cliff Lodge, Nakuru
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 border border-red-500/40 bg-red-950/30 text-red-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Firestore Stream Notification</div>
            <div className="text-red-300/80 mt-0.5">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-border/80 bg-card/80 p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Total Events</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-bone">
            {summary?.totalEvents ?? 0}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Logged to Firestore
          </div>
        </div>

        <div className="border border-border/80 bg-card/80 p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Unique Sessions</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-bone">
            {summary?.uniqueSessions ?? 0}
          </div>
          <div className="text-[10px] text-emerald-400/80 font-mono mt-1">Active visitors</div>
        </div>

        <div className="border border-border/80 bg-card/80 p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Page Views</span>
            <Eye className="w-4 h-4 text-sky-400" />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-bone">
            {summary?.pageViewsCount ?? 0}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Site route impressions
          </div>
        </div>

        <div className="border border-border/80 bg-card/80 p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Checkouts</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-bone">
            {summary?.checkoutStartsCount ?? 0}
          </div>
          <div className="text-[10px] text-amber-400/80 font-mono mt-1">Ticket funnel starts</div>
        </div>
      </div>

      {/* Two Column Layout: Top Pages & Device Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="border border-border/80 bg-card/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base text-bone tracking-wide">
              Top Visited Page Paths
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">
              Ranked Views
            </span>
          </div>

          {summary && summary.topPages.length > 0 ? (
            <div className="space-y-3">
              {summary.topPages.map((item, idx) => {
                const percentage =
                  summary.pageViewsCount > 0
                    ? Math.round((item.views / summary.pageViewsCount) * 100)
                    : 0;
                return (
                  <div key={item.path} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-bone truncate max-w-[200px]">
                        <span className="text-amber-400 mr-2">#{idx + 1}</span>
                        {item.path}
                      </span>
                      <span className="text-lavender">
                        {item.views} views ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-background overflow-hidden">
                      <div
                        className="h-full bg-amber-500/80 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground font-mono">
              Awaiting live route navigation events...
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="border border-border/80 bg-card/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base text-bone tracking-wide">Device Telemetry</h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Breakdown</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="border border-border/60 bg-background/50 p-3 text-center">
              <Smartphone className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-[11px] font-mono text-muted-foreground">Mobile</div>
              <div className="font-display text-lg text-bone mt-0.5">
                {summary?.deviceBreakdown["mobile"] ?? 0}
              </div>
            </div>

            <div className="border border-border/60 bg-background/50 p-3 text-center">
              <Monitor className="w-5 h-5 text-sky-400 mx-auto mb-1" />
              <div className="text-[11px] font-mono text-muted-foreground">Desktop</div>
              <div className="font-display text-lg text-bone mt-0.5">
                {summary?.deviceBreakdown["desktop"] ?? 0}
              </div>
            </div>

            <div className="border border-border/60 bg-background/50 p-3 text-center">
              <Tablet className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-[11px] font-mono text-muted-foreground">Tablet</div>
              <div className="font-display text-lg text-bone mt-0.5">
                {summary?.deviceBreakdown["tablet"] ?? 0}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Event Ingestion Rate</span>
            <span className="font-mono text-bone text-emerald-400">Normal (Sub-second)</span>
          </div>
        </div>
      </div>

      {/* Live Event Stream Ledger */}
      <div className="border border-border/80 bg-card/80 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base text-bone tracking-wide">
              Live Visitor Event Ledger
            </h3>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Displaying latest {events.length} events
          </span>
        </div>

        {events.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground font-mono border border-dashed border-border/60">
            No events recorded yet. Click "Send Test Ping" or visit the public page to see real-time
            data appear instantly.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border/80 text-[10px] uppercase text-muted-foreground tracking-wider">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Event Name</th>
                  <th className="py-2.5 px-3">Page Path</th>
                  <th className="py-2.5 px-3">Device</th>
                  <th className="py-2.5 px-3">Session ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {events.map((evt) => (
                  <tr key={evt.id || Math.random().toString()} className="hover:bg-background/40">
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-950/40 text-amber-300 border border-amber-500/20">
                        {evt.eventName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-bone truncate max-w-[180px]">
                      {evt.path || evt.pageUrl || "/"}
                    </td>
                    <td className="py-2.5 px-3 text-lavender/80 uppercase text-[10px]">
                      {evt.deviceType || "desktop"}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[120px]">
                      {evt.sessionId}
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
