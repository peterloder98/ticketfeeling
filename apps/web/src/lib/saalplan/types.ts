import {
  countGeometricSeats,
  maxAisleWidthSumCm,
  maxSeatNumberInBlock,
  parseSeatBlockRowDef,
  type SeatBlockRowDef,
} from "@/lib/saalplan/seat-structure";

export type VenuePlanObjectType =
  | "stage"
  | "seat_block"
  | "standing_area"
  | "foh"
  | "rect"
  | "ellipse"
  | "text";

/** Rough orientation only — not a legal capacity certificate. */
export type StandingMode = "standing" | "standing_tables";

export type { SeatBlockRowDef, PlanSeatType, RowAisle } from "@/lib/saalplan/seat-structure";

export type VenuePlanObject = {
  id: string;
  type: VenuePlanObjectType;
  /** Center X in cm from left hall edge */
  xCm: number;
  /** Center Y in cm from top/front hall edge */
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
  label?: string;
  locked?: boolean;
  zIndex?: number;
  /** seat_block only */
  rows?: number;
  seatsPerRow?: number;
  /**
   * seat_block: when true, seats get row/seat numbers and become reservable EventSeats.
   * When false, the block is free-choice geometry only (no numbered inventory).
   * Default true for backwards compatibility.
   */
  numberedSeats?: boolean;
  /**
   * seat_block: per-row segments, aisles, removed seats, seat types.
   * Missing → legacy single segment 1..seatsPerRow per row.
   */
  rowDefs?: SeatBlockRowDef[];
  /**
   * seat_block: legacy named category slot keys (VenuePlan.categorySlots).
   * Geometry editor no longer paints these — pricing is assigned on the event.
   * Kept on the type for older stored plans until the next geometry save strips them.
   */
  categoryKey?: string | null;
  /** seat_block: rowIndex (1-based string) → category slot key (legacy) */
  rowCategoryKeys?: Record<string, string>;
  /** seat_block: "R{row}:S{seat}" → category slot key (legacy) */
  seatCategoryKeys?: Record<string, string>;
  /** standing_area only — density mode for auto capacity */
  standingMode?: StandingMode;
  /**
   * standing_area only — assignable place count (inventory).
   * Defaults from area × density; may be overridden manually (higher or lower).
   */
  capacity?: number;
  /** When true, resizing / mode changes do not overwrite `capacity`. */
  capacityManual?: boolean;
};

export type VenuePlanData = {
  id: string;
  name: string;
  widthCm: number;
  depthCm: number;
  objects: VenuePlanObject[];
  version: number;
};

/** Persons per m² — rough orientation, not legal advice. */
export const STANDING_DENSITY_PER_M2: Record<StandingMode, number> = {
  standing: 2.0,
  standing_tables: 1.0,
};

export function areaSqm(widthCm: number, heightCm: number) {
  return Math.max(0, (widthCm / 100) * (heightCm / 100));
}

/** Density-based capacity estimate for standing areas (auto default). */
export function estimateStandingCapacity(
  widthCm: number,
  heightCm: number,
  mode: StandingMode = "standing",
) {
  const density = STANDING_DENSITY_PER_M2[mode] ?? STANDING_DENSITY_PER_M2.standing;
  return Math.max(0, Math.floor(areaSqm(widthCm, heightCm) * density));
}

/** Effective standing inventory (manual override or area estimate). */
export function resolveStandingCapacity(o: VenuePlanObject): number {
  if (o.type !== "standing_area") return 0;
  if (typeof o.capacity === "number" && Number.isFinite(o.capacity)) {
    return Math.max(0, Math.floor(o.capacity));
  }
  return estimateStandingCapacity(o.widthCm, o.heightCm, o.standingMode ?? "standing");
}

/** EventSeat seatKey marker for standing inventory units (`blockId:ST:n`). */
export function isStandingSeatKey(seatKey: string) {
  return seatKey.includes(":ST:");
}

export function standingSeatKey(blockObjectId: string, placeIndex: number) {
  return `${blockObjectId}:ST:${placeIndex}`;
}

export function isNumberedSeatBlock(o: VenuePlanObject) {
  return o.type === "seat_block" && o.numberedSeats !== false;
}

export function isFohObject(o: VenuePlanObject) {
  return o.type === "foh";
}

export function seatCountOfObject(o: VenuePlanObject): number {
  if (!isNumberedSeatBlock(o)) return 0;
  return countGeometricSeats(o);
}

/** Visual seat dots even for free-choice blocks (not counted as reserved capacity). */
export function visualSeatCountOfObject(o: VenuePlanObject): number {
  if (o.type !== "seat_block") return 0;
  if (o.numberedSeats === false) {
    const rows = Math.max(0, Math.round(o.rows ?? 0));
    const cols = Math.max(0, Math.round(o.seatsPerRow ?? 0));
    return rows * cols;
  }
  return countGeometricSeats(o);
}

/** Max seat number (for uniform fallback grid); aisles may make physical width larger. */
export function seatBlockGridCols(o: VenuePlanObject): number {
  if (o.type !== "seat_block") return 0;
  return maxSeatNumberInBlock(o);
}

export function seatBlockAisleExtraCm(o: VenuePlanObject): number {
  if (o.type !== "seat_block") return 0;
  return maxAisleWidthSumCm(o);
}

