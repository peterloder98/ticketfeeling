"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  Info,
  Keyboard,
  LogIn,
  LogOut,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";

type ScanMode = "in" | "out" | "info";

type ScanResult = {
  color: "green" | "red" | "orange" | "blue";
  message: string;
  salesChannelLabel?: string | null;
  ticket?: {
    ticketNumber: string;
    categorySnapshot: string;
    presence: string;
    status?: string;
    eventNameSnapshot?: string;
    holderName?: string | null;
  } | null;
  stats?: ScannerStats;
};

export type ScannerStats = {
  sold: number;
  soldOnline: number;
  soldBoxOffice: number;
  active: number;
  firstCheckedIn: number;
  currentlyIn: number;
  currentlyOut: number;
  notArrived: number;
};

const SCAN_COOLDOWN_MS = 3200;
/** Ignore identical QR payload for this long (anti-retrigger on frozen last frame). */
const SAME_CODE_LOCK_MS = 12000;
/** Consecutive no-code frames required before the next scan is accepted. */
const CLEAR_FRAMES_REQUIRED = 10;
const RESULT_HOLD_MS = 5000;
const DARK_LUMA_THRESHOLD = 14;
const SESSION_KEY_PREFIX = "tf.scanner.session.";

type ScannerSession = {
  mode: ScanMode;
  gate: string;
};

function sessionKey(eventId: string) {
  return `${SESSION_KEY_PREFIX}${eventId}`;
}

function loadSession(eventId: string): ScannerSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScannerSession>;
    if (parsed.mode !== "in" && parsed.mode !== "out" && parsed.mode !== "info") return null;
    return {
      mode: parsed.mode,
      gate: typeof parsed.gate === "string" && parsed.gate.trim() ? parsed.gate : "Eingang Haupt",
    };
  } catch {
    return null;
  }
}

