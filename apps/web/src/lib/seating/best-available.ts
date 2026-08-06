import type { EventSeat } from "@prisma/client";
import { formatSeatLabel } from "@/lib/seating/types";

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
>;

/**
 * Best-available: prefer contiguous seats in the same row (closest to center),
 * then pairs, then fill remaining singles near the best cluster.
 * Standing inventory (`:ST:` keys) is used only after numbered seats are exhausted.
 */
export function pickBestAvailableSeats(seats: SeatRow[], quantity: number): SeatRow[] {
  if (quantity < 1) return [];
  const numbered = seats.filter((s) => s.status === "available" && !s.seatKey.includes(":ST:"));
  const standing = seats.filter((s) => s.status === "available" && s.seatKey.includes(":ST:"));
  const fromNumbered = pickBestAvailableFromPool(numbered, quantity);
  if (fromNumbered.length === quantity) return fromNumbered;
  const need = quantity - fromNumbered.length;
  const fromStanding = pickBestAvailableFromPool(standing, need);
  if (fromNumbered.length + fromStanding.length < quantity) return [];
  return [...fromNumbered, ...fromStanding];
}

function pickBestAvailableFromPool(seats: SeatRow[], quantity: number): SeatRow[] {
  if (quantity < 1) return [];
  const available = [...seats].sort((a, b) => {
    if (a.blockObjectId !== b.blockObjectId) {
      return a.blockLabel.localeCompare(b.blockLabel) || a.blockObjectId.localeCompare(b.blockObjectId);
    }
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
    return a.seatIndex - b.seatIndex;
  });

  if (available.length < quantity) {
    // Partial fill — caller may combine pools.
    if (available.length === 0) return [];
  }

  const rows = new Map<string, SeatRow[]>();
  for (const seat of available) {
    const key = `${seat.blockObjectId}:${seat.rowIndex}`;
    const list = rows.get(key) ?? [];
    list.push(seat);
    rows.set(key, list);
  }

  type Run = { seats: SeatRow[]; score: number };
  const runs: Run[] = [];

  for (const [, rowSeats] of rows) {
    rowSeats.sort((a, b) => a.seatIndex - b.seatIndex);
    let start = 0;
    while (start < rowSeats.length) {
      let end = start;
      while (
        end + 1 < rowSeats.length &&
        rowSeats[end + 1]!.seatIndex === rowSeats[end]!.seatIndex + 1
      ) {
        end += 1;
      }
      const run = rowSeats.slice(start, end + 1);
      const mid = (run[0]!.seatIndex + run[run.length - 1]!.seatIndex) / 2;
      const centerBias = Math.abs(mid - 10);
      const score = run[0]!.rowIndex * 100 + centerBias - run.length * 2;
      runs.push({ seats: run, score });
      start = end + 1;
    }
  }

  runs.sort((a, b) => a.score - b.score);

  for (const run of runs) {
    if (run.seats.length >= quantity) {
      return pickCenteredSlice(run.seats, quantity);
    }
  }

  const picked: SeatRow[] = [];
  const used = new Set<string>();
  const bySize = [...runs].sort((a, b) => b.seats.length - a.seats.length || a.score - b.score);

  for (const run of bySize) {
    if (picked.length >= quantity) break;
    const free = run.seats.filter((s) => !used.has(s.id));
    if (free.length === 0) continue;
    const need = quantity - picked.length;
    const take = free.slice(0, Math.min(need, free.length));
    if (take.length === need || free.length >= 2 || need === 1) {
      for (const s of take) {
        picked.push(s);
        used.add(s.id);
      }
    }
  }

  if (picked.length < quantity) {
    for (const s of available) {
      if (picked.length >= quantity) break;
      if (used.has(s.id)) continue;
      picked.push(s);
      used.add(s.id);
    }
  }

  return picked.slice(0, Math.min(quantity, picked.length));
}

/**
 * Wheelchair + free companion: prefer adjacent pairs in the same row.
 * Returns flat list [wc, companion, wc, companion, ...] length quantity*2.
 */
export function pickBestAvailablePairs(seats: SeatRow[], pairCount: number): SeatRow[] {
  if (pairCount < 1) return [];
  const available = seats
    .filter((s) => s.status === "available" && !s.seatKey.includes(":ST:"))
    .sort((a, b) => {
      if (a.blockObjectId !== b.blockObjectId) {
        return a.blockLabel.localeCompare(b.blockLabel) || a.blockObjectId.localeCompare(b.blockObjectId);
      }
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
      return a.seatIndex - b.seatIndex;
    });

  if (available.length < pairCount * 2) return [];

  const rows = new Map<string, SeatRow[]>();
  for (const seat of available) {
    const key = `${seat.blockObjectId}:${seat.rowIndex}`;
    const list = rows.get(key) ?? [];
    list.push(seat);
    rows.set(key, list);
  }

  type Pair = { seats: [SeatRow, SeatRow]; score: number };
  const pairs: Pair[] = [];

  for (const [, rowSeats] of rows) {
    rowSeats.sort((a, b) => a.seatIndex - b.seatIndex);
    for (let i = 0; i < rowSeats.length - 1; i += 1) {
      const a = rowSeats[i]!;
      const b = rowSeats[i + 1]!;
      if (b.seatIndex !== a.seatIndex + 1) continue;
      const mid = (a.seatIndex + b.seatIndex) / 2;
      const score = a.rowIndex * 100 + Math.abs(mid - 10);
      pairs.push({ seats: [a, b], score });
    }
  }

  pairs.sort((a, b) => a.score - b.score);

  const picked: SeatRow[] = [];
  const used = new Set<string>();
  for (const pair of pairs) {
    if (picked.length / 2 >= pairCount) break;
    if (used.has(pair.seats[0].id) || used.has(pair.seats[1].id)) continue;
    picked.push(pair.seats[0], pair.seats[1]);
    used.add(pair.seats[0].id);
    used.add(pair.seats[1].id);
  }

  return picked.length === pairCount * 2 ? picked : [];
}

/** For each wheelchair seat, attach one adjacent free companion seat. */
export function assignCompanionSeats(
  wheelchairSeats: SeatRow[],
  availablePool: SeatRow[],
): SeatRow[] | null {
  const available = availablePool.filter(
    (s) => s.status === "available" && !wheelchairSeats.some((w) => w.id === s.id),
  );
  const byKey = new Map(available.map((s) => [`${s.blockObjectId}:${s.rowIndex}:${s.seatIndex}`, s]));
  const result: SeatRow[] = [];
  const used = new Set<string>();

  for (const wc of wheelchairSeats) {
    const candidates = [wc.seatIndex + 1, wc.seatIndex - 1]
      .map((idx) => byKey.get(`${wc.blockObjectId}:${wc.rowIndex}:${idx}`))
      .filter((s): s is SeatRow => s != null && !used.has(s.id));

    const companion = candidates[0];
    if (!companion) return null;
    result.push(wc, companion);
    used.add(companion.id);
  }

  return result;
}

function pickCenteredSlice(run: SeatRow[], quantity: number): SeatRow[] {
  if (run.length === quantity) return run;
  const start = Math.max(0, Math.floor((run.length - quantity) / 2));
  return run.slice(start, start + quantity);
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
