import { DEFAULT_CATEGORY_COLORS, resolveCategoryColor } from "@/lib/seating/layout-config";
import type { VenuePlanObject } from "@/lib/saalplan/types";

/** Named category zone on a reusable VenuePlan (not an EventTicketCategory UUID). */
export type PlanCategorySlot = {
  key: string;
  name: string;
  color: string;
};

export function normalizeCategoryLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function slotKeyFromName(name: string) {
  const base = normalizeCategoryLabel(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `slot-${Math.random().toString(36).slice(2, 8)}`;
}

export function parsePlanCategorySlots(raw: unknown): PlanCategorySlot[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanCategorySlot[] = [];
  const seen = new Set<string>();
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    let key = typeof o.key === "string" && o.key.trim() ? o.key.trim() : slotKeyFromName(name);
    if (seen.has(key)) key = `${key}-${index + 1}`;
    seen.add(key);
    out.push({
      key,
      name,
      color: resolveCategoryColor(
        typeof o.color === "string" ? o.color : null,
        index,
      ),
    });
  }
  return out;
}

/** Seat-level key stored on seat_block.seatCategoryKeys */
export function planSeatCoordKey(rowIndex: number, seatIndex: number) {
  return `R${rowIndex}:S${seatIndex}`;
}

/**
 * Resolve category slot key for one seat.
 * Precision: seat override → row override → block default.
 */
export function resolveSeatCategoryKey(
  block: Pick<VenuePlanObject, "categoryKey" | "rowCategoryKeys" | "seatCategoryKeys">,
  rowIndex: number,
  seatIndex: number,
): string | null {
  const seatKey = planSeatCoordKey(rowIndex, seatIndex);
  const seat = block.seatCategoryKeys?.[seatKey];
  if (typeof seat === "string" && seat.trim()) return seat.trim();
  const row = block.rowCategoryKeys?.[String(rowIndex)];
  if (typeof row === "string" && row.trim()) return row.trim();
  if (typeof block.categoryKey === "string" && block.categoryKey.trim()) {
    return block.categoryKey.trim();
  }
  return null;
}

/** Map plan slot keys → event ticket category ids by matching names. */
export function mapSlotKeysToCategoryIds(
  slots: PlanCategorySlot[],
  categories: { id: string; name: string }[],
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const cat of categories) {
    const n = normalizeCategoryLabel(cat.name);
    if (n && !byName.has(n)) byName.set(n, cat.id);
  }
  const map = new Map<string, string>();
  for (const slot of slots) {
    const bySlotName = byName.get(normalizeCategoryLabel(slot.name));
    if (bySlotName) {
      map.set(slot.key, bySlotName);
      continue;
    }
    const byKeyAsName = byName.get(normalizeCategoryLabel(slot.key.replace(/-/g, " ")));
    if (byKeyAsName) map.set(slot.key, byKeyAsName);
  }
  return map;
}

export function slotsFromEventCategories(
  categories: { name: string; color: string | null; freeSeating?: boolean; categoryKind?: string }[],
): PlanCategorySlot[] {
  const seated = categories.filter(
    (c) =>
      c.freeSeating !== true &&
      c.categoryKind !== "standing" &&
      c.categoryKind !== "free_choice",
  );
  const source = seated.length > 0 ? seated : categories;
  return source
    .map((c, i) => ({
      key: slotKeyFromName(c.name),
      name: c.name.trim(),
      color: resolveCategoryColor(c.color, i),
    }))
    .filter((s) => s.name);
}

export function defaultSlotColor(index: number) {
  return DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length]!;
}

export function paintBlockCategory(
  block: VenuePlanObject,
  categoryKey: string | null,
): VenuePlanObject {
  if (categoryKey === null) {
    return {
      ...block,
      categoryKey: undefined,
      rowCategoryKeys: undefined,
      seatCategoryKeys: undefined,
    };
  }
  return {
    ...block,
    categoryKey,
    rowCategoryKeys: undefined,
    seatCategoryKeys: undefined,
  };
}

export function paintRowCategory(
  block: VenuePlanObject,
  rowIndex: number,
  categoryKey: string | null,
): VenuePlanObject {
  const rowCategoryKeys = { ...(block.rowCategoryKeys ?? {}) };
  const seatCategoryKeys = { ...(block.seatCategoryKeys ?? {}) };
  if (categoryKey === null) {
    delete rowCategoryKeys[String(rowIndex)];
  } else {
    rowCategoryKeys[String(rowIndex)] = categoryKey;
  }
  for (const key of Object.keys(seatCategoryKeys)) {
    if (key.startsWith(`R${rowIndex}:`)) delete seatCategoryKeys[key];
  }
  return {
    ...block,
    rowCategoryKeys: Object.keys(rowCategoryKeys).length ? rowCategoryKeys : undefined,
    seatCategoryKeys: Object.keys(seatCategoryKeys).length ? seatCategoryKeys : undefined,
  };
}

export function paintSeatCategory(
  block: VenuePlanObject,
  rowIndex: number,
  seatIndex: number,
  categoryKey: string | null,
): VenuePlanObject {
  const seatCategoryKeys = { ...(block.seatCategoryKeys ?? {}) };
  const coord = planSeatCoordKey(rowIndex, seatIndex);
  if (categoryKey === null) {
    delete seatCategoryKeys[coord];
  } else {
    seatCategoryKeys[coord] = categoryKey;
  }
  return {
    ...block,
    seatCategoryKeys: Object.keys(seatCategoryKeys).length ? seatCategoryKeys : undefined,
  };
}

/** Drop row/seat overrides that fall outside the current grid. */
export function pruneCategoryAssignments(block: VenuePlanObject): VenuePlanObject {
  if (block.type !== "seat_block") return block;
  const rows = Math.max(0, Math.round(block.rows ?? 0));
  const cols = Math.max(0, Math.round(block.seatsPerRow ?? 0));
  const rowCategoryKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(block.rowCategoryKeys ?? {})) {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= rows && typeof v === "string" && v.trim()) {
      rowCategoryKeys[String(n)] = v.trim();
    }
  }
  const seatCategoryKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(block.seatCategoryKeys ?? {})) {
    const m = /^R(\d+):S(\d+)$/.exec(k);
    if (!m || typeof v !== "string" || !v.trim()) continue;
    const r = Number(m[1]);
    const s = Number(m[2]);
    if (r >= 1 && r <= rows && s >= 1 && s <= cols) {
      seatCategoryKeys[k] = v.trim();
    }
  }
  return {
    ...block,
    rowCategoryKeys: Object.keys(rowCategoryKeys).length ? rowCategoryKeys : undefined,
    seatCategoryKeys: Object.keys(seatCategoryKeys).length ? seatCategoryKeys : undefined,
  };
}

/**
 * Geometry-only save: drop plan slot paint (categoryKey / row / seat).
 * Pricing lives on the event (Preiskategorie-Zuordnung), not in venue geometry.
 * Standing areas never carry category paint — this is a no-op for them.
 */
export function stripPlanCategoryPaint(obj: VenuePlanObject): VenuePlanObject {
  if (obj.type !== "seat_block") return obj;
  if (
    obj.categoryKey == null &&
    !obj.rowCategoryKeys &&
    !obj.seatCategoryKeys
  ) {
    return obj;
  }
  return {
    ...obj,
    categoryKey: undefined,
    rowCategoryKeys: undefined,
    seatCategoryKeys: undefined,
  };
}

export function colorForSlotKey(
  slots: PlanCategorySlot[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return slots.find((s) => s.key === key)?.color ?? null;
}
