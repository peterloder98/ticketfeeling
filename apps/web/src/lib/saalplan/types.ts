export type VenuePlanObjectType =
  | "stage"
  | "seat_block"
  | "standing_area"
  | "rect"
  | "ellipse"
  | "text";

/** Rough orientation only — not a legal capacity certificate. */
export type StandingMode = "standing" | "standing_tables";

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
   * seat_block: named category slot key (VenuePlan.categorySlots).
   * Mapped to EventTicketCategory by name when seats materialize.
   * Overrides: seatCategoryKeys → rowCategoryKeys → categoryKey.
   */
  categoryKey?: string | null;
  /** seat_block: rowIndex (1-based string) → category slot key */
  rowCategoryKeys?: Record<string, string>;
  /** seat_block: "R{row}:S{seat}" → category slot key */
  seatCategoryKeys?: Record<string, string>;
  /** standing_area only */
  standingMode?: StandingMode;
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

/** Non-binding capacity estimate for standing areas. */
export function estimateStandingCapacity(
  widthCm: number,
  heightCm: number,
  mode: StandingMode = "standing",
) {
  const density = STANDING_DENSITY_PER_M2[mode] ?? STANDING_DENSITY_PER_M2.standing;
  return Math.max(0, Math.floor(areaSqm(widthCm, heightCm) * density));
}

export function isNumberedSeatBlock(o: VenuePlanObject) {
  return o.type === "seat_block" && o.numberedSeats !== false;
}

export function seatCountOfObject(o: VenuePlanObject): number {
  if (!isNumberedSeatBlock(o)) return 0;
  const rows = Math.max(0, Math.round(o.rows ?? 0));
  const cols = Math.max(0, Math.round(o.seatsPerRow ?? 0));
  return rows * cols;
}

/** Visual seat dots even for free-choice blocks (not counted as reserved capacity). */
export function visualSeatCountOfObject(o: VenuePlanObject): number {
  if (o.type !== "seat_block") return 0;
  const rows = Math.max(0, Math.round(o.rows ?? 0));
  const cols = Math.max(0, Math.round(o.seatsPerRow ?? 0));
  return rows * cols;
}

export function planSeatCapacity(objects: VenuePlanObject[]): number {
  return objects.reduce((sum, o) => sum + seatCountOfObject(o), 0);
}

export function planStandingEstimate(objects: VenuePlanObject[]): number {
  return objects.reduce((sum, o) => {
    if (o.type !== "standing_area") return sum;
    return sum + estimateStandingCapacity(o.widthCm, o.heightCm, o.standingMode ?? "standing");
  }, 0);
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

export function objectTypeLabel(type: VenuePlanObjectType): string {
  switch (type) {
    case "stage":
      return "Bühne";
    case "seat_block":
      return "Sitzblock";
    case "standing_area":
      return "Stehbereich";
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
