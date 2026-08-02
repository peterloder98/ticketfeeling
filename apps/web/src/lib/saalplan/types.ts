export type VenuePlanObjectType = "stage" | "seat_block" | "rect" | "ellipse" | "text";

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
};

export type VenuePlanData = {
  id: string;
  name: string;
  widthCm: number;
  depthCm: number;
  objects: VenuePlanObject[];
  version: number;
};

export function seatCountOfObject(o: VenuePlanObject): number {
  if (o.type !== "seat_block") return 0;
  const rows = Math.max(0, Math.round(o.rows ?? 0));
  const cols = Math.max(0, Math.round(o.seatsPerRow ?? 0));
  return rows * cols;
}

export function planSeatCapacity(objects: VenuePlanObject[]): number {
  return objects.reduce((sum, o) => sum + seatCountOfObject(o), 0);
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
