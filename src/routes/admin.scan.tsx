import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  RotateCcw,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Search,
  Users,
  ShieldCheck,
  Zap,
  Volume2,
  VolumeX,
  Smartphone,
  RefreshCw,
  Clock,
  UserCheck,
  Send,
  Ticket,
} from "lucide-react";
import { scannerAudio } from "../lib/scanner-audio";

export const Route = createFileRoute("/admin/scan")({
  component: AdminScannerPage,
});

interface ScanResultData {
  success: boolean;
  status: "valid" | "already_used" | "invalid_signature" | "invalid_pass" | "not_found";
  httpStatus: number;
  message: string;
  ticket?: {
    ticketNumber: string;
    orderNumber: string;
    attendeeName: string;
    tierName: string;
    admitsCount: number;
    priceKes: number;
    buyerPhone: string;
    status: string;
  };
  attendee?: {
    name: string;
    tier: string;
    admitsCount: number;
    orderNumber: string;
    issuedAt: string;
    buyerPhone: string;
    priceKes: number;
  };
  checkInDetails?: {
    scannedAt: string;
    scannedBy: string;
    gateLocation: string;
  };
  eventStats?: {
    totalIssued: number;
    checkedInCount: number;
    remainingValid: number;
    admittedPercentage: number;
  };
}

interface RecentScanItem {
  id: string;
  ticketNumber: string;
  attendeeName: string;
  tierName: string;
  status: "valid" | "duplicate" | "invalid";
  scannedAt: string;
  scannedBy: string;
}