function saveSession(eventId: string, session: ScannerSession) {
  try {
    sessionStorage.setItem(sessionKey(eventId), JSON.stringify(session));
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}lastEventId`, eventId);
  } catch {
    /* ignore quota / private mode */
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx() {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AC();
  }
  if (sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/** Clear pling on OK, distinct double “no” on fail. */
function playScanSound(color: ScanResult["color"]) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.62;
    master.connect(ctx.destination);

    const tone = (
      freq: number,
      start: number,
      dur: number,
      type: OscillatorType,
      peak: number,
    ) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.start(start);
      o.stop(start + dur + 0.02);
    };

    if (color === "green" || color === "blue") {
      tone(1175, now, 0.11, "sine", 0.95);
      tone(1568, now + 0.08, 0.2, "sine", 0.8);
      if (color === "blue") tone(2093, now + 0.18, 0.12, "sine", 0.5);
    } else if (color === "orange") {
      tone(440, now, 0.14, "triangle", 0.75);
      tone(370, now + 0.16, 0.16, "triangle", 0.7);
    } else {
      tone(220, now, 0.18, "square", 0.6);
      tone(155, now + 0.2, 0.24, "square", 0.55);
    }
  } catch {
    /* ignore */
  }
}

function presenceDe(presence: string) {
  switch (presence) {
    case "in":
      return "Im Haus";
    case "out":
      return "Draußen";
    default:
      return "Noch nicht da";
  }
}

function modeMeta(mode: ScanMode) {
  if (mode === "in") {
    return {
      title: "Check-in aktiviert",
      hint: "QR-Code scannen zum Einlass",
    };
  }
  if (mode === "out") {
    return {
      title: "Check-out aktiviert",
      hint: "QR-Code scannen zum Auschecken",
    };
  }
  return {
    title: "Infomodus aktiviert",
    hint: "Scannen für Ticket-Details — ohne Statusänderung",
  };
}

function flashBorder(color: ScanResult["color"] | null) {
  if (!color) return "border-transparent";
  if (color === "green" || color === "blue") return "border-[#22c55e]";
  if (color === "orange") return "border-[#fb923c]";
  return "border-[#ef4444]";
}

function resultPanel(color: ScanResult["color"]) {
  if (color === "green") return "bg-[#15803d]";
  if (color === "blue") return "bg-[#1d4ed8]";
  if (color === "orange") return "bg-[#c2410c]";
  return "bg-[#b91c1c]";
}

function isScannerStats(value: unknown): value is ScannerStats {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.currentlyIn === "number" && typeof v.sold === "number";
}

const GUIDE_CORNER = "pointer-events-none absolute h-10 w-10 border-white";

/**
 * Single overlay: corner brackets + red line share one square.
 * Library shaded UI is hidden — this is the only aim guide.
 * Centered with inset:0 + grid so it stays mid-viewfinder even when video is black/collapsed.
 */
function ScanGuide() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 p-5"
      style={{ display: "grid", placeItems: "center" }}
    >
      <div
        className="relative"
        style={{
          width: "min(72vw, 300px)",
          height: "min(72vw, 300px)",
          maxHeight: "min(48vh, 300px)",
          maxWidth: "min(48vh, 300px)",
        }}
      >
        <span className={`${GUIDE_CORNER} left-0 top-0 border-l-[3px] border-t-[3px]`} />
        <span className={`${GUIDE_CORNER} right-0 top-0 border-r-[3px] border-t-[3px]`} />
        <span className={`${GUIDE_CORNER} bottom-0 left-0 border-b-[3px] border-l-[3px]`} />
        <span className={`${GUIDE_CORNER} bottom-0 right-0 border-b-[3px] border-r-[3px]`} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: "50%",
            height: 3,
            marginTop: -1.5,
            borderRadius: 9999,
            background: "#ef4444",
            boxShadow: "0 0 10px rgba(239,68,68,0.85)",
          }}
        />
        <p className="absolute -bottom-9 left-0 right-0 text-center text-xs font-medium text-white/85">
          Code hier ausrichten
        </p>
      </div>
    </div>
  );
}

type FrameSample = { luma: number; fingerprint: string; ok: boolean };

/** Sample a tiny downscale of the live video — reject black/frozen decode ghosts. */
function sampleVideoFrame(): FrameSample {
  const video = document.querySelector("#tf-qr-reader video") as HTMLVideoElement | null;
  if (!video || video.readyState < 2 || video.videoWidth < 2) {
    return { luma: 0, fingerprint: "none", ok: false };
  }
  try {
    const w = 24;
    const h = 24;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { luma: 0, fingerprint: "none", ok: false };
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    const picks: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += y;
      if (i % 64 === 0) picks.push(Math.round(y));
    }
    const luma = sum / (data.length / 4);
    const fingerprint = `${Math.round(luma)}:${picks.slice(0, 8).join(",")}`;
    return { luma, fingerprint, ok: luma >= DARK_LUMA_THRESHOLD };
  } catch {
    return { luma: 0, fingerprint: "err", ok: false };
  }
}

function hideLibraryPausedBanner(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll("div").forEach((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    if (text === "scanner paused" || text.includes("scanner paused")) {
      el.style.setProperty("display", "none", "important");
      el.setAttribute("aria-hidden", "true");
      el.dataset.tfHiddenPaused = "1";
    }
  });
}

function isAppleMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS;
}

/** Soft focus nudge only — never force resolution/fps (breaks iOS decode loops). */
async function applyBestCameraConstraints(scanner: Html5Qrcode) {
  if (isAppleMobileBrowser()) return;
  try {
    await scanner.applyVideoConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    } as MediaTrackConstraints);
  } catch {
    /* device may reject — keep default stream */
  }
}

type CameraHelpKind = "permission" | "missing" | "https" | "generic";

function classifyCameraError(error: unknown): { message: string; help: CameraHelpKind } {
  const raw =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : String(error ?? "");
  const lower = raw.toLowerCase();

  if (
    !window.isSecureContext ||
    lower.includes("insecure") ||
    lower.includes("https") ||
    lower.includes("secure origin")
  ) {
    return {
      message: "Kamera braucht eine sichere Verbindung (HTTPS).",
      help: "https",
    };
  }

  if (
    lower.includes("notallowed") ||
    lower.includes("permission") ||
    lower.includes("denied") ||
    lower.includes("notallowederror")
  ) {
    return {
      message: "Kamera-Zugriff wurde blockiert.",
      help: "permission",
    };
  }

  if (
    lower.includes("notfound") ||
    lower.includes("devicesnotfound") ||
    lower.includes("no camera") ||
    lower.includes("requested device not found")
  ) {
    return {
      message: "Keine Kamera gefunden.",
      help: "missing",
    };
  }

  if (
    lower.includes("notreadable") ||
    lower.includes("trackstart") ||
    lower.includes("could not start") ||
    lower.includes("in use") ||
    lower.includes("abort")
  ) {
    return {
      message: "Kamera ist belegt oder nicht erreichbar.",
      help: "generic",
    };
  }

  return {
    message: "Kamera nicht verfügbar.",
    help: "generic",
  };
}

function cameraHelpText(kind: CameraHelpKind): string {
  switch (kind) {
    case "https":
      return "Öffne die Seite über https://… (z. B. die Live-URL). Lokal nur mit sicherem Kontext.";
    case "permission":
      return "Safari/Chrome: Einstellungen → Kamera → diese Website erlauben. Danach „Erneut versuchen“ tippen.";
    case "missing":
      return "Prüfe, ob das Gerät eine Kamera hat und keine andere App sie blockiert.";
    default:
      return "Safari/Chrome: Einstellungen → Kamera für diese Website erlauben, dann erneut versuchen.";
  }
}

function isBackCameraLabel(label: string) {
  const l = label.toLowerCase();
  return (
    l.includes("back") ||
    l.includes("rear") ||
    l.includes("environment") ||
    l.includes("rück") ||
    l.includes("hinten") ||
    l.includes("world")
  );
}

function isFrontCameraLabel(label: string) {
  const l = label.toLowerCase();
  return (
    l.includes("front") ||
    l.includes("user") ||
    l.includes("face") ||
    l.includes("vorne") ||
    l.includes("selfie")
  );
}

/**
 * Prompt for camera permission, then build start configs for Html5Qrcode.start().
 * Library only accepts a deviceId string OR an object with exactly one key:
 * facingMode ("environment"|"user"|{exact}) or deviceId — never width/fps/ideal.
 */
async function buildCameraStartConfigs(): Promise<Array<string | MediaTrackConstraints>> {
  if (typeof window === "undefined") {
    throw new Error("Kamera nur im Browser verfügbar");
  }
  if (!window.isSecureContext) {
    throw new Error("HTTPS required for camera");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia not supported");
  }

  // Always touch getUserMedia so the browser permission prompt appears.
  // Prefer rear camera; if that fails, any video stream unlocks labels/enumeration.
  let permissionStream: MediaStream | null = null;
  try {
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
    } catch {
      permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }
  } finally {
    permissionStream?.getTracks().forEach((t) => t.stop());
    permissionStream = null;
  }
  // Brief yield so mobile browsers fully release the permission stream
  await new Promise((r) => window.setTimeout(r, 120));

  const configs: Array<string | MediaTrackConstraints> = [];
  const seen = new Set<string>();
  const push = (c: string | MediaTrackConstraints) => {
    const key = typeof c === "string" ? `id:${c}` : `c:${JSON.stringify(c)}`;
    if (seen.has(key)) return;
    seen.add(key);
    configs.push(c);
  };

  try {
    const devices = await Html5Qrcode.getCameras();
    const back = devices.filter((d) => isBackCameraLabel(d.label));
    const front = devices.filter((d) => isFrontCameraLabel(d.label));
    const rest = devices.filter((d) => !back.includes(d) && !front.includes(d));
    for (const d of [...back, ...rest, ...front]) {
      if (d.id) push(d.id);
    }
  } catch {
    /* enumeration can fail even after permission — use facingMode fallbacks */
  }

  // Html5Qrcode rejects { ideal: … } — only string or { exact }
  push({ facingMode: "environment" });
  push({ facingMode: "user" });
  push({ facingMode: { exact: "environment" } });
  push({ facingMode: { exact: "user" } });

  return configs;
}

/**
 * Full viewfinder decode (no qrbox crop). html5-qrcode's qrbox + object-cover
 * desync made iPhone aim at pixels the decoder never saw. Library shaded UI is CSS-hidden.
 */
const SCAN_CONFIG = {
  fps: 12,
  disableFlip: false,
};

/** BarcodeDetector on iOS Safari can hang detect() and stall foreverScan. Always use ZXing. */
function scannerEngineConfig() {
  return {
    verbose: false,
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported: false,
  };
}

export function ScannerClient({
  eventId,
  eventName,
  initialStats,
  gateLabel = "Eingang Haupt",
}: {
  eventId: string;
  eventName: string;
  initialStats: ScannerStats;
  gateLabel?: string;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<ScanMode>("in");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [flash, setFlash] = useState<ScanResult["color"] | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [phase, setPhase] = useState<"ready" | "scanning">("ready");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraHelp, setCameraHelp] = useState<CameraHelpKind | null>(null);
  const [gate, setGate] = useState(gateLabel);
  const [showSettings, setShowSettings] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [online, setOnline] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [decodeHint, setDecodeHint] = useState<string | null>(null);
  const [cameraPausedUi, setCameraPausedUi] = useState(false);
  const [cameraDead, setCameraDead] = useState(false);
  const sessionHydratedRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startGenRef = useRef(0);
  const startingRef = useRef(false);
  const lastScanAt = useRef(0);
  const lastDecodedRef = useRef<{ raw: string; at: number } | null>(null);
  const scanInFlightRef = useRef(false);
  const resultShowingRef = useRef(false);
  const needClearFramesRef = useRef(false);
  const clearMissCountRef = useRef(0);
  const lastFingerprintRef = useRef<string | null>(null);
  const frozenFingerprintHitsRef = useRef(0);
  const darkStreakRef = useRef(0);
  const modeRef = useRef(mode);
  const gateRef = useRef(gate);
  const resultClearRef = useRef<number | null>(null);
  const flashClearRef = useRef<number | null>(null);
  const decodeAttemptsRef = useRef(0);
  const lastDecodeTickRef = useRef(0);
  const scanningSinceRef = useRef(0);
  const softPausedRef = useRef(false);

  useEffect(() => {
    const saved = loadSession(eventId);
    if (saved) {
      setMode(saved.mode);
      setGate(saved.gate);
      modeRef.current = saved.mode;
      gateRef.current = saved.gate;
    }
    sessionHydratedRef.current = true;
  }, [eventId]);

  useEffect(() => {
    modeRef.current = mode;
    gateRef.current = gate;
    if (!sessionHydratedRef.current) return;
    saveSession(eventId, { mode, gate });
  }, [mode, gate, eventId]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/scanner/stats?eventId=${eventId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (isScannerStats(data)) setStats(data);
    } catch {
      /* ignore */
    }
  }, [eventId]);

  /**
   * Soft gate after any result — never call html5-qrcode pause()
   * (that freezes the last QR frame and shows English "Scanner paused").
   */
  const armAfterResult = useCallback(() => {
    resultShowingRef.current = true;
    needClearFramesRef.current = true;
    clearMissCountRef.current = 0;
    frozenFingerprintHitsRef.current = 0;
  }, []);

  const dismissResult = useCallback(() => {
    if (resultClearRef.current) {
      window.clearTimeout(resultClearRef.current);
      resultClearRef.current = null;
    }
    if (flashClearRef.current) {
      window.clearTimeout(flashClearRef.current);
      flashClearRef.current = null;
    }
    setResult(null);
    setFlash(null);
    resultShowingRef.current = false;
    needClearFramesRef.current = true;
    clearMissCountRef.current = 0;
  }, []);

  const runScan = useCallback(
    async (rawToken: string, source: "camera" | "manual" = "camera") => {
      const cleaned = rawToken.trim();
      if (cleaned.length < 10) return;

      const now = Date.now();
      if (scanInFlightRef.current) return;
      if (resultShowingRef.current) return;

      if (source === "camera") {
        if (softPausedRef.current) return;
        if (needClearFramesRef.current) return;
        if (lastScanAt.current > 0 && now - lastScanAt.current < SCAN_COOLDOWN_MS) return;
        const last = lastDecodedRef.current;
        if (last && last.raw === cleaned && now - last.at < SAME_CODE_LOCK_MS) {
          return;
        }
        const frame = sampleVideoFrame();
        if (!frame.ok) return;
        if (
          lastFingerprintRef.current &&
          frame.fingerprint === lastFingerprintRef.current &&
          frozenFingerprintHitsRef.current >= 3
        ) {
          // Same bitmap repeatedly (frozen / black ghost) — ignore decode
          return;
        }
        lastFingerprintRef.current = frame.fingerprint;
      }

      lastScanAt.current = now;
      lastDecodedRef.current = { raw: cleaned, at: now };
      scanInFlightRef.current = true;
      setDecodeHint(null);
      armAfterResult();

      setLoading(true);
      try {
        const response = await fetch("/api/v1/scanner/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            token: cleaned,
            action: modeRef.current,
            deviceLabel: gateRef.current,
          }),
        });
        const data = await response.json();
        const scanResult: ScanResult = response.ok
          ? data
          : {
              color: "red",
              message: data?.error?.code ?? "Scan fehlgeschlagen",
              ticket: null,
            };
        setResult(scanResult);
        setFlash(scanResult.color);
        setHistory((prev) => [scanResult, ...prev].slice(0, 8));
        playScanSound(scanResult.color);
        if (scanResult.color === "green" || scanResult.color === "blue") setToken("");
        if (isScannerStats(scanResult.stats)) {
          setStats(scanResult.stats);
        }
        // Always refresh so Im Haus / OUT stay correct after check-out/in
        void refreshStats();

        if (resultClearRef.current) window.clearTimeout(resultClearRef.current);
        if (flashClearRef.current) window.clearTimeout(flashClearRef.current);
        flashClearRef.current = window.setTimeout(() => setFlash(null), 1800);
        resultClearRef.current = window.setTimeout(() => {
          setResult(null);
          resultShowingRef.current = false;
          needClearFramesRef.current = true;
          clearMissCountRef.current = 0;
        }, RESULT_HOLD_MS);
      } catch {
        setResult({
          color: "red",
          message: "Netzwerkfehler — erneut scannen",
          ticket: null,
        });
        resultShowingRef.current = true;
        playScanSound("red");
        if (resultClearRef.current) window.clearTimeout(resultClearRef.current);
        resultClearRef.current = window.setTimeout(() => {
          setResult(null);
          resultShowingRef.current = false;
          needClearFramesRef.current = true;
          clearMissCountRef.current = 0;
        }, RESULT_HOLD_MS);
      } finally {
        scanInFlightRef.current = false;
        setLoading(false);
      }
    },
    [armAfterResult, eventId, refreshStats],
  );

  const onDecoded = useCallback(
    (decoded: string) => {
      const cleaned = decoded.trim();
      if (!cleaned) return;
      if (scanInFlightRef.current) return;
      if (resultShowingRef.current) return;
      if (softPausedRef.current) return;
      if (needClearFramesRef.current) return;
      const now = Date.now();
      if (lastScanAt.current > 0 && now - lastScanAt.current < SCAN_COOLDOWN_MS) return;
      const last = lastDecodedRef.current;
      if (last && last.raw === cleaned && now - last.at < SAME_CODE_LOCK_MS) return;
      void runScan(cleaned, "camera");
    },
    [runScan],
  );

  const onScanFrameMiss = useCallback(() => {
    decodeAttemptsRef.current += 1;
    lastDecodeTickRef.current = Date.now();

    const frame = sampleVideoFrame();
    if (frame.fingerprint && frame.fingerprint === lastFingerprintRef.current) {
      frozenFingerprintHitsRef.current += 1;
    } else {
      frozenFingerprintHitsRef.current = 0;
      if (frame.ok) lastFingerprintRef.current = frame.fingerprint;
    }

    if (!frame.ok) {
      darkStreakRef.current += 1;
      if (darkStreakRef.current >= 36 && phase === "scanning") {
        setCameraDead(true);
      }
    } else {
      darkStreakRef.current = 0;
      if (cameraDead) setCameraDead(false);
    }

    if (needClearFramesRef.current) {
      // Only count a "clear" frame when no code AND video is live (not black freeze)
      if (frame.ok) {
        clearMissCountRef.current += 1;
        if (clearMissCountRef.current >= CLEAR_FRAMES_REQUIRED) {
          needClearFramesRef.current = false;
          clearMissCountRef.current = 0;
        }
      }
    }

    if (
      decodeAttemptsRef.current >= 40 &&
      lastScanAt.current === 0 &&
      Date.now() - scanningSinceRef.current > 4000
    ) {
      setDecodeHint("Kamera läuft — Code näher / ruhiger halten");
    }
  }, [cameraDead, phase]);

  const stopScannerInstance = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        /* ignore */
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
    const el = document.getElementById("tf-qr-reader");
    if (el) el.replaceChildren();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void refreshStats(), 5000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  // Tab hidden → soft-pause (no library pause). Visible again → resume cleanly.
  useEffect(() => {
    const onVisibility = () => {
      const host = document.getElementById("tf-qr-reader");
      hideLibraryPausedBanner(host);
      if (document.visibilityState === "hidden") {
        softPausedRef.current = true;
        setCameraPausedUi(true);
        return;
      }
      softPausedRef.current = false;
      setCameraPausedUi(false);
      needClearFramesRef.current = true;
      clearMissCountRef.current = 0;
      // If library somehow paused, try resume; otherwise check stream health
      const scanner = scannerRef.current;
      if (scanner) {
        try {
          // getState may exist — resume only when paused
          const state = (
            scanner as unknown as { getState?: () => number }
          ).getState?.();
          // Html5QrcodeScannerState.PAUSED === 3 typically
          if (state === 3) {
            try {
              scanner.resume();
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      }
      hideLibraryPausedBanner(host);
      const video = host?.querySelector("video") as HTMLVideoElement | null;
      const trackDead =
        !video ||
        video.readyState < 2 ||
        !(video.srcObject as MediaStream | null)?.getVideoTracks?.().some((t) => t.readyState === "live");
      if (trackDead && phase === "scanning") {
        setCameraDead(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    const gen = ++startGenRef.current;

    setCameraError(null);
    setCameraHelp(null);
    setDecodeHint(null);
    setCameraDead(false);
    setCameraPausedUi(false);
    softPausedRef.current = false;
    needClearFramesRef.current = false;
    clearMissCountRef.current = 0;
    darkStreakRef.current = 0;
    frozenFingerprintHitsRef.current = 0;
    lastFingerprintRef.current = null;
    decodeAttemptsRef.current = 0;
    lastDecodeTickRef.current = 0;
    scanningSinceRef.current = Date.now();
    getAudioCtx();
    setPhase("scanning");

    try {
      await stopScannerInstance();

      for (let i = 0; i < 30; i++) {
        if (document.getElementById("tf-qr-reader")) break;
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      }
      if (gen !== startGenRef.current) return;

      const host = document.getElementById("tf-qr-reader");
      if (!host) throw new Error("Scanner-Element fehlt");
      host.replaceChildren();

      const cameraConfigs = await buildCameraStartConfigs();
      if (gen !== startGenRef.current) return;

      let lastError: unknown = null;
      let started = false;

      for (const cameraConfig of cameraConfigs) {
        if (gen !== startGenRef.current) return;

        host.replaceChildren();
        const scanner = new Html5Qrcode("tf-qr-reader", scannerEngineConfig());
        if (gen !== startGenRef.current) {
          try {
            scanner.clear();
          } catch {
            /* ignore */
          }
          return;
        }
        scannerRef.current = scanner;

        try {
          await scanner.start(
            cameraConfig,
            SCAN_CONFIG,
            (decoded) => {
              onDecoded(decoded);
            },
            () => {
              onScanFrameMiss();
            },
          );
          started = true;
          break;
        } catch (err) {
          lastError = err;
          scannerRef.current = null;
          try {
            if (scanner.isScanning) await scanner.stop();
          } catch {
            /* ignore */
          }
          try {
            scanner.clear();
          } catch {
            /* ignore */
          }
          host.replaceChildren();
        }
      }

      if (!started) {
        throw lastError ?? new Error("Kamera nicht verfügbar");
      }

      if (gen !== startGenRef.current) {
        await stopScannerInstance();
        return;
      }

      const scanner = scannerRef.current;
      if (!scanner) throw new Error("Kamera nicht verfügbar");

      // Drop any accidental duplicate video nodes from overlapping starts
      const videos = host.querySelectorAll("video");
      videos.forEach((video, index) => {
        if (index > 0) video.remove();
      });

      // Keep video in normal flow with fill mapping — matches html5-qrcode crop math.
      // object-cover + absolute inset broke decode sampling on iOS.
      videos.forEach((video) => {
        video.style.position = "relative";
        video.style.inset = "auto";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "fill";
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
      });

      hideLibraryPausedBanner(host);

      // Soft focus only (skipped on iOS)
      window.setTimeout(() => {
        if (gen !== startGenRef.current) return;
        if (scannerRef.current === scanner) void applyBestCameraConstraints(scanner);
        hideLibraryPausedBanner(document.getElementById("tf-qr-reader"));
      }, 500);

      // If decode loop never ticks, surface it (BarcodeDetector hang / dead canvas)
      window.setTimeout(() => {
        if (gen !== startGenRef.current) return;
        if (lastScanAt.current > 0) return;
        if (lastDecodeTickRef.current === 0) {
          setDecodeHint("Decoder startet nicht — Kamera neu starten");
          setCameraDead(true);
          console.warn("[tf-scanner] no decode ticks after start");
        }
      }, 5000);
    } catch (error) {
      if (gen !== startGenRef.current) return;
      await stopScannerInstance();
      setPhase("ready");
      const classified = classifyCameraError(error);
      setCameraError(classified.message);
      setCameraHelp(classified.help);
      setShowManual(true);
    } finally {
      if (gen === startGenRef.current) startingRef.current = false;
    }
  }, [onDecoded, onScanFrameMiss, stopScannerInstance]);

  useEffect(() => {
    void startCamera();
    return () => {
      startGenRef.current += 1;
      startingRef.current = false;
      void stopScannerInstance();
      if (resultClearRef.current) window.clearTimeout(resultClearRef.current);
      if (flashClearRef.current) window.clearTimeout(flashClearRef.current);
    };
    // Restart only when switching events — not when callbacks churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function stopCamera() {
    startGenRef.current += 1;
    startingRef.current = false;
    await stopScannerInstance();
    setPhase("ready");
    setCameraDead(false);
    setCameraPausedUi(false);
  }

  async function restartCamera() {
    setCameraDead(false);
    setCameraPausedUi(false);
    softPausedRef.current = false;
    await startCamera();
  }

  async function leaveScanner() {
    if (leaving) return;
    setLeaving(true);
    saveSession(eventId, { mode: modeRef.current, gate: gateRef.current });
    startGenRef.current += 1;
    startingRef.current = false;
    await stopScannerInstance();
    setPhase("ready");
    router.push("/scanner");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    getAudioCtx();
    await runScan(token, "manual");
  }

  const meta = modeMeta(mode);
  const pct =
    stats.sold > 0 ? Math.round((stats.firstCheckedIn / stats.sold) * 100) : 0;
  const flowLabel =
    mode === "out"
      ? `IN → OUT · Im Haus ${stats.currentlyIn}`
      : mode === "in"
        ? `OUT → IN · Im Haus ${stats.currentlyIn}`
        : `Info · Im Haus ${stats.currentlyIn}`;

  const phoneShell = (
    <div className="flex min-h-[100dvh] w-full flex-col bg-[#0B1220] text-white md:min-h-0 md:overflow-hidden md:rounded-2xl md:border md:border-[var(--tf-line)] md:shadow-[var(--tf-shadow)]">
      <header className="shrink-0 bg-[#12305a] px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] md:rounded-t-2xl md:pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight">{meta.title}</p>
            <p className="mt-0.5 text-sm text-white/80">{meta.hint}</p>
          </div>
          <button
            type="button"
            disabled={leaving}
            onClick={() => void leaveScanner()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/90 ring-1 ring-white/25 transition hover:bg-white/10 disabled:opacity-60"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
            {leaving ? "Beende…" : "Zurück"}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <p className="min-w-0 truncate font-medium tabular-nums">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#22c55e]" />
            {flowLabel}
            <span className="text-white/55">
              {" "}
              ({pct}%, {stats.firstCheckedIn}/{stats.sold})
            </span>
          </p>
          <p
            className={`inline-flex shrink-0 items-center gap-1 font-semibold ${
              online ? "text-[#4ade80]" : "text-[#f87171]"
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />
            {online ? "OK" : "Offline"}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 md:justify-center">
          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              className="rounded-lg p-2 text-white/90 hover:bg-white/10"
              aria-label="Modus wechseln"
              onClick={() =>
                setMode((m) => (m === "in" ? "out" : m === "out" ? "info" : "in"))
              }
            >
              <ArrowLeftRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-white/90 hover:bg-white/10"
              aria-label="Einstellungen"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </div>
          <p className="truncate text-center text-xs font-semibold tracking-wide text-[var(--tf-teal)]">
            Ticketfeeling · {eventName}
          </p>
          <div className="w-[72px] md:hidden" />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs md:hidden">
          <div className="rounded-lg bg-white/10 px-2 py-2 ring-1 ring-[var(--tf-teal)]/50">
            <p className="text-white/60">Im Haus</p>
            <p className="text-lg font-bold tabular-nums">{stats.currentlyIn}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-2">
            <p className="text-white/60">OUT</p>
            <p className="text-lg font-bold tabular-nums">{stats.currentlyOut}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-2">
            <p className="text-white/60">Offen</p>
            <p className="text-lg font-bold tabular-nums">{stats.notArrived}</p>
          </div>
        </div>

        {showSettings ? (
          <div className="mt-2 space-y-2 rounded-xl bg-black/25 p-3 md:hidden">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Eingang / Gerät</span>
              <input
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-[var(--tf-teal)]"
                value={gate}
                onChange={(e) => setGate(e.target.value)}
                placeholder="Eingang Haupt"
              />
            </label>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leaveScanner()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10 disabled:opacity-60"
            >
              Scanner beenden
            </button>
          </div>
        ) : null}
      </header>

      <div
        className={`relative min-h-0 flex-1 border-[7px] transition-colors duration-150 ${flashBorder(flash)}`}
      >
        <div
          id="tf-qr-reader"
          className="tf-qr-reader relative h-full min-h-[48vh] w-full overflow-hidden bg-black md:min-h-[420px]"
        />
        {phase === "scanning" ? <ScanGuide /> : null}

        {phase === "scanning" && decodeHint && !cameraDead && !cameraPausedUi ? (
          <p className="absolute left-3 right-3 top-3 z-20 rounded-lg bg-black/55 px-3 py-2 text-center text-xs font-medium text-white/90 ring-1 ring-white/20">
            {decodeHint}
          </p>
        ) : null}

        {phase === "scanning" && cameraPausedUi && !cameraDead ? (
          <button
            type="button"
            className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center"
            onClick={() => {
              softPausedRef.current = false;
              setCameraPausedUi(false);
              needClearFramesRef.current = true;
              clearMissCountRef.current = 0;
              const scanner = scannerRef.current;
              try {
                scanner?.resume();
              } catch {
                /* ignore */
              }
              hideLibraryPausedBanner(document.getElementById("tf-qr-reader"));
            }}
          >
            <p className="text-lg font-semibold text-white">Kamera pausiert</p>
            <p className="max-w-xs text-sm text-white/80">Tippen zum Fortsetzen</p>
          </button>
        ) : null}

        {phase === "scanning" && cameraDead ? (
          <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
            <p className="text-lg font-semibold text-white">Kamera unterbrochen</p>
            <p className="max-w-sm text-sm text-white/75">
              Bild ist schwarz oder der Stream ist weg. Neu starten, dann weiter scannen.
            </p>
            <button
              type="button"
              className="rounded-2xl bg-[var(--tf-teal)] px-6 py-3.5 text-base font-semibold text-[#0B1220]"
              onClick={() => void restartCamera()}
            >
              Kamera neu starten
            </button>
          </div>
        ) : null}

        {phase === "ready" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#111827] px-6 text-center">
            {cameraError ? (
              <>
                <p className="text-lg font-semibold text-white">{cameraError}</p>
                {cameraHelp ? (
                  <p className="max-w-sm text-sm leading-relaxed text-white/75">
                    {cameraHelpText(cameraHelp)}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="rounded-2xl bg-[var(--tf-teal)] px-6 py-3.5 text-base font-semibold text-[#0B1220]"
                  onClick={() => void startCamera()}
                >
                  Erneut versuchen
                </button>
                <p className="max-w-sm text-xs text-white/55">
                  Alternativ unten manuell eingeben — du bleibst nicht stecken.
                </p>
              </>
            ) : (
              <>
                <p className="max-w-sm text-sm text-white/75">
                  Kamera aktivieren — der Browser fragt nach dem Zugriff.
                </p>
                <button
                  type="button"
                  className="rounded-2xl bg-[var(--tf-teal)] px-6 py-3.5 text-base font-semibold text-[#0B1220]"
                  onClick={() => void startCamera()}
                >
                  Kamera aktivieren
                </button>
              </>
            )}
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leaveScanner()}
              className="text-sm font-medium text-white/70 underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
            >
              Zurück zur Event-Auswahl
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="absolute bottom-3 right-3 z-20 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/30"
            onClick={() => void stopCamera()}
          >
            Stop
          </button>
        )}

        {result ? (
          <div
            className={`absolute inset-x-0 bottom-0 z-30 px-3 pb-3 pt-16 ${
              result.color === "green" || result.color === "blue"
                ? "bg-gradient-to-t from-[#14532d]/95 via-[#14532d]/70 to-transparent"
                : result.color === "orange"
                  ? "bg-gradient-to-t from-[#7c2d12]/95 via-[#7c2d12]/70 to-transparent"
                  : "bg-gradient-to-t from-[#7f1d1d]/95 via-[#7f1d1d]/70 to-transparent"
            }`}
            role="status"
            aria-live="assertive"
          >
            <div className={`rounded-2xl px-4 py-4 text-center shadow-xl ${resultPanel(result.color)}`}>
              <p className="text-3xl font-bold tracking-tight">{result.message}</p>
              {result.ticket ? (
                <div className="mt-2 space-y-0.5 text-sm">
                  <p className="font-semibold">{result.ticket.ticketNumber}</p>
                  <p className="opacity-95">
                    {result.ticket.categorySnapshot}
                    {result.salesChannelLabel ? ` · ${result.salesChannelLabel}` : ""}
                  </p>
                  <p className="opacity-95">{presenceDe(result.ticket.presence)}</p>
                  {result.ticket.holderName ? (
                    <p className="opacity-90">{result.ticket.holderName}</p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="mt-3 rounded-xl bg-black/25 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30"
                onClick={() => dismissResult()}
              >
                Weiter scannen
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-white text-[#0F2747] pb-[max(0.5rem,env(safe-area-inset-bottom))] md:rounded-b-2xl">
        <nav className="grid grid-cols-3" aria-label="Scan-Modus">
          {(
            [
              { id: "in" as const, label: "Check-In", Icon: LogIn },
              { id: "info" as const, label: "Infomodus", Icon: Info },
              { id: "out" as const, label: "Check-Out", Icon: LogOut },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                className={`flex flex-col items-center gap-1 px-2 py-3 text-xs font-semibold transition ${
                  active ? "bg-[rgba(20,184,166,0.12)] text-[var(--tf-teal-hover)]" : "text-slate-500"
                }`}
                onClick={() => {
                  getAudioCtx();
                  dismissResult();
                  setMode(id);
                  needClearFramesRef.current = true;
                  clearMissCountRef.current = 0;
                }}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 pt-2 md:hidden">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[var(--tf-navy)] hover:bg-slate-50"
            onClick={() => {
              getAudioCtx();
              setShowManual((v) => !v);
            }}
          >
            {showManual ? <X className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
            {showManual ? "Eingabe schließen" : "Manuelle Eingabe"}
          </button>

          {showManual ? (
            <form onSubmit={onSubmit} className="space-y-2 pb-3 pt-1">
              <input
                id="token"
                className="w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-sm outline-none focus:border-[var(--tf-teal)]"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="QR-Token eintippen"
                autoComplete="off"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-[var(--tf-navy)] py-3 text-sm font-semibold text-white disabled:opacity-50"
                disabled={loading || !token.trim()}
              >
                {loading ? "Prüfe…" : "Manuell prüfen"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-[minmax(320px,390px)_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-xl md:mx-0 md:max-w-[390px]">{phoneShell}</div>

      {/* Desktop info column */}
      <aside className="hidden md:grid md:gap-4">
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                Event
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--tf-navy)]">{eventName}</h2>
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                {meta.title} · {flowLabel}
              </p>
            </div>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leaveScanner()}
              className="tf-btn tf-btn-secondary !min-h-9 shrink-0 !px-3 text-sm"
            >
              {leaving ? "Beende…" : "Scanner beenden"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Im Haus", stats.currentlyIn, true],
              ["OUT", stats.currentlyOut, false],
              ["Noch nicht da", stats.notArrived, false],
              ["Verkauft", stats.sold, false],
            ].map(([label, value, highlight]) => (
              <div
                key={String(label)}
                className={`rounded-xl px-3 py-2.5 ${
                  highlight
                    ? "border-2 border-[var(--tf-teal)] bg-[rgba(20,184,166,0.1)]"
                    : "bg-[rgba(15,39,71,0.04)]"
                }`}
              >
                <p className="text-[11px] text-[var(--tf-text-secondary)]">{label}</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--tf-navy)]">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
            Online {stats.soldOnline} · Tageskasse {stats.soldBoxOffice} · Eingecheckt{" "}
            {stats.firstCheckedIn} ({pct}%)
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            result
              ? `${resultPanel(result.color)} border-transparent text-white`
              : "border-[var(--tf-line)] bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.14em] ${
              result ? "text-white/80" : "text-[var(--tf-text-secondary)]"
            }`}
          >
            Letztes Ergebnis
          </p>
          {result ? (
            <>
              <p className="mt-2 text-3xl font-bold tracking-tight">{result.message}</p>
              {result.ticket ? (
                <div className="mt-2 space-y-1 text-sm opacity-95">
                  <p className="font-semibold">{result.ticket.ticketNumber}</p>
                  <p>
                    {result.ticket.categorySnapshot}
                    {result.salesChannelLabel ? ` · ${result.salesChannelLabel}` : ""}
                  </p>
                  <p>{presenceDe(result.ticket.presence)}</p>
                  {result.ticket.holderName ? <p>{result.ticket.holderName}</p> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
              Noch kein Scan — Ergebnis erscheint hier und auf dem Kamerabild.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[var(--tf-navy)]">Letzte Scans</h3>
          {history.length > 0 ? (
            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
              {history.map((item, index) => (
                <li
                  key={`${item.ticket?.ticketNumber ?? "x"}-${index}`}
                  className="flex justify-between gap-2 border-b border-[var(--tf-line)] pb-2 last:border-0"
                >
                  <span>
                    <span
                      className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                        item.color === "green" || item.color === "blue"
                          ? "bg-[#22c55e]"
                          : item.color === "orange"
                            ? "bg-[#fb923c]"
                            : "bg-[#f87171]"
                      }`}
                    />
                    {item.message}
                    {item.ticket ? ` · ${item.ticket.ticketNumber}` : ""}
                  </span>
                  <span className="shrink-0 text-[var(--tf-text-secondary)]">
                    {item.salesChannelLabel ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">Noch keine Scans in dieser Session.</p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-sm space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
              Einstellungen & Fallback
            </p>
            <label className="mt-2 grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Eingang / Gerät</span>
              <input
                className="tf-input"
                value={gate}
                onChange={(e) => setGate(e.target.value)}
                placeholder="Eingang Haupt"
              />
            </label>
          </div>
          <form onSubmit={onSubmit} className="space-y-2">
            <label className="grid gap-1 text-sm" htmlFor="token-desktop">
              <span className="text-[var(--tf-text-secondary)]">Manuelle Eingabe</span>
              <input
                id="token-desktop"
                className="tf-input font-mono text-sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="QR-Token eintippen"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="tf-btn tf-btn-secondary w-full"
              disabled={loading || !token.trim()}
            >
              {loading ? "Prüfe…" : "Manuell prüfen"}
            </button>
          </form>
          <button
            type="button"
            disabled={leaving}
            onClick={() => void leaveScanner()}
            className="tf-btn tf-btn-secondary w-full"
          >
            {leaving ? "Beende…" : "Zurück zur Event-Auswahl"}
          </button>
        </div>
      </aside>
    </div>
  );
}
