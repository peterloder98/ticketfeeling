"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
  imageUrl: string;
  onConfirm: (crop: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => void;
  onCancel: () => void;
};

const PREVIEW_MAX = 420;
const MIN_CROP_PX = 8;

/**
 * Free-aspect crop for sponsor logos. Rect is in natural image pixels.
 * Drag inside to move; drag corner handles to resize.
 */
export function SponsorLogoCropModal({ imageUrl, onConfirm, onCancel }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    origin: CropRect;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 2 || h < 2) {
        setError("Bild ist zu klein zum Zuschneiden.");
        return;
      }
      setNatural({ w, h });
      // Start with a centered inset so handles are visible.
      const insetX = Math.round(w * 0.08);
      const insetY = Math.round(h * 0.08);
      setCrop({
        x: insetX,
        y: insetY,
        w: Math.max(MIN_CROP_PX, w - insetX * 2),
        h: Math.max(MIN_CROP_PX, h - insetY * 2),
      });
    };
    img.onerror = () => {
      if (!cancelled) setError("Logo konnte nicht geladen werden.");
    };
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const scale = natural
    ? Math.min(1, PREVIEW_MAX / Math.max(natural.w, natural.h))
    : 1;
  const displayW = natural ? Math.max(1, Math.round(natural.w * scale)) : PREVIEW_MAX;
  const displayH = natural ? Math.max(1, Math.round(natural.h * scale)) : 200;

  function clampCrop(next: CropRect, bounds: { w: number; h: number }): CropRect {
    let { x, y, w, h } = next;
    w = Math.max(MIN_CROP_PX, Math.min(bounds.w, w));
    h = Math.max(MIN_CROP_PX, Math.min(bounds.h, h));
    x = Math.max(0, Math.min(bounds.w - w, x));
    y = Math.max(0, Math.min(bounds.h - h, y));
    return { x, y, w, h };
  }

  function onPointerDown(
    e: ReactPointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...crop },
    };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !natural) return;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      const o = drag.origin;
      let next: CropRect = { ...o };

      if (drag.mode === "move") {
        next = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
      } else if (drag.mode === "se") {
        next = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      } else if (drag.mode === "sw") {
        next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
      } else if (drag.mode === "ne") {
        next = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
      } else if (drag.mode === "nw") {
        next = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
      }

      // Normalize negative sizes from reverse drag.
      if (next.w < 0) {
        next.x += next.w;
        next.w = Math.abs(next.w);
      }
      if (next.h < 0) {
        next.y += next.h;
        next.h = Math.abs(next.h);
      }

      setCrop(clampCrop(next, natural));
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [natural, scale]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,39,71,0.55)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sponsor-crop-title"
      onClick={onCancel}
    >
      <div
        className="tf-card w-full max-w-lg !p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sponsor-crop-title"
          className="text-lg font-semibold text-[var(--tf-navy)]"
        >
          Logo zuschneiden
        </h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Rahmen verschieben oder an den Ecken ziehen. Der zugeschnittene Bereich
          ersetzt das Logo auf Ticket, PDF und Vorschau.
        </p>

        {error ? (
          <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>
        ) : natural && crop ? (
          <div className="mt-4 flex justify-center">
            <div
              className="relative select-none overflow-hidden rounded-xl border border-[var(--tf-line)] bg-[#f8fafc]"
              style={{ width: displayW, height: displayH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
              />
              {/* Dim outside crop (four panels) */}
              <div
                className="pointer-events-none absolute left-0 top-0 bg-[rgba(15,39,71,0.45)]"
                style={{ width: displayW, height: crop.y * scale }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-[rgba(15,39,71,0.45)]"
                style={{
                  top: (crop.y + crop.h) * scale,
                  width: displayW,
                  height: Math.max(0, displayH - (crop.y + crop.h) * scale),
                }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-[rgba(15,39,71,0.45)]"
                style={{
                  top: crop.y * scale,
                  width: crop.x * scale,
                  height: crop.h * scale,
                }}
              />
              <div
                className="pointer-events-none absolute bg-[rgba(15,39,71,0.45)]"
                style={{
                  top: crop.y * scale,
                  left: (crop.x + crop.w) * scale,
                  width: Math.max(0, displayW - (crop.x + crop.w) * scale),
                  height: crop.h * scale,
                }}
              />
              <div
                className="absolute cursor-move border-2 border-[var(--tf-teal)]"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.w * scale,
                  height: crop.h * scale,
                }}
                onPointerDown={(e) => onPointerDown(e, "move")}
              >
                {(
                  [
                    ["nw", "-left-1.5 -top-1.5 cursor-nwse-resize"],
                    ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"],
                    ["sw", "-left-1.5 -bottom-1.5 cursor-nesw-resize"],
                    ["se", "-right-1.5 -bottom-1.5 cursor-nwse-resize"],
                  ] as const
                ).map(([corner, cls]) => (
                  <button
                    key={corner}
                    type="button"
                    aria-label={`Ecke ${corner}`}
                    className={`absolute h-3 w-3 rounded-sm border-2 border-white bg-[var(--tf-teal)] shadow ${cls}`}
                    onPointerDown={(e) => onPointerDown(e, corner)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--tf-text-secondary)]">Lädt…</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="tf-btn tf-btn-secondary !min-h-10" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10"
            disabled={!crop || !natural || Boolean(error)}
            onClick={() => {
              if (!crop) return;
              onConfirm({
                left: Math.round(crop.x),
                top: Math.round(crop.y),
                width: Math.round(crop.w),
                height: Math.round(crop.h),
              });
            }}
          >
            Zuschchnitt speichern
          </button>
        </div>
      </div>
    </div>
  );
}
