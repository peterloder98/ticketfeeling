import type { EventSeat } from "@prisma/client";
import { formatSeatLabel } from "@/lib/seating/types";
import {
  pickOptimizedSeats,
  type OptSeat,
  type SeatOptimizationContext,
} from "@/lib/seating/seat-optimization";

type SeatRow = Pick<
  EventSeat,
  | "id"
  | "seatKey"
  | "blockObjectId"
  | "blockLabel"
  | "rowIndex"
  | "seatIndex"
  | "rowLabel"
  | "seatNumber"
  | "status"
> & {
  locked?: boolean | null;
  segmentIndex?: number | null;
  positionInSegment?: number | null;
  seatType?: string | null;
};

function toOpt(seats: SeatRow[]): OptSeat[] {
  return seats.map((s) => ({
    id: s.id,
    seatKey: s.seatKey,
    blockObjectId: s.blockObjectId,
    blockLabel: s.blockLabel,
    rowIndex: s.rowIndex,
    seatIndex: s.seatIndex,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    status: s.status,
    locked: Boolean(s.locked),
    segmentIndex: s.segmentIndex ?? 0,
    positionInSegment:
      typeof s.positionInSegment === "number" ? s.positionInSegment : Math.max(0, s.seatIndex - 1),
  }));
}

/**
 * Best-available: prefer contiguous seats in the same segment (closest to center),
 * remnant-aware; then partitions; standing only after numbered seats.
 */
export function pickBestAvailableSeats(
  seats: SeatRow[],
  quantity: number,
  ctx?: SeatOptimizationContext | null,
): SeatRow[] {
  if (quantity < 1) return [];
  const picked = pickOptimizedSeats(toOpt(seats), quantity, ctx);
  if (picked.length < quantity) return [];
  const byId = new Map(seats.map((s) => [s.id, s]));
  return picked.map((p) => byId.get(p.id)!).filter(Boolean);
}

/**
 * Wheelchair + free companion: prefer adjacent pairs in the same segment.
 * Returns flat list [wc, companion, wc, companion, ...] length quantity*2.
 */
export function pickBestAvailablePairs(
  seats: SeatRow[],
  pairCount: number,
  ctx?: SeatOptimizationContext | null,
): SeatRow[] {
  if (pairCount < 1) return [];
  const available = toOpt(seats).filter(
    (s) => s.status === "available" && !s.locked && !s.seatKey.includes(":ST:"),
  );
  if (available.length < pairCount * 2) return [];

  // Score adjacent pairs within the same segment.
  const bySeg = new Map<string, OptSeat[]>();
  for (const seat of available) {
    const key = `${seat.blockObjectId}:${seat.rowIndex}:${seat.segmentIndex ?? 0}`;
    const list = bySeg.get(key) ?? [];
    list.push(seat);
    bySeg.set(key, list);
  }

  type Pair = { seats: [OptSeat, OptSeat]; score: number };
  const pairs: Pair[] = [];
  for (const [, rowSeats] of bySeg) {
    rowSeats.sort(
      (a, b) =>
        (a.positionInSegment ?? a.seatIndex) - (b.positionInSegment ?? b.seatIndex),
    );
    for (let i = 0; i < rowSeats.length - 1; i += 1) {
      const a = rowSeats[i]!;
      const b = rowSeats[i + 1]!;
      const pa = a.positionInSegment ?? a.seatIndex - 1;
      const pb = b.positionInSegment ?? b.seatIndex - 1;
      if (pb !== pa + 1) continue;
      const mid = (a.seatIndex + b.seatIndex) / 2;
      const score = a.rowIndex * 100 + Math.abs(mid - 10);
      pairs.push({ seats: [a, b], score });
    }
  }
  pairs.sort((a, b) => a.score - b.score);

  const picked: OptSeat[] = [];
  const used = new Set<string>();
  for (const pair of pairs) {
    if (picked.length / 2 >= pairCount) break;
    if (used.has(pair.seats[0].id) || used.has(pair.seats[1].id)) continue;
    picked.push(pair.seats[0], pair.seats[1]);
    used.add(pair.seats[0].id);
    used.add(pair.seats[1].id);
  }

  if (picked.length !== pairCount * 2) return [];
  const byId = new Map(seats.map((s) => [s.id, s]));
  return picked.map((p) => byId.get(p.id)!).filter(Boolean);
}

/** For each wheelchair seat, attach one adjacent free companion seat (same segment). */
export function assignCompanionSeats(
  wheelchairSeats: SeatRow[],
  availablePool: SeatRow[],
): SeatRow[] | null {
  const available = availablePool.filter(
    (s) =>
      s.status === "available" &&
      !s.locked &&
      !wheelchairSeats.some((w) => w.id === s.id),
  );
  const byKey = new Map(
    available.map((s) => [
      `${s.blockObjectId}:${s.rowIndex}:${s.segmentIndex ?? 0}:${
        typeof s.positionInSegment === "number" ? s.positionInSegment : s.seatIndex - 1
      }`,
      s,
    ]),
  );
  const result: SeatRow[] = [];
  const used = new Set<string>();

  for (const wc of wheelchairSeats) {
    const seg = wc.segmentIndex ?? 0;
    const pos =
      typeof wc.positionInSegment === "number" ? wc.positionInSegment : wc.seatIndex - 1;
    const candidates = [pos + 1, pos - 1]
      .map((p) => byKey.get(`${wc.blockObjectId}:${wc.rowIndex}:${seg}:${p}`))
      .filter((s): s is SeatRow => s != null && !used.has(s.id));

    const companion = candidates[0];
    if (!companion) return null;
    result.push(wc, companion);
    used.add(companion.id);
  }

  return result;
}

export function seatSnapshots(seats: SeatRow[]) {
  return seats.map((s) => ({
    seatId: s.id,
    seatKey: s.seatKey,
    blockLabel: s.blockLabel,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    seatLabel: formatSeatLabel(s),
  }));
}

// Re-export validation helpers so call sites can import from one seating entry.
export {
  validateSeatSelection,
  computeOccupancyPercent,
  gapRuleRelaxed,
  SINGLETON_GAP_MESSAGE,
} from "@/lib/seating/seat-optimization";
export type { SeatOptimizationContext } from "@/lib/seating/seat-optimization";
