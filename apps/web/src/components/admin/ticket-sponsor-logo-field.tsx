"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";
import {
  clampSponsorLogoScale,
  SPONSOR_LOGO_SCALE_MAX,
  SPONSOR_LOGO_SCALE_MIN,
  sponsorLogoBoxForScale,
  TICKET_SPONSOR_LOGO_MAX_H_PX,
  TICKET_SPONSOR_LOGO_MAX_W_PX,
} from "@/lib/commerce/ticket-presentation";

/** Display hint — must match server SPONSOR_LOGO_MAX_* in optimize-sponsor-logo. */
const SPONSOR_LOGO_MAX_WIDTH = 480;
const SPONSOR_LOGO_MAX_HEIGHT = 160;

/** Preview stub is ~55% of live ticket QR column proportions. */
const PREVIEW_ZONE_H = 56;
const PREVIEW_STUB_W = 118;

type SponsorField = "ticketSponsorLogoAboveUrl" | "ticketSponsorLogoBelowUrl";

type Props = {
  field: SponsorField;
  label: string;
  eventId: string;
  initialUrl?: string | null;
  initialScale?: number | null;
  hint?: string;
};

function qualityWarns(
  naturalW: number,
  naturalH: number,
  displayMaxW: number,
  displayMaxH: number,
): boolean {
  if (naturalW <= 0 || naturalH <= 0) return false;
  // Upscaling beyond source px looks soft on ticket + print.
  return displayMaxW > naturalW + 1 || displayMaxH > naturalH + 1;
}