export function AdminScannerPage() {
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannerReady, setScannerReady] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<ScanResultData | null>(null);
  const [staffName, setStaffName] = useState("Gate Security Staff");
  const [gateLocation, setGateLocation] = useState("Main Top Cliff Entrance");

  // Gate Checkin Live Stats
  const [stats, setStats] = useState({
    totalIssued: 65,
    checkedInCount: 18,
    remainingValid: 47,
    admittedPercentage: 28,
  });
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>([]);
  const [isWhatsAppSending, setIsWhatsAppSending] = useState(false);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerElementId = "qr-reader-container";

  // Fetch live stats & recent scans on mount
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/tickets/stats");
      if (res.ok) {
        const data = await res.json();
        setStats({
          totalIssued: data.totalIssued || 65,
          checkedInCount: data.checkedInCount || 18,
          remainingValid: data.remainingValid || 47,
          admittedPercentage: data.admittedPercentage || 28,
        });
        if (data.recentScans) {
          setRecentScans(data.recentScans);
        }
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Initialize and clean up HTML5 QR Code Scanner
  const startCamera = async (facingMode: "environment" | "user" = cameraFacing) => {
    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // ignore
        }
      }

      const html5QrCode = new Html5Qrcode(scannerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ],
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: facingMode },
        {
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScannedPayload(decodedText);
        },
        () => {
          // Frame scan error (no QR in frame) - ignore
        },
      );

      setCameraActive(true);
      setScannerReady(true);
    } catch (err) {
      console.warn("Unable to start HTML5 camera:", err);
      setCameraActive(false);
      setScannerReady(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && cameraActive) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      setCameraActive(false);
      setTorchOn(false);
    }
  };

  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (cameraActive) {
      await startCamera(nextFacing);
    }
  };

  const toggleFlashlight = async () => {
    if (!scannerRef.current || !cameraActive) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        // @ts-expect-error torch is valid in Chromium mobile
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Flashlight / Torch not supported on this device:", err);
    }
  };

  // Process Scanned or Manually Submitted Ticket Code
  const handleScannedPayload = async (rawCode: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Extract ticket code or parse URL if QR payload is a full URL
    let extractedCode = rawCode.trim();
    let extractedHash = "";

    try {
      if (rawCode.includes("http://") || rawCode.includes("https://")) {
        const parsedUrl = new URL(rawCode);
        const codeInPath = parsedUrl.pathname.split("/").pop();
        if (codeInPath && codeInPath !== "ticket") {
          extractedCode = codeInPath;
        }
        extractedHash = parsedUrl.searchParams.get("h") || "";
      }
    } catch {
      // Raw string format
    }

    try {
      const response = await fetch("/api/tickets/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_code: extractedCode,
          qr_hash: extractedHash || undefined,
          event_id: "hauntings-of-the-rift-2026",
          staff_name: staffName,
          gate_location: gateLocation,
        }),
      });

      const data = (await response.json()) as ScanResultData;
      setLastScanResult(data);

      if (response.ok && data.success) {
        // Successful Admission
        if (soundEnabled) {
          scannerAudio.playSuccess();
        }
      } else if (response.status === 409 || data.status === "already_used") {
        // Duplicate / Already Used
        if (soundEnabled) {
          scannerAudio.playWarning();
        }
      } else {
        // Invalid / Counterfeit / Revoked
        if (soundEnabled) {
          scannerAudio.playError();
        }
      }

      // Refresh Stats
      fetchStats();
    } catch {
      if (soundEnabled) {
        scannerAudio.playError();
      }
      setLastScanResult({
        success: false,
        status: "not_found",
        httpStatus: 500,
        message: "Network error connecting to gate validation server.",
      });
    } finally {
      // Pause slightly before allowing next QR detection to prevent rapid double-scanning
      setTimeout(() => {
        setIsProcessing(false);
      }, 1800);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleScannedPayload(manualCode);
  };

  const handleSendWhatsAppNotification = async (phone: string, attendeeName: string) => {
    if (!phone || isWhatsAppSending) return;
    setIsWhatsAppSending(true);
    setWhatsAppSuccess(null);

    try {
      const res = await fetch("/api/notifications/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          templateType: "gate_alert",
          attendeeName,
          ticketCode: lastScanResult?.ticket?.ticketNumber,
        }),
      });

      if (res.ok) {
        setWhatsAppSuccess(`Check-in alert sent to ${phone}`);
      }
    } catch {
      // fallback
    } finally {
      setIsWhatsAppSending(false);
    }
  };

  useEffect(() => {
    if (activeTab === "camera") {
      startCamera(cameraFacing);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div
      id="admin-scanner-view"
      className="min-h-screen bg-[#07090E] text-slate-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Title and Quick Nav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 font-serif">
                  Gate Check-in & Pass Scanner
                </h1>
                <p className="text-sm text-slate-400">
                  Cryptographic ticket validation, duplicate detection, and live admissions
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="toggle-sound-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-2 transition ${
                soundEnabled
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-900 border-white/10 text-slate-400"
              }`}
              title={soundEnabled ? "Audio chime active" : "Audio muted"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? "Audio FX On" : "Muted"}
            </button>

            <Link
              to="/admin/tickets"
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 transition"
            >
              Ticket Directory
            </Link>

            <Link
              to="/admin/reconciliation"
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 transition"
            >
              Reconciliation
            </Link>
          </div>
        </div>

        {/* Live Gate Check-in Stats Bar */}
        <div id="scanner-live-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Admitted</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.checkedInCount}</div>
            <div className="text-xs text-slate-400 mt-1">
              {stats.admittedPercentage}% of sold passes
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Remaining Valid</span>
              <Ticket className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.remainingValid}</div>
            <div className="text-xs text-slate-400 mt-1">Pending arrival at gate</div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Issued</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.totalIssued}</div>
            <div className="text-xs text-slate-400 mt-1">Authorized ledger tickets</div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Gate Station</span>
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-sm font-semibold text-white truncate">{gateLocation}</div>
            <div className="text-xs text-slate-400 mt-1 truncate">Staff: {staffName}</div>
          </div>
        </div>

        {/* Main Scanner Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Camera Viewport & Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
              {/* Tab Selector: Camera vs Manual Code */}
              <div className="flex items-center justify-between gap-2 mb-4 bg-slate-950/80 p-1.5 rounded-xl border border-white/10">
                <button
                  id="tab-camera-btn"
                  onClick={() => setActiveTab("camera")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    activeTab === "camera"
                      ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Camera Scanner
                </button>
                <button
                  id="tab-manual-btn"
                  onClick={() => setActiveTab("manual")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    activeTab === "manual"
                      ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Search className="w-4 h-4" />
                  Manual Code Search
                </button>
              </div>

              {/* Camera Scanner Viewport */}
              {activeTab === "camera" && (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-h-[380px] flex items-center justify-center border border-white/10 shadow-inner">
                    <div id={scannerElementId} className="w-full h-full" />

                    {/* Laser Scanning Indicator Animation */}
                    {cameraActive && (
                      <div className="pointer-events-none absolute inset-0 border-2 border-orange-500/40 rounded-2xl flex flex-col justify-between p-6">
                        <div className="flex justify-between">
                          <div className="w-8 h-8 border-t-2 border-l-2 border-orange-400" />
                          <div className="w-8 h-8 border-t-2 border-r-2 border-orange-400" />
                        </div>
                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-pulse shadow-[0_0_12px_#f97316]" />
                        <div className="flex justify-between">
                          <div className="w-8 h-8 border-b-2 border-l-2 border-orange-400" />
                          <div className="w-8 h-8 border-b-2 border-r-2 border-orange-400" />
                        </div>
                      </div>
                    )}

                    {!cameraActive && (
                      <div className="text-center p-6 space-y-3">
                        <CameraOff className="w-12 h-12 text-slate-500 mx-auto" />
                        <p className="text-sm text-slate-400">
                          Camera preview inactive or permission required
                        </p>
                        <button
                          onClick={() => startCamera(cameraFacing)}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold shadow-lg"
                        >
                          Activate Camera
                        </button>
                      </div>
                    )}

                    {isProcessing && (
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-20">
                        <RefreshCw className="w-8 h-8 text-orange-400 animate-spin" />
                        <span className="text-xs font-medium uppercase tracking-wider">
                          Verifying Ticket Pass...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Camera Controls Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      id="toggle-camera-btn"
                      onClick={() => (cameraActive ? stopCamera() : startCamera(cameraFacing))}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-2 transition"
                    >
                      {cameraActive ? (
                        <CameraOff className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Camera className="w-4 h-4 text-emerald-400" />
                      )}
                      {cameraActive ? "Stop Camera" : "Start Camera"}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        id="toggle-facing-btn"
                        onClick={toggleCameraFacing}
                        className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition"
                        title="Switch Front/Rear Camera"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      <button
                        id="toggle-torch-btn"
                        onClick={toggleFlashlight}
                        disabled={!cameraActive}
                        className={`p-2.5 rounded-xl border transition ${
                          torchOn
                            ? "bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_#f59e0b]"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10"
                        } ${!cameraActive ? "opacity-50 cursor-not-allowed" : ""}`}
                        title="Toggle Flashlight / Torch"
                      >
                        {torchOn ? (
                          <Flashlight className="w-4 h-4" />
                        ) : (
                          <FlashlightOff className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Code / Search Tab */}
              {activeTab === "manual" && (
                <form onSubmit={handleManualSubmit} className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                      Enter Ticket Pass Code or Order ID
                    </label>
                    <div className="relative">
                      <input
                        id="manual-ticket-input"
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                        placeholder="e.g. HR-7892-4910 or HR-2026-9042"
                        className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 uppercase"
                      />
                      <Search className="w-5 h-5 text-slate-500 absolute right-3.5 top-3.5" />
                    </div>
                    <p className="text-xs text-slate-500">
                      Supports full ticket numbers (HR-XXXX-XXXX) or Order Confirmation numbers.
                    </p>
                  </div>

                  <button
                    id="submit-manual-code-btn"
                    type="submit"
                    disabled={!manualCode.trim() || isProcessing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold text-sm shadow-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Verify & Admit Pass
                  </button>
                </form>
              )}
            </div>

            {/* Operator Station Metadata Controls */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Staff Operator:</span>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-white text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Gate Location:</span>
                <select
                  value={gateLocation}
                  onChange={(e) => setGateLocation(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-white text-xs"
                >
                  <option value="Main Top Cliff Entrance">Main Top Cliff Entrance</option>
                  <option value="VIP & Masquerade Fast-Track">VIP & Masquerade Fast-Track</option>
                  <option value="Backstage & Artist Gate">Backstage & Artist Gate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column: Scan Verification Banner & Details */}
          <div className="lg:col-span-5 space-y-4">
            {/* Operator Status Feedback Banner */}
            {lastScanResult ? (
              <div
                id="scan-result-card"
                className={`rounded-2xl p-6 border transition-all duration-300 shadow-2xl ${
                  lastScanResult.success && lastScanResult.status === "valid"
                    ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-100"
                    : lastScanResult.status === "already_used"
                      ? "bg-amber-950/40 border-amber-500/50 text-amber-100"
                      : "bg-rose-950/40 border-rose-500/50 text-rose-100"
                }`}
              >
                {/* Result Status Header */}
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-2xl ${
                      lastScanResult.success && lastScanResult.status === "valid"
                        ? "bg-emerald-500 text-black shadow-[0_0_20px_#10b981]"
                        : lastScanResult.status === "already_used"
                          ? "bg-amber-500 text-black shadow-[0_0_20px_#f59e0b]"
                          : "bg-rose-500 text-white shadow-[0_0_20px_#ef4444]"
                    }`}
                  >
                    {lastScanResult.success && lastScanResult.status === "valid" ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : lastScanResult.status === "already_used" ? (
                      <AlertTriangle className="w-8 h-8" />
                    ) : (
                      <AlertOctagon className="w-8 h-8" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1 ${
                        lastScanResult.success && lastScanResult.status === "valid"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : lastScanResult.status === "already_used"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {lastScanResult.success
                        ? "ADMISSION GRANTED"
                        : lastScanResult.status === "already_used"
                          ? "DUPLICATE PASS DETECTED"
                          : "ADMISSION REJECTED"}
                    </span>
                    <h3 className="text-lg font-bold truncate">{lastScanResult.message}</h3>
                  </div>
                </div>

                {/* Attendee Details Breakdown */}
                {(lastScanResult.ticket || lastScanResult.attendee) && (
                  <div className="mt-5 pt-4 border-t border-white/10 space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Attendee Name:</span>
                      <span className="font-bold text-white text-base">
                        {lastScanResult.attendee?.name || lastScanResult.ticket?.attendeeName}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Pass Tier:</span>
                      <span className="font-semibold text-amber-300">
                        {lastScanResult.attendee?.tier || lastScanResult.ticket?.tierName}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Admits:</span>
                      <span className="px-2 py-0.5 rounded-md bg-white/10 font-mono font-bold text-white">
                        {lastScanResult.attendee?.admitsCount ||
                          lastScanResult.ticket?.admitsCount ||
                          1}{" "}
                        Guest(s)
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Ticket Number:</span>
                      <span className="font-mono text-xs text-slate-300">
                        {lastScanResult.ticket?.ticketNumber || "Verified"}
                      </span>
                    </div>

                    {lastScanResult.checkInDetails && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Scanned At:</span>
                        <span className="text-slate-300">
                          {new Date(lastScanResult.checkInDetails.scannedAt).toLocaleTimeString(
                            "en-KE",
                          )}
                        </span>
                      </div>
                    )}

                    {/* WhatsApp Alert Trigger for Gate Operator */}
                    {lastScanResult.ticket?.buyerPhone && (
                      <div className="pt-2">
                        <button
                          onClick={() =>
                            handleSendWhatsAppNotification(
                              lastScanResult.ticket?.buyerPhone || "",
                              lastScanResult.ticket?.attendeeName || "Guest",
                            )
                          }
                          disabled={isWhatsAppSending}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isWhatsAppSending
                            ? "Dispatching WhatsApp..."
                            : `Send WhatsApp Gate Alert to ${lastScanResult.ticket?.buyerPhone}`}
                        </button>
                        {whatsAppSuccess && (
                          <p className="text-[11px] text-emerald-400 text-center mt-1">
                            ✓ {whatsAppSuccess}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-8 text-center space-y-3">
                <Smartphone className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-semibold text-slate-300">Ready to Scan</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Align attendee digital QR pass within the camera frame or enter pass number
                  manually.
                </p>
              </div>
            )}

            {/* Recent Gate Scans Feed */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  Recent Gate Scans Stream
                </h4>
                <button
                  onClick={fetchStats}
                  className="p-1 rounded text-slate-400 hover:text-white"
                  title="Refresh activity"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {recentScans.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    No gate scans recorded yet.
                  </p>
                ) : (
                  recentScans.map((scan) => (
                    <div
                      key={scan.id}
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-white truncate">{scan.attendeeName}</div>
                        <div className="text-slate-400 font-mono text-[11px]">
                          {scan.ticketNumber} • {scan.tierName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            scan.status === "valid"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : scan.status === "duplicate"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {scan.status}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(scan.scannedAt).toLocaleTimeString("en-KE")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
