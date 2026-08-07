import { EMBED_FRAME_MAX_HEIGHT, EMBED_FRAME_WIDTH } from "@/lib/embed/public-url";

/** Width presets for organizer iframe snippets (px or full). */
export type EmbedWidthPreset = "standard" | "wider" | "full";

/** Height mode: fixed frame vs postMessage auto-resize. */
export type EmbedHeightMode = "fixed" | "auto";

export const EMBED_WIDTH_PRESETS: Record<
  EmbedWidthPreset,
  { label: string; hint: string; widthPx: number | null }
> = {
  standard: {
    label: "Standard",
    hint: "Bewährte Breite",
    widthPx: EMBED_FRAME_WIDTH,
  },
  wider: {
    label: "Breiter",
    hint: "Etwas mehr Platz",
    widthPx: 560,
  },
  full: {
    label: "Volle Breite",
    hint: "100 % der Website",
    widthPx: null,
  },
};

export const EMBED_HEIGHT_MODES: Record<
  EmbedHeightMode,
  { label: string; hint: string }
> = {
  fixed: {
    label: "Fest",
    hint: "Feste Höhe, Scrollen im Frame",
  },
  auto: {
    label: "Automatisch",
    hint: "Höhe passt sich dem Inhalt an",
  },
};

export const DEFAULT_EMBED_WIDTH: EmbedWidthPreset = "standard";
export const DEFAULT_EMBED_HEIGHT: EmbedHeightMode = "fixed";

/** Default fixed iframe heights (nothing smaller). */
export const EMBED_FIXED_HEIGHT_EVENT = 520;
export const EMBED_FIXED_HEIGHT_SHOP = 560;

/** Soft cap when auto-resizing so the host page stays usable. */
export const EMBED_AUTO_MAX_HEIGHT = Math.max(EMBED_FRAME_MAX_HEIGHT, 1200);

export function embedWidthCss(preset: EmbedWidthPreset): string {
  const px = EMBED_WIDTH_PRESETS[preset].widthPx;
  if (px == null) return "width:100%;max-width:100%;";
  return `width:${px}px;max-width:100%;`;
}

export function embedPreviewWidthClass(preset: EmbedWidthPreset): string {
  if (preset === "full") return "w-full max-w-full";
  if (preset === "wider") return "w-[560px] max-w-full";
  return "w-[420px] max-w-full";
}
