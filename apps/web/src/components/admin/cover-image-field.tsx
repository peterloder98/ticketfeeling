"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ZoomIn, Check } from "lucide-react";
import { normalizeCoverImageUrl } from "@/lib/commerce/event-cover";
import { ResponsiveImage } from "@/components/responsive-image";

/** On-screen crop preview (CSS/display only). */
const PREVIEW_SIZE = 320;
/** Export resolution — must match server COVER_SIZE_PX for sharp covers. */
const OUT_SIZE = 1600;
/** Downscale source before crop UI so large phone photos don't freeze the tab. */
const PREVIEW_MAX = 2400;

type Props = {
  name?: string;
  initialUrl?: string | null;
  eventId?: string;
  tourId?: string;
  /** Preview when no own cover is set (e.g. tour poster). */
  inheritUrl?: string | null;
  inheritLabel?: string;
  /** Field label above the control */
  label?: string;
  /** Which Event column to persist (cover vs optional ticket hero) */
  persistField?: "coverImageUrl" | "ticketHeroImageUrl";
  /** When false, skip router.refresh (required in create wizard — refresh remounts and wipes state). */
  refreshOnUpload?: boolean;
  onUploaded?: (url: string) => void;
  onCleared?: () => void;
};

async function fileToDownscaledDataUrl(file: File): Promise<{ src: string; w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
      ctx.drawImage(bitmap, 0, 0, w, h);
      return { src: canvas.toDataURL("image/jpeg", 0.9), w, h };
    } finally {
      bitmap.close();
    }
  }

  // Fallback
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("IMAGE_FAILED"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
  ctx.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL("image/jpeg", 0.9), w, h };
}

