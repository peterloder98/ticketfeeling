/**
 * Layout helpers: map seat numbers → x offsets inside a seat_block,
 * accounting for aisle gaps (so seat 12 and 13 are not neighbors visually or logically).
 */

import { SEAT_PITCH_CM } from "@/lib/saalplan/snap";
import type { ResolvedRowLayout } from "@/lib/saalplan/seat-structure";
import { resolveSeatBlockRows, type SeatBlockStructureInput } from "@/lib/saalplan/seat-structure";

export type SeatLayoutPoint = {
  rowIndex: number;
  seatNumber: number;
  /** 0–1 fraction across block inner width */
  xFrac: number;
  /** 0–1 fraction down block inner height */
  yFrac: number;
  segmentIndex: number;
  removed: boolean;
  seatType: "standard" | "wheelchair" | "companion";
};

/**
 * Build normalized seat positions for one block.
 * X accounts for aisle widths; removed seats are omitted (no geometry).
 */
export function layoutSeatBlockPoints(
  block: SeatBlockStructureInput & { rows?: number | null },
): SeatLayoutPoint[] {
  const rows = resolveSeatBlockRows(block);
  if (rows.length === 0) return [];
  const rowCount = rows.length;
  const points: SeatLayoutPoint[] = [];

  // Physical track width = sum of seat pitches for max seat count + aisles of widest row.
  let trackCm = 0;
  for (const row of rows) {
    const aisleSum = row.aisles.reduce((s, a) => s + a.widthCm, 0);
    const seatsCm = row.seatCount * SEAT_PITCH_CM;
    trackCm = Math.max(trackCm, seatsCm + aisleSum);
  }
  if (trackCm <= 0) trackCm = SEAT_PITCH_CM;

  for (const row of rows) {
    const yFrac = (row.rowIndex - 0.5) / rowCount;
    const removed = new Set(row.removedSeatNumbers);
    const aisleAfter = new Map(row.aisles.map((a) => [a.afterSeatNumber, a.widthCm]));
    let cursorCm = SEAT_PITCH_CM / 2;
    for (let n = 1; n <= row.seatCount; n += 1) {
      if (!removed.has(n)) {
        const slot = row.seats.find((s) => s.seatNumber === n);
        points.push({
          rowIndex: row.rowIndex,
          seatNumber: n,
          xFrac: cursorCm / trackCm,
          yFrac,
          segmentIndex: slot?.segmentIndex ?? 0,
          removed: false,
          seatType: slot?.seatType ?? "standard",
        });
      }
      cursorCm += SEAT_PITCH_CM;
      const gap = aisleAfter.get(n);
      if (gap) cursorCm += gap;
    }
  }
  return points;
}

/** Aisle band rects (0–1 frac) for editor overlays. */
export function layoutAisleBands(row: ResolvedRowLayout, rowCount: number, trackSeatCount: number) {
  const aisleSum = row.aisles.reduce((s, a) => s + a.widthCm, 0);
  const trackCm = Math.max(SEAT_PITCH_CM, trackSeatCount * SEAT_PITCH_CM + aisleSum);
  const bands: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let cursorCm = 0;
  const aisleAfter = new Map(row.aisles.map((a) => [a.afterSeatNumber, a.widthCm]));
  for (let n = 1; n <= row.seatCount; n += 1) {
    cursorCm += SEAT_PITCH_CM;
    const gap = aisleAfter.get(n);
    if (gap) {
      const x0 = cursorCm / trackCm;
      cursorCm += gap;
      const x1 = cursorCm / trackCm;
      const y0 = (row.rowIndex - 1) / rowCount;
      const y1 = row.rowIndex / rowCount;
      bands.push({ x0, x1, y0, y1 });
    }
  }
  return bands;
}
