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
    return trimmed;
  }
  return DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length]!;
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