export function planSeatCapacity(objects: VenuePlanObject[]): number {
  return objects.reduce((sum, o) => sum + seatCountOfObject(o), 0);
}

export function planStandingEstimate(objects: VenuePlanObject[]): number {
  return objects.reduce((sum, o) => sum + resolveStandingCapacity(o), 0);
}

/** Numbered seats + standing places — total assignable plan inventory. */
export function planAssignableCapacity(objects: VenuePlanObject[]): number {
  return planSeatCapacity(objects) + planStandingEstimate(objects);
}

export function parseVenuePlanObjects(raw: unknown): VenuePlanObject[] {
  if (!Array.isArray(raw)) return [];
  const out: VenuePlanObject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = o.type;
    if (
      type !== "stage" &&
      type !== "seat_block" &&
      type !== "standing_area" &&
      type !== "foh" &&
      type !== "rect" &&
      type !== "ellipse" &&
      type !== "text"
    ) {
      continue;
    }
    const id = typeof o.id === "string" ? o.id : null;
    if (!id) continue;
    const obj: VenuePlanObject = {
      id,
      type,
      xCm: Number(o.xCm) || 0,
      yCm: Number(o.yCm) || 0,
      widthCm: Math.max(10, Number(o.widthCm) || 100),
      heightCm: Math.max(10, Number(o.heightCm) || 100),
      rotationDeg: Number(o.rotationDeg) || 0,
      label: typeof o.label === "string" ? o.label : undefined,
      locked: Boolean(o.locked),
      zIndex: typeof o.zIndex === "number" ? o.zIndex : 0,
    };
    if (type === "seat_block") {
      obj.rows = Math.max(1, Math.round(Number(o.rows) || 1));
      obj.seatsPerRow = Math.max(1, Math.round(Number(o.seatsPerRow) || 1));
      obj.numberedSeats = o.numberedSeats === false ? false : true;
      if (Array.isArray(o.rowDefs)) {
        const rowDefs = o.rowDefs
          .map(parseSeatBlockRowDef)
          .filter((d): d is SeatBlockRowDef => Boolean(d));
        if (rowDefs.length) obj.rowDefs = rowDefs;
      }
      if (typeof o.categoryKey === "string" && o.categoryKey.trim()) {
        obj.categoryKey = o.categoryKey.trim();
      } else if (o.categoryKey === null) {
        obj.categoryKey = null;
      }
      if (o.rowCategoryKeys && typeof o.rowCategoryKeys === "object" && !Array.isArray(o.rowCategoryKeys)) {
        const rows: Record<string, string> = {};
        for (const [k, v] of Object.entries(o.rowCategoryKeys as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) rows[k] = v.trim();
        }
        if (Object.keys(rows).length) obj.rowCategoryKeys = rows;
      }
      if (
        o.seatCategoryKeys &&
        typeof o.seatCategoryKeys === "object" &&
        !Array.isArray(o.seatCategoryKeys)
      ) {
        const seats: Record<string, string> = {};
        for (const [k, v] of Object.entries(o.seatCategoryKeys as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) seats[k] = v.trim();
        }
        if (Object.keys(seats).length) obj.seatCategoryKeys = seats;
      }
    }
    if (type === "standing_area") {
      obj.standingMode = o.standingMode === "standing_tables" ? "standing_tables" : "standing";
      if (typeof o.capacity === "number" && Number.isFinite(o.capacity)) {
        obj.capacity = Math.max(0, Math.floor(o.capacity));
      } else {
        obj.capacity = estimateStandingCapacity(obj.widthCm, obj.heightCm, obj.standingMode);
      }
      obj.capacityManual = o.capacityManual === true;
    }
    out.push(obj);
  }
  return out;
}

export function metersToCm(m: number) {
  return Math.round(m * 100);
}

export function cmToMetersLabel(cm: number) {
  const m = cm / 100;
  if (Number.isInteger(m)) return `${m} m`;
  return `${m.toFixed(2).replace(".", ",")} m`;
}

/** Compact tick text — unit only on the origin so dense rulers stay readable. */
export function cmToMetersTickLabel(cm: number, withUnit = false) {
  const m = cm / 100;
  const num = Number.isInteger(m) ? String(m) : m.toFixed(2).replace(".", ",");
  return withUnit ? `${num} m` : num;
}

/**
 * Pick a major tick step (cm) so labels stay ~minLabelPx apart at the given scale (px/cm).
 * Candidates are nice meter intervals.
 */
export function adaptiveMeterTickStepCm(scalePxPerCm: number, minLabelPx = 52): number {
  const pxPerMeter = Math.max(0.001, scalePxPerCm * 100);
  const minMeters = minLabelPx / pxPerMeter;
  const candidatesM = [0.5, 1, 2, 5, 10, 20, 50, 100];
  const meters = candidatesM.find((m) => m >= minMeters) ?? Math.ceil(minMeters / 50) * 50;
  return Math.max(50, Math.round(meters * 100));
}

export function objectTypeLabel(type: VenuePlanObjectType): string {
  switch (type) {
    case "stage":
      return "Bühne";
    case "seat_block":
      return "Sitzblock";
    case "standing_area":
      return "Stehbereich";
    case "foh":
      return "FOH / Technik";
    case "rect":
      return "Rechteck";
    case "ellipse":
      return "Ellipse";
    case "text":
      return "Text";
    default:
      return type;
  }
}