export function CoverImageField({
  name = "coverImageUrl",
  initialUrl,
  eventId,
  tourId,
  inheritUrl,
  inheritLabel = "Tour-Plakat",
  label = "Cover-Bild",
  persistField = "coverImageUrl",
  refreshOnUpload = true,
  onUploaded,
  onCleared,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [source, setSource] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const minZoom = 1;
  const maxZoom = 3;

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei wählen (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Maximal 12 MB.");
      return;
    }
    setError(null);
    setPreparing(true);
    try {
      const { src, w, h } = await fileToDownscaledDataUrl(file);
      setImgSize({ w, h });
      setSource(src);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      setError("Bild konnte nicht geladen werden. Bitte anderes Format versuchen.");
    } finally {
      setPreparing(false);
    }
  }, []);

  function coverMetrics(z: number) {
    if (!imgSize.w || !imgSize.h) {
      return { drawW: PREVIEW_SIZE, drawH: PREVIEW_SIZE, baseScale: 1 };
    }
    const baseScale = Math.max(PREVIEW_SIZE / imgSize.w, PREVIEW_SIZE / imgSize.h);
    const scale = baseScale * z;
    return {
      drawW: imgSize.w * scale,
      drawH: imgSize.h * scale,
      baseScale,
    };
  }

  function clampOffset(x: number, y: number, z: number) {
    const { drawW, drawH } = coverMetrics(z);
    const maxX = Math.max(0, (drawW - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (drawH - PREVIEW_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  useEffect(() => {
    if (!source || !canvasRef.current || !imgSize.w) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      const { drawW, drawH } = coverMetrics(zoom);
      ctx.fillStyle = "#0f2747";
      ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      const dx = (PREVIEW_SIZE - drawW) / 2 + offset.x;
      const dy = (PREVIEW_SIZE - drawH) / 2 + offset.y;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    };
    img.src = source;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, zoom, offset, imgSize]);

  async function uploadCrop() {
    if (!source || !imgSize.w) return;
    setUploading(true);
    setError(null);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("IMAGE_FAILED"));
        el.src = source;
      });

      const { drawW, drawH } = coverMetrics(zoom);
      const scale = OUT_SIZE / PREVIEW_SIZE;
      const out = document.createElement("canvas");
      out.width = OUT_SIZE;
      out.height = OUT_SIZE;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
      ctx.fillStyle = "#0f2747";
      ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
      const dx = ((PREVIEW_SIZE - drawW) / 2 + offset.x) * scale;
      const dy = ((PREVIEW_SIZE - drawH) / 2 + offset.y) * scale;
      ctx.drawImage(img, dx, dy, drawW * scale, drawH * scale);

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("ENCODE_FAILED"))),
          "image/jpeg",
          0.92,
        );
      });
      const body = new FormData();
      body.append("file", blob, "cover.jpg");
      if (eventId) body.append("eventId", eventId);
      if (tourId) body.append("tourId", tourId);
      if (persistField !== "coverImageUrl") body.append("field", persistField);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/v1/admin/uploads/cover", {
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
      setSource(null);
      onUploaded?.(nextUrl);
      // Never refresh on create wizard — remount wipes all form state.
      if (refreshOnUpload && (eventId || tourId)) {
        router.refresh();
      }
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

  async function clearOwnCover() {
    setError(null);
    if (eventId || tourId) {
      setUploading(true);
      try {
        const body = new FormData();
        body.append("clear", "1");
        if (eventId) body.append("eventId", eventId);
        if (tourId) body.append("tourId", tourId);
        if (persistField !== "coverImageUrl") body.append("field", persistField);
        const res = await fetch("/api/v1/admin/uploads/cover", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.code ?? "CLEAR_FAILED");
        // Event clear restores tour poster URL; tour clear returns null.
        setUrl(typeof data?.url === "string" ? data.url : "");
        onCleared?.();
        if (refreshOnUpload) router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Entfernen fehlgeschlagen");
      } finally {
        setUploading(false);
      }
      return;
    }
    setUrl("");
    onCleared?.();
  }

  const inherit = normalizeCoverImageUrl(inheritUrl) ?? "";
  const ownUrl = normalizeCoverImageUrl(url) ?? "";
  const inherited = Boolean(inherit && (!ownUrl || ownUrl === inherit));
  const showingOwn = Boolean(ownUrl && ownUrl !== inherit);

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name={name} value={inherited ? "" : ownUrl} />
      <p className="text-sm font-medium text-[var(--tf-navy)]">{label}</p>

      {showingOwn && !source ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] p-3">
          <ResponsiveImage
            src={ownUrl}
            alt=""
            className="h-16 w-16 rounded-xl"
            fallback="event"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tf-navy)]">
              <Check className="h-4 w-4 text-[var(--tf-teal)]" /> Eigenes Cover
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-teal)] underline"
                onClick={() => fileRef.current?.click()}
              >
                Anderes Bild wählen
              </button>
              {inherit ? (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
                  disabled={uploading}
                  onClick={() => void clearOwnCover()}
                >
                  {inheritLabel} verwenden
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
                  disabled={uploading}
                  onClick={() => void clearOwnCover()}
                >
                  Cover entfernen
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {inherited && !source ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
          <ResponsiveImage
            src={inherit}
            alt=""
            className="h-16 w-16 rounded-xl"
            fallback="event"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--tf-navy)]">{inheritLabel}</p>
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Standard für diesen Termin. Optional unten ein abweichendes Cover hochladen.
            </p>
            <button
              type="button"
              className="mt-1 text-xs font-medium text-[var(--tf-teal)] underline"
              onClick={() => fileRef.current?.click()}
            >
              Abweichendes Cover für diesen Termin
            </button>
          </div>
        </div>
      ) : null}

      {preparing ? (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-4 text-sm text-[var(--tf-text-secondary)]">
          Bild wird vorbereitet…
        </p>
      ) : null}

      {source ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--tf-navy)]">
            Ausschnitt wählen (quadratisch)
          </p>
          <div
            className="relative mx-auto touch-none overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-[var(--tf-navy)]"
            style={{ width: "min(100%, 320px)", aspectRatio: "1 / 1" }}
            onPointerDown={(e) => {
              setDragging(true);
              setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging) return;
              setOffset(clampOffset(e.clientX - dragStart.x, e.clientY - dragStart.y, zoom));
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
          >
            <canvas
              ref={canvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              className="h-full w-full cursor-grab active:cursor-grabbing"
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <ZoomIn className="h-4 w-4 text-[var(--tf-text-secondary)]" />
            <span className="w-16 text-[var(--tf-text-secondary)]">Zoom</span>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setOffset((prev) => clampOffset(prev.x, prev.y, z));
              }}
              className="flex-1 accent-[var(--tf-teal)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="tf-btn tf-btn-primary !min-h-10 text-sm"
              disabled={uploading}
              onClick={() => void uploadCrop()}
            >
              {uploading ? "Wird hochgeladen…" : "Einpassen & hochladen"}
            </button>
            <button
              type="button"
              className="tf-btn tf-btn-secondary !min-h-10 text-sm"
              disabled={uploading}
              onClick={() => setSource(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : !showingOwn && !inherited ? (
        <div className="space-y-2">
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
              if (file) void loadFile(file);
            }}
            className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragOver
                ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                : "border-[var(--tf-line)] bg-[#f8fafc] hover:border-[var(--tf-teal)]"
            }`}
          >
            <Upload className="h-8 w-8 text-[var(--tf-teal)]" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-[var(--tf-navy)]">
              Bild hierher ziehen oder klicken
            </p>
            <p className="max-w-xs text-xs text-[var(--tf-text-secondary)]">
              Speichert {OUT_SIZE}×{OUT_SIZE}px (Retina). Anzeige max. 444×444px. Max. 12 MB.
            </p>
          </div>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