export function TicketSponsorLogoField({
  field,
  label,
  eventId,
  initialUrl,
  initialScale,
  hint,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [scale, setScale] = useState(() => clampSponsorLogoScale(initialScale ?? 1));
  const [savedScale, setSavedScale] = useState(() =>
    clampSponsorLogoScale(initialScale ?? 1),
  );
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingScale, setSavingScale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resizeActive, setResizeActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    setUrl(initialUrl ?? "");
  }, [initialUrl]);

  useEffect(() => {
    const next = clampSponsorLogoScale(initialScale ?? 1);
    setScale(next);
    setSavedScale(next);
  }, [initialScale]);

  useEffect(() => {
    if (!url) {
      setNatural(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setNatural(null);
    img.src = url;
  }, [url]);

  const box = sponsorLogoBoxForScale(scale);
  const blurry = natural
    ? qualityWarns(natural.w, natural.h, box.maxW, box.maxH)
    : false;
  const scaleDirty = Math.abs(scale - savedScale) > 0.005;

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei wählen (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Maximal 8 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file, file.name || "sponsor-logo.png");
      body.append("field", field);
      body.append("eventId", eventId);
      body.append("scale", String(scale));

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/v1/admin/uploads/ticket-sponsor", {
          method: "POST",
          body,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.code ?? "UPLOAD_FAILED");
      const nextUrl = String(data.url ?? "");
      if (!nextUrl) throw new Error("UPLOAD_FAILED");
      setUrl(nextUrl);
      if (typeof data.width === "number" && typeof data.height === "number") {
        setNatural({ w: data.width, h: data.height });
      }
      const nextScale = clampSponsorLogoScale(data.scale ?? scale);
      setScale(nextScale);
      setSavedScale(nextScale);
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Upload zu langsam — bitte kleineres Bild oder erneut versuchen.");
      } else {
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      }
    } finally {
      setUploading(false);
    }
  }

  async function saveScale(next: number) {
    const clamped = clampSponsorLogoScale(next);
    setSavingScale(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("field", field);
      body.append("eventId", eventId);
      body.append("scale", String(clamped));
      const res = await fetch("/api/v1/admin/uploads/ticket-sponsor", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.code ?? "SCALE_FAILED");
      const saved = clampSponsorLogoScale(data.scale ?? clamped);
      setScale(saved);
      setSavedScale(saved);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Größe speichern fehlgeschlagen");
    } finally {
      setSavingScale(false);
    }
  }

  async function clearLogo() {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("clear", "1");
      body.append("field", field);
      body.append("eventId", eventId);
      const res = await fetch("/api/v1/admin/uploads/ticket-sponsor", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.code ?? "CLEAR_FAILED");
      setUrl("");
      setScale(1);
      setSavedScale(1);
      setNatural(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Entfernen fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!resizeActive) return;

    function onMove(e: PointerEvent) {
      const zone = zoneRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.abs(e.clientX - cx);
      const dy = Math.abs(e.clientY - cy);
      // Map distance from center to scale (corner drag ≈ half diagonal of max box).
      const maxHalfW = TICKET_SPONSOR_LOGO_MAX_W_PX / 2;
      const maxHalfH = TICKET_SPONSOR_LOGO_MAX_H_PX / 2;
      const next = clampSponsorLogoScale(
        Math.max(dx / Math.max(8, maxHalfW), dy / Math.max(8, maxHalfH)),
      );
      setScale(next);
    }

    function onUp() {
      setResizeActive(false);
      void saveScale(scaleRef.current);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // saveScale is stable enough via scaleRef; intentionally omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeActive]);

  const zoneLabel =
    field === "ticketSponsorLogoAboveUrl" ? "über dem QR" : "unter dem QR";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--tf-navy)]">{label}</p>
      {hint ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">{hint}</p>
      ) : null}

      {url ? (
        <div className="space-y-3 rounded-2xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-[var(--tf-line)] bg-white p-1.5">
              <ResponsiveImage
                src={url}
                alt=""
                fit="contain"
                className="!h-full !w-full !rounded-none"
                fallback="event"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tf-navy)]">
                <Check className="h-4 w-4 text-[var(--tf-teal)]" /> Logo hinterlegt
              </p>
              <div className="mt-1 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--tf-teal)] underline"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  Anderes Bild wählen
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
                  disabled={uploading}
                  onClick={() => void clearLogo()}
                >
                  Entfernen
                </button>
              </div>
            </div>
          </div>

          {/* Ticket-stub preview — logo always centered in its zone */}
          <div className="rounded-xl border border-[var(--tf-line)] bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
              Vorschau Ticket-Stub ({zoneLabel})
            </p>
            <div
              className="mx-auto mt-2 flex flex-col items-center rounded-lg border border-dashed border-[var(--tf-line)] bg-[#f8fafc] px-2 py-1.5"
              style={{ width: PREVIEW_STUB_W }}
            >
              {field === "ticketSponsorLogoAboveUrl" ? (
                <ResizableSponsorZone
                  zoneRef={zoneRef}
                  url={url}
                  box={box}
                  resizeActive={resizeActive}
                  onResizeStart={() => setResizeActive(true)}
                />
              ) : (
                <div className="flex h-10 w-full items-center justify-center opacity-40">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--tf-teal)]">
                    Einlass
                  </span>
                </div>
              )}

              <div className="my-1 flex h-14 w-14 items-center justify-center rounded-md bg-white shadow-sm">
                <div
                  className="h-10 w-10 rounded-sm"
                  style={{
                    background:
                      "repeating-linear-gradient(0deg,#0F2747 0 2px,transparent 2px 4px), repeating-linear-gradient(90deg,#0F2747 0 2px,transparent 2px 4px)",
                    opacity: 0.35,
                  }}
                  aria-hidden
                />
              </div>

              {field === "ticketSponsorLogoBelowUrl" ? (
                <ResizableSponsorZone
                  zoneRef={zoneRef}
                  url={url}
                  box={box}
                  resizeActive={resizeActive}
                  onResizeStart={() => setResizeActive(true)}
                />
              ) : (
                <div className="flex h-10 w-full items-center justify-center opacity-40">
                  <span className="text-[8px] text-[var(--tf-text-secondary)]">
                    Am Einlass vorzeigen.
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[var(--tf-text-secondary)]">
                Größe ({Math.round(scale * 100)} %)
                <input
                  type="range"
                  min={SPONSOR_LOGO_SCALE_MIN}
                  max={SPONSOR_LOGO_SCALE_MAX}
                  step={0.01}
                  value={scale}
                  disabled={uploading || savingScale}
                  onChange={(e) => setScale(clampSponsorLogoScale(Number(e.target.value)))}
                  onPointerUp={() => {
                    if (scaleDirty) void saveScale(scale);
                  }}
                  className="w-full accent-[var(--tf-teal)]"
                />
              </label>
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-9 !px-3 text-xs"
                disabled={!scaleDirty || uploading || savingScale}
                onClick={() => void saveScale(scale)}
              >
                {savingScale ? "Speichert…" : "Größe speichern"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--tf-text-secondary)]">
              Logo bleibt horizontal und vertikal zentriert. An der Ecke ziehen oder
              Schieberegler nutzen.
            </p>
            {blurry ? (
              <p
                role="status"
                className="mt-2 rounded-lg border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.12)] px-3 py-2 text-xs leading-relaxed text-[var(--tf-navy)]"
              >
                Achtung: Bei dieser Größe wird das Logo über die Quellauflösung
                {natural ? ` (${natural.w}×${natural.h}px)` : ""} hinaus
                vergrößert und kann unscharf wirken. Bitte ein schärferes Bild
                hochladen oder die Anzeige verkleinern.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadFile(file);
          }}
          className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
            dragOver
              ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
              : "border-[var(--tf-line)] bg-[#f8fafc] hover:border-[var(--tf-teal)]"
          }`}
        >
          <Upload className="h-6 w-6 text-[var(--tf-teal)]" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            {uploading ? "Wird hochgeladen…" : "Logo hierher ziehen oder klicken"}
          </p>
          <p className="max-w-xs text-xs text-[var(--tf-text-secondary)]">
            Max. {SPONSOR_LOGO_MAX_WIDTH}×{SPONSOR_LOGO_MAX_HEIGHT}px (WebP).
            Seitenverhältnis bleibt erhalten. Max. 8 MB.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function ResizableSponsorZone({
  zoneRef,
  url,
  box,
  resizeActive,
  onResizeStart,
}: {
  zoneRef: RefObject<HTMLDivElement | null>;
  url: string;
  box: { maxW: number; maxH: number };
  resizeActive: boolean;
  onResizeStart: () => void;
}) {
  return (
    <div
      ref={zoneRef}
      className="relative flex w-full items-center justify-center"
      style={{ height: PREVIEW_ZONE_H }}
    >
      <div
        className={`relative flex items-center justify-center ${
          resizeActive ? "ring-2 ring-[var(--tf-teal)]" : ""
        }`}
        style={{ maxWidth: box.maxW, maxHeight: box.maxH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="object-contain select-none"
          style={{
            maxWidth: box.maxW,
            maxHeight: box.maxH,
            width: "auto",
            height: "auto",
          }}
          draggable={false}
        />
        <button
          type="button"
          aria-label="Logo-Größe anpassen"
          className="absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-[var(--tf-teal)] shadow"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            onResizeStart();
          }}
        />
      </div>
    </div>
  );
}
