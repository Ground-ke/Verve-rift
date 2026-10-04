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

interface GateStats {
  totalIssued: number;
  checkedInCount: number;
  remainingValid: number;
  admittedPercentage: number;
}

interface ScanResultData {
  success: boolean;
  status:
    | "valid"
    | "already_used"
    | "invalid_signature"
    | "invalid_pass"
    | "not_found"
    | "network_error";
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
    usedAt?: string | null;
    scannedBy?: string | null;
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
  eventStats?: GateStats;
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

type CameraErrorState = "none" | "permission_denied" | "no_camera" | "other";

const GENERATED_TICKET_CODE_REGEX =
  /^HR-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
const LEGACY_HR_TICKET_CODE_REGEX = /^HR-[A-Z0-9]{3,8}(?:-[A-Z0-9]{2,12})+$/;

const ACCEPTED_RIFT_EVENT_IDS = new Set([
  "HALLOWEEN_RIFT_2026",
  "HAUNTINGS-OF-THE-RIFT-2026",
  "HAUNTINGS_OF_THE_RIFT_2026",
]);

export function isValidRiftTicketCode(code: string): boolean {
  const normalized = code.replace(/\s+/g, "").trim().toUpperCase();
  return (
    GENERATED_TICKET_CODE_REGEX.test(normalized) ||
    LEGACY_HR_TICKET_CODE_REGEX.test(normalized)
  );
}

/**
 * Parses a scanned or manually entered string into { code, hash } if it matches:
 * (a) JSON {"code":...,"hash":...} (with no event field as in PDF QR, or event in ACCEPTED_RIFT_EVENT_IDS as in web QR)
 * (b) A URL containing the ticket code with a ?h= hash (or /ticket/:code)
 * (c) A bare Hauntings of the Rift ticket code (HR-XXXX-XXXX Base32 or legacy HR- form)
 * Returns null if the input matches none of these formats.
 */
export function parseScannedTicketPayload(
  rawInput: string,
): { code: string; hash?: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // (a) JSON {"code":...,"hash":...}
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      if (typeof parsed["code"] !== "string") {
        return null;
      }
      // Accept when event is omitted (PDF/image QR) or matches Hauntings of the Rift (web/email QR);
      // reject any clearly different event field.
      const rawEvent = parsed["event"];
      if (rawEvent !== undefined && rawEvent !== null && rawEvent !== "") {
        if (typeof rawEvent !== "string") {
          return null;
        }
        const normalizedEvent = rawEvent.trim().toUpperCase();
        if (!ACCEPTED_RIFT_EVENT_IDS.has(normalizedEvent)) {
          return null;
        }
      }
      const code = parsed["code"].replace(/\s+/g, "").trim().toUpperCase();
      const rawHash = typeof parsed["hash"] === "string" ? parsed["hash"].trim() : "";
      const hasValidHash = rawHash.length > 0;
      const isRiftCode = isValidRiftTicketCode(code);
      const isGeneralCode = /^[A-Z0-9][A-Z0-9-_]{4,49}$/.test(code);

      if ((hasValidHash && isGeneralCode) || isRiftCode) {
        return {
          code,
          ...(hasValidHash ? { hash: rawHash } : {}),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // (b) URL containing the code with a ?h= hash (or /ticket/:code with ?h=)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      const rawHash = (
        parsedUrl.searchParams.get("h") ||
        parsedUrl.searchParams.get("hash") ||
        ""
      ).trim();

      let rawCodeSegment = "";
      const ticketPathMatch = parsedUrl.pathname.match(/\/ticket\/([^/?#]+)/i);
      if (ticketPathMatch?.[1]) {
        rawCodeSegment = decodeURIComponent(ticketPathMatch[1]);
      } else if (rawHash) {
        const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop() || "";
        if (lastSegment && lastSegment.toLowerCase() !== "ticket") {
          rawCodeSegment = decodeURIComponent(lastSegment);
        } else {
          rawCodeSegment =
            parsedUrl.searchParams.get("code") || parsedUrl.searchParams.get("ticket") || "";
        }
      }

      const code = rawCodeSegment.replace(/\s+/g, "").trim().toUpperCase();
      if (!code || !/^[A-Z0-9][A-Z0-9-_]{4,49}$/.test(code)) {
        return null;
      }
      if (rawHash.length > 0 || isValidRiftTicketCode(code)) {
        return {
          code,
          ...(rawHash ? { hash: rawHash } : {}),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // (c) Bare ticket code (generated HR-XXXX-XXXX Base32 or legacy HR- form)
  const bareCode = trimmed.replace(/\s+/g, "").toUpperCase();
  if (isValidRiftTicketCode(bareCode)) {
    return { code: bareCode };
  }

  return null;
}

function classifyCameraError(err: unknown): CameraErrorState {
  const name =
    typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  const combined = `${name} ${message}`.toLowerCase();

  if (
    combined.includes("notallowederror") ||
    combined.includes("permissiondenied") ||
    combined.includes("permission denied") ||
    combined.includes("permission dismissed") ||
    combined.includes("not allowed") ||
    combined.includes("denied")
  ) {
    return "permission_denied";
  }

  if (
    combined.includes("notfounderror") ||
    combined.includes("devicesnotfound") ||
    combined.includes("requested device not found") ||
    combined.includes("no camera") ||
    combined.includes("device_not_found") ||
    combined.includes("overconstrainederror")
  ) {
    return "no_camera";
  }

  return "other";
}

export function AdminScannerPage() {
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<CameraErrorState>("none");
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [, setScannerReady] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<ScanResultData | null>(null);
  const [staffName, setStaffName] = useState("Gate Security Staff");
  const [gateLocation, setGateLocation] = useState("Main Top Cliff Entrance");

  // Gate Checkin Live Stats (null when unavailable — never invented numbers)
  const [stats, setStats] = useState<GateStats | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>([]);
  const [isWhatsAppSending, setIsWhatsAppSending] = useState(false);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerElementId = "qr-reader-container";

  // Refs for non-stale closure access in camera frame callbacks & debouncing
  const isProcessingRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const lastDecodedRef = useRef<{ raw: string; code: string; finishedAt: number }>({
    raw: "",
    code: "",
    finishedAt: 0,
  });
  const handleScannedPayloadRef = useRef<(rawCode: string) => Promise<void>>(async () => {});

  const playSafeSuccess = () => {
    if (!soundEnabledRef.current) return;
    try {
      scannerAudio.playSuccessChime();
    } catch {
      // ignore audio error
    }
  };

  const playSafeDuplicate = () => {
    if (!soundEnabledRef.current) return;
    try {
      scannerAudio.playDuplicateTone();
    } catch {
      // ignore audio error
    }
  };

  const playSafeError = () => {
    if (!soundEnabledRef.current) return;
    try {
      scannerAudio.playErrorTone();
    } catch {
      // ignore audio error
    }
  };

  // Fetch live stats & recent scans
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/tickets/stats");
      if (!res.ok) {
        setStats(null);
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (
        typeof data["totalIssued"] === "number" &&
        typeof data["checkedInCount"] === "number" &&
        typeof data["remainingValid"] === "number" &&
        typeof data["admittedPercentage"] === "number"
      ) {
        setStats({
          totalIssued: data["totalIssued"],
          checkedInCount: data["checkedInCount"],
          remainingValid: data["remainingValid"],
          admittedPercentage: data["admittedPercentage"],
        });
      } else {
        setStats(null);
      }
      if (Array.isArray(data["recentScans"])) {
        setRecentScans(data["recentScans"] as RecentScanItem[]);
      }
    } catch {
      setStats(null);
    }
  };

  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void fetchStats();
      }
    }, 10000);
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

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setCameraActive(false);
        setScannerReady(false);
        setCameraError("no_camera");
        return;
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
          void handleScannedPayloadRef.current(decodedText);
        },
        () => {
          // Frame scan error (no QR in frame) - ignore
        },
      );

      setCameraActive(true);
      setScannerReady(true);
      setCameraError("none");
    } catch (err) {
      console.warn("Unable to start HTML5 camera:", err);
      setCameraActive(false);
      setScannerReady(false);
      setCameraError(classifyCameraError(err));
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
    if (isProcessingRef.current) return;

    const trimmedRaw = rawCode.trim();
    if (!trimmedRaw) return;

    const parsed = parseScannedTicketPayload(trimmedRaw);
    const candidateCode = parsed?.code || trimmedRaw.replace(/\s+/g, "").toUpperCase();

    // Ignore the same decoded code for 5 seconds after any result
    const now = Date.now();
    if (
      lastDecodedRef.current.finishedAt > 0 &&
      now - lastDecodedRef.current.finishedAt < 5000 &&
      (lastDecodedRef.current.raw === trimmedRaw ||
        (candidateCode && lastDecodedRef.current.code === candidateCode))
    ) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      // Reject non-matching strings client-side without calling the server
      if (!parsed) {
        setLastScanResult({
          success: false,
          status: "invalid_pass",
          httpStatus: 400,
          message: "Not a Hauntings of the Rift ticket",
        });
        playSafeError();
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);

      let response: Response;
      try {
        response = await fetch("/api/tickets/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ticket_code: parsed.code,
            qr_hash: parsed.hash || undefined,
            event_id: "hauntings-of-the-rift-2026",
            staff_name: staffName,
            gate_location: gateLocation,
          }),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const data = (await response.json()) as ScanResultData;

      // Always update UI state BEFORE any audio/haptic playback
      setLastScanResult(data);
      if (data.eventStats && typeof data.eventStats.totalIssued === "number") {
        setStats(data.eventStats);
      }

      if (response.ok && data.success) {
        playSafeSuccess();
      } else if (response.status === 409 || data.status === "already_used") {
        playSafeDuplicate();
      } else {
        playSafeError();
      }

      void fetchStats();
    } catch {
      // Timeout or network failure: show distinct AMBER card before playing audio
      setLastScanResult({
        success: false,
        status: "network_error",
        httpStatus: 0,
        message:
          "No response from the server. This ticket was NOT rejected. Check the connection and scan again. If it then says already scanned a moment ago, admit the guest.",
      });
      playSafeDuplicate();
    } finally {
      lastDecodedRef.current = {
        raw: trimmedRaw,
        code: candidateCode,
        finishedAt: Date.now(),
      };
      // Keep 1800ms cooldown for other codes
      window.setTimeout(() => {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }, 1800);
    }
  };

  handleScannedPayloadRef.current = handleScannedPayload;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.replace(/\s+/g, "").trim().toUpperCase();
    if (!cleaned) return;
    setManualCode(cleaned);
    if (/^HRT-2026-\d{6}$/.test(cleaned)) {
      setLastScanResult({
        success: false,
        status: "invalid_pass",
        httpStatus: 400,
        message:
          "That is an order number. Ask the guest for the ticket code that starts with HR-, shown under TICKET CODE on the ticket, or scan the QR.",
      });
      playSafeError();
      return;
    }
    if (!isValidRiftTicketCode(cleaned)) {
      setLastScanResult({
        success: false,
        status: "invalid_pass",
        httpStatus: 400,
        message: "Not a Hauntings of the Rift ticket",
      });
      playSafeError();
      return;
    }
    void handleScannedPayload(cleaned);
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
      void startCamera(cameraFacing);
    } else {
      void stopCamera();
    }

    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const isValidResult = Boolean(lastScanResult?.success && lastScanResult?.status === "valid");
  const isDuplicateResult = lastScanResult?.status === "already_used";
  const isNetworkErrorResult = lastScanResult?.status === "network_error";

  const duplicateFirstScanAt =
    lastScanResult?.checkInDetails?.scannedAt || lastScanResult?.ticket?.usedAt || null;
  const duplicateScannedBy =
    lastScanResult?.checkInDetails?.scannedBy ||
    lastScanResult?.ticket?.scannedBy ||
    "Gate Security Staff";
  const duplicateBuyerName =
    lastScanResult?.attendee?.name || lastScanResult?.ticket?.attendeeName || "Unknown Guest";
  const duplicateTierName =
    lastScanResult?.attendee?.tier || lastScanResult?.ticket?.tierName || "Unknown Tier";
  const duplicateAdmitsCount =
    lastScanResult?.attendee?.admitsCount ?? lastScanResult?.ticket?.admitsCount ?? 1;

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
              to="/admin"
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
            <div className="text-2xl font-bold text-emerald-400">
              {stats ? stats.checkedInCount : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {stats ? `${stats.admittedPercentage}% of sold passes` : "Counts unavailable"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Remaining Valid</span>
              <Ticket className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {stats ? stats.remainingValid : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {stats ? "Pending arrival at gate" : "Counts unavailable"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Issued</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">{stats ? stats.totalIssued : "—"}</div>
            <div className="text-xs text-slate-400 mt-1">
              {stats ? "Authorized ledger tickets" : "Counts unavailable"}
            </div>
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
                      <div className="text-center p-6 space-y-3 max-w-md">
                        <CameraOff className="w-12 h-12 text-slate-500 mx-auto" />
                        {cameraError === "permission_denied" ? (
                          <>
                            <p className="text-sm font-semibold text-amber-300">
                              Camera Permission Denied
                            </p>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Camera access was blocked by your browser. Click the lock or site
                              settings icon in your browser&apos;s address bar, change{" "}
                              <span className="font-semibold text-white">Camera</span> to{" "}
                              <span className="font-semibold text-white">Allow</span>, then reload
                              the page or click Retry Camera below.
                            </p>
                          </>
                        ) : cameraError === "no_camera" ? (
                          <>
                            <p className="text-sm font-semibold text-rose-300">
                              No Camera Found on This Device
                            </p>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              No camera hardware was detected. Connect a camera or switch to the
                              Manual Code Search tab to enter ticket numbers directly.
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400">Camera preview is inactive.</p>
                        )}
                        <button
                          onClick={() => startCamera(cameraFacing)}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold shadow-lg"
                        >
                          {cameraError === "permission_denied"
                            ? "Retry Camera"
                            : "Activate Camera"}
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
                      Enter Ticket Pass Code
                    </label>
                    <div className="relative">
                      <input
                        id="manual-ticket-input"
                        type="text"
                        value={manualCode}
                        onChange={(e) =>
                          setManualCode(e.target.value.replace(/\s+/g, "").trim().toUpperCase())
                        }
                        placeholder="e.g. HR-7K4M-9P2X"
                        className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 uppercase"
                      />
                      <Search className="w-5 h-5 text-slate-500 absolute right-3.5 top-3.5" />
                    </div>
                    <p className="text-xs text-slate-500">
                      Enter ticket numbers only (e.g. HR-7K4M-9P2X).
                    </p>
                  </div>

                  <button
                    id="submit-manual-code-btn"
                    type="submit"
                    disabled={!manualCode.replace(/\s+/g, "").trim() || isProcessing}
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
                  isValidResult
                    ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-100"
                    : isNetworkErrorResult
                      ? "bg-amber-950/60 border-2 border-amber-400/70 text-amber-100"
                      : isDuplicateResult
                        ? "bg-amber-950/40 border-amber-500/50 text-amber-100"
                        : "bg-rose-950/40 border-rose-500/50 text-rose-100"
                }`}
              >
                {/* Result Status Header */}
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-2xl ${
                      isValidResult
                        ? "bg-emerald-500 text-black shadow-[0_0_20px_#10b981]"
                        : isNetworkErrorResult || isDuplicateResult
                          ? "bg-amber-500 text-black shadow-[0_0_20px_#f59e0b]"
                          : "bg-rose-500 text-white shadow-[0_0_20px_#ef4444]"
                    }`}
                  >
                    {isValidResult ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : isNetworkErrorResult || isDuplicateResult ? (
                      <AlertTriangle className="w-8 h-8" />
                    ) : (
                      <AlertOctagon className="w-8 h-8" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1 ${
                        isValidResult
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : isNetworkErrorResult || isDuplicateResult
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {isValidResult
                        ? "ADMISSION GRANTED"
                        : isNetworkErrorResult
                          ? "NO SERVER RESPONSE — NOT REJECTED"
                          : isDuplicateResult
                            ? "DUPLICATE PASS DETECTED"
                            : "ADMISSION REJECTED"}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold leading-snug break-words">
                      {lastScanResult.message}
                    </h3>
                  </div>
                </div>

                {/* Prominent Duplicate Scan Details Callout */}
                {isDuplicateResult && (
                  <div className="mt-5 rounded-xl bg-amber-950/70 border border-amber-400/50 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between items-center border-b border-amber-400/20 pb-2">
                      <span className="text-amber-200/80 font-medium">First Scan Time:</span>
                      <span className="font-mono font-bold text-amber-200 text-base">
                        {duplicateFirstScanAt
                          ? new Date(duplicateFirstScanAt).toLocaleTimeString("en-KE")
                          : "Earlier scan"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-amber-400/20 pb-2">
                      <span className="text-amber-200/80 font-medium">Scanned By:</span>
                      <span className="font-bold text-white">{duplicateScannedBy}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-amber-400/20 pb-2">
                      <span className="text-amber-200/80 font-medium">Buyer Name:</span>
                      <span className="font-bold text-white text-base">{duplicateBuyerName}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-amber-400/20 pb-2">
                      <span className="text-amber-200/80 font-medium">Tier:</span>
                      <span className="font-bold text-amber-300">{duplicateTierName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-200/80 font-medium">Entry Capacity:</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-100">
                        Admits {duplicateAdmitsCount}
                      </span>
                    </div>
                  </div>
                )}

                {/* Attendee Details Breakdown */}
                {(lastScanResult.ticket || lastScanResult.attendee) && !isDuplicateResult && (
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
                        Admits{" "}
                        {lastScanResult.attendee?.admitsCount ||
                          lastScanResult.ticket?.admitsCount ||
                          1}
                      </span>
                    </div>

                    {(lastScanResult.attendee?.orderNumber ||
                      lastScanResult.ticket?.orderNumber) && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Order Number:</span>
                        <span className="font-mono text-xs text-slate-300">
                          {lastScanResult.attendee?.orderNumber ||
                            lastScanResult.ticket?.orderNumber}
                        </span>
                      </div>
                    )}

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
