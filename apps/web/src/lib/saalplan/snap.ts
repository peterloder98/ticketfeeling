import type { VenuePlanObject } from "@/lib/saalplan/types";

export type SnapGuide = {
  orientation: "v" | "h";
  /** Position in cm */
  atCm: number;
};

const DEFAULT_THRESHOLD_CM = 12;

/** Default seat / row pitch used when sizing a new block */
export const SEAT_PITCH_CM = 50;
export const ROW_PITCH_CM = 85;

/**
 * Snap object center to hall center / edges while dragging.
 * Returns adjusted center + guides that should be drawn.
 */
export function snapObjectCenter(input: {
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  hallWidthCm: number;
  hallDepthCm: number;
  thresholdCm?: number;
}): { xCm: number; yCm: number; guides: SnapGuide[] } {
  const threshold = input.thresholdCm ?? DEFAULT_THRESHOLD_CM;
  const halfW = input.widthCm / 2;
  const halfH = input.heightCm / 2;
  let { xCm, yCm } = input;
  const guides: SnapGuide[] = [];

  const vTargets = [input.hallWidthCm / 2, halfW, input.hallWidthCm - halfW];
  for (const t of vTargets) {
    if (Math.abs(xCm - t) <= threshold) {
      xCm = t;
      guides.push({
        orientation: "v",
        atCm: Math.abs(t - input.hallWidthCm / 2) < 0.01 ? input.hallWidthCm / 2 : t,
      });
      break;
    }
  }

  const hTargets = [input.hallDepthCm / 2, halfH, input.hallDepthCm - halfH];
  for (const t of hTargets) {
    if (Math.abs(yCm - t) <= threshold) {
      yCm = t;
      guides.push({
        orientation: "h",
        atCm: Math.abs(t - input.hallDepthCm / 2) < 0.01 ? input.hallDepthCm / 2 : t,
      });
      break;
    }
  }

  xCm = Math.min(input.hallWidthCm - halfW, Math.max(halfW, xCm));
  yCm = Math.min(input.hallDepthCm - halfH, Math.max(halfH, yCm));

  return { xCm, yCm, guides };
}

export function newObjectId() {
  return `obj_${Math.random().toString(36).slice(2, 10)}`;
}

export function seatBlockSizeCm(rows: number, seatsPerRow: number) {
  return {
    widthCm: Math.max(80, seatsPerRow * SEAT_PITCH_CM),
    heightCm: Math.max(80, rows * ROW_PITCH_CM),
  };
}

export function createStage(hallWidthCm: number, hallDepthCm: number): VenuePlanObject {
  const widthCm = Math.min(600, Math.round(hallWidthCm * 0.45));
  const heightCm = Math.min(250, Math.round(hallDepthCm * 0.18));
  return {
    id: newObjectId(),
    type: "stage",
    xCm: hallWidthCm / 2,
    yCm: heightCm / 2 + 40,
    widthCm,
    heightCm,
    rotationDeg: 0,
    label: "Bühne",
    zIndex: 1,
  };
}

export function createSeatBlock(
  hallWidthCm: number,
  hallDepthCm: number,
  opts?: { rows?: number; seatsPerRow?: number; label?: string },
): VenuePlanObject {
  const rows = Math.max(1, opts?.rows ?? 5);
  const seatsPerRow = Math.max(1, opts?.seatsPerRow ?? 10);
  const { widthCm, heightCm } = seatBlockSizeCm(rows, seatsPerRow);
  const existingHint = opts?.label ?? "Block A";
  return {
    id: newObjectId(),
    type: "seat_block",
    xCm: hallWidthCm / 2,
    yCm: Math.min(hallDepthCm - heightCm / 2 - 40, hallDepthCm * 0.58),
    widthCm: Math.min(widthCm, hallWidthCm * 0.9),
    heightCm: Math.min(heightCm, hallDepthCm * 0.55),
    rotationDeg: 0,
    label: existingHint,
    rows,
    seatsPerRow,
    zIndex: 2,
  };
}

export function nextBlockLabel(existing: VenuePlanObject[]): string {
  const used = new Set(
    existing
      .filter((o) => o.type === "seat_block")
      .map((o) => (o.label ?? "").trim().toUpperCase()),
  );
  for (let i = 0; i < 26; i += 1) {
    const label = `Block ${String.fromCharCode(65 + i)}`;
    if (!used.has(label.toUpperCase())) return label;
  }
  return `Block ${existing.filter((o) => o.type === "seat_block").length + 1}`;
}
