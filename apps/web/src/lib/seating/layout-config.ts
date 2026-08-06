/** Default palette when a category has no color set. */
export const DEFAULT_CATEGORY_COLORS = [
  "#14B8A6",
  "#0F2747",
  "#D6A642",
  "#3B82F6",
  "#EC4899",
  "#8B5CF6",
  "#F97316",
  "#059669",
] as const;

export function resolveCategoryColor(color: string | null | undefined, index = 0) {
  const trimmed = color?.trim();
  if (trimmed && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) {
    return trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed;
  }
  return DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length]!;
}

/** Parse #RGB / #RRGGBB into 0–255 channels. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = resolveCategoryColor(hex, 0);
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * Semi-transparent category fill for standing zones / blocks.
 * Dark navy (#0F2747) at low alpha looks like unassigned gray — bump alpha for dark hues.
 */
export function categoryFillRgba(color: string, alpha = 0.28): string {
  const rgb = hexToRgb(color);
  if (!rgb) return `rgba(20,184,166,${alpha})`;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const a = luminance < 0.35 ? Math.max(alpha, 0.45) : alpha;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export type SeatingBlockConfig = {
  categoryId?: string | null;
  locked?: boolean;
  lockedRowIndexes?: number[];
};

export type SeatingLayoutConfig = {
  blocks?: Record<string, SeatingBlockConfig>;
};

export function parseSeatingLayoutConfig(raw: unknown): SeatingLayoutConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { blocks: {} };
  const blocksRaw = (raw as { blocks?: unknown }).blocks;
  if (!blocksRaw || typeof blocksRaw !== "object" || Array.isArray(blocksRaw)) {
    return { blocks: {} };
  }
  const blocks: Record<string, SeatingBlockConfig> = {};
  for (const [key, value] of Object.entries(blocksRaw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    blocks[key] = {
      categoryId: typeof v.categoryId === "string" ? v.categoryId : v.categoryId === null ? null : undefined,
      locked: typeof v.locked === "boolean" ? v.locked : undefined,
      lockedRowIndexes: Array.isArray(v.lockedRowIndexes)
        ? v.lockedRowIndexes.filter((n): n is number => typeof n === "number")
        : undefined,
    };
  }
  return { blocks };
}
