"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";

/** Downscale source before crop UI so large phone photos don't freeze the tab. */
const PREVIEW_MAX = 1600;

export type ArtistCropKind = "profile" | "header";

const CROP: Record<
  ArtistCropKind,
  { aspect: number; outW: number; outH: number; previewMaxW: number; label: string }
> = {
  profile: {
    aspect: 1,
    outW: 1000,
    outH: 1000,
    previewMaxW: 320,
    label: "Profilbild (quadratisch)",
  },
  header: {
    aspect: 2,
    outW: 1800,
    outH: 900,
    previewMaxW: 420,
    label: "Header (Querformat 2∶1)",
  },
};

type Props = {
  kind: ArtistCropKind;
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
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

export function ArtistImageCropModal({ kind, file, onConfirm, onCancel }: Props) {
  const cfg = CROP[kind];
  const previewW = cfg.previewMaxW;
  const previewH = Math.round(previewW / cfg.aspect);

  const [source, setSource] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [preparing, setPreparing] = useState(true);
  const [encoding, setEncoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const minZoom = 1;
  const maxZoom = 3;

  useEffect(() => {
    let cancelled = false;
    setPreparing(true);
    setError(null);
    void fileToDownscaledDataUrl(file)
      .then(({ src, w, h }) => {
        if (cancelled) return;
        setImgSize({ w, h });
        setSource(src);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => {
        if (!cancelled) setError("Bild konnte nicht geladen werden. Bitte anderes Format versuchen.");
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !encoding) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [encoding, onCancel]);

  function coverMetrics(z: number) {
    if (!imgSize.w || !imgSize.h) {
      return { drawW: previewW, drawH: previewH, baseScale: 1 };
    }
    const baseScale = Math.max(previewW / imgSize.w, previewH / imgSize.h);
    const scale = baseScale * z;
    return {
      drawW: imgSize.w * scale,
      drawH: imgSize.h * scale,
      baseScale,
    };
  }

  function clampOffset(x: number, y: number, z: number) {
    const { drawW, drawH } = coverMetrics(z);
    const maxX = Math.max(0, (drawW - previewW) / 2);
    const maxY = Math.max(0, (drawH - previewH) / 2);
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
      ctx.fillRect(0, 0, previewW, previewH);
      const dx = (previewW - drawW) / 2 + offset.x;
      const dy = (previewH - drawH) / 2 + offset.y;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    };
    img.src = source;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, zoom, offset, imgSize, previewW, previewH]);

  async function confirm() {
    if (!source || !imgSize.w) return;
    setEncoding(true);
    setError(null);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("IMAGE_FAILED"));
        el.src = source;
      });

      const { drawW, drawH } = coverMetrics(zoom);
      const scaleX = cfg.outW / previewW;
      const scaleY = cfg.outH / previewH;
      const out = document.createElement("canvas");
      out.width = cfg.outW;
      out.height = cfg.outH;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
      ctx.fillStyle = "#0f2747";
      ctx.fillRect(0, 0, cfg.outW, cfg.outH);
      const dx = ((previewW - drawW) / 2 + offset.x) * scaleX;
      const dy = ((previewH - drawH) / 2 + offset.y) * scaleY;
      ctx.drawImage(img, dx, dy, drawW * scaleX, drawH * scaleY);

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("ENCODE_FAILED"))),
          "image/jpeg",
          0.9,
        );
      });
      onConfirm(blob);
    } catch {
      setError("Ausschnitt konnte nicht erzeugt werden.");
      setEncoding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,39,71,0.55)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artist-crop-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !encoding) onCancel();
      }}
    >
      <div className="tf-card w-full max-w-md space-y-4 p-5 shadow-[var(--tf-shadow)]">
        <div>
          <h2 id="artist-crop-title" className="text-lg font-semibold text-[var(--tf-navy)]">
            Ausschnitt wählen
          </h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{cfg.label}</p>
        </div>

        {preparing ? (
          <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-8 text-center text-sm text-[var(--tf-text-secondary)]">
            Bild wird vorbereitet…
          </p>
        ) : source ? (
          <>
            <div
              className="relative mx-auto touch-none overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-[var(--tf-navy)]"
              style={{ width: "min(100%, " + previewW + "px)", aspectRatio: `${cfg.aspect} / 1` }}
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
                width={previewW}
                height={previewH}
                className="h-full w-full cursor-grab active:cursor-grabbing"
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <ZoomIn className="h-4 w-4 shrink-0 text-[var(--tf-text-secondary)]" />
              <span className="w-12 text-[var(--tf-text-secondary)]">Zoom</span>
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
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Ziehen zum Verschieben · Zoom für den Ausschnitt
            </p>
          </>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10 text-sm"
            disabled={preparing || !source || encoding}
            onClick={() => void confirm()}
          >
            {encoding ? "Wird übernommen…" : "Übernehmen"}
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-secondary !min-h-10 text-sm"
            disabled={encoding}
            onClick={onCancel}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
