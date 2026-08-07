/**
 * Central seat optimization: Bestplatz scoring, remnant awareness, singleton-gap rules.
 * Adjacency is segment-based (same block + row + segment + consecutive positionInSegment).
 */

import { formatSeatLabel } from "@/lib/seating/types";
import {
  DEFAULT_SEAT_OPTIMIZATION,
  type SeatOptimizationSettings,
} from "@/lib/seating/seat-optimization-settings";

/** Centralized weights — never scatter magic numbers at call sites. */
export const SEAT_OPT_WEIGHTS = {
  /** Prefer front rows (lower score wins). */
  ROW_INDEX: 100,
  /** Soft bias toward mid seat numbers (~10). */
  CENTER_BIAS: 1,
  /** Slight preference for longer free runs when scoring the run itself. */
  RUN_LENGTH_BONUS: -2,
  /** Heavy: leaving a singleton remnant inside a taken slice. */
  SINGLETON_CREATED: 10_000,
  /** Mild preference against awkward remnant sizes (e.g. leave 3 vs leave 2+3). */
  ODD_REMNANT: 8,
  /** Prefer balanced leftovers: penalize remnant length 1 already covered; length 3 mild. */
  REMNANT_SIZE_PENALTY: 3,
  /** Fallback partitions: prefer fewer fragments (2+2 over 3+1+0). */
  PARTITION_FRAGMENT: 80,
  /** Prefer larger fragments when splitting (3+1 worse than 2+2 via singleton + this). */
  PARTITION_UNBALANCED: 40,
  /** Prefer contiguous single-run solutions over multi-run. */
  MULTI_RUN_PENALTY: 500,
} as const;

export type OptSeat = {
  id: string;
  seatKey: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  status: string;
  locked?: boolean;
  /** Segment adjacency — defaults to 0 / seatIndex-1 for legacy seats. */
  segmentIndex?: number | null;
  positionInSegment?: number | null;
};

export type SeatOptimizationContext = {
  settings?: Partial<SeatOptimizationSettings> | null;
  /**
   * Occupancy 0–100 over sellable (unlocked) seats.
   * Above gapRuleRelaxOccupancyPercent: no hard-block on new singletons.
   */
  occupancyPercent?: number | null;
};

function settingsOf(ctx?: SeatOptimizationContext | null): SeatOptimizationSettings {
  return { ...DEFAULT_SEAT_OPTIMIZATION, ...(ctx?.settings ?? {}) };
}

function segKey(s: OptSeat) {
  const segmentIndex = s.segmentIndex ?? 0;
  return `${s.blockObjectId}:${s.rowIndex}:${segmentIndex}`;
}

function positionOf(s: OptSeat) {
  if (typeof s.positionInSegment === "number" && Number.isFinite(s.positionInSegment)) {
    return s.positionInSegment;
  }
  // Legacy: dense seatIndex within a single segment.
  return Math.max(0, s.seatIndex - 1);
}

function isSellableAvailable(s: OptSeat) {
  return s.status === "available" && !s.locked && !s.seatKey.includes(":ST:");
}

/** Occupancy over unlocked seats only (held+sold) / (all unlocked). */
export function computeOccupancyPercent(
  seats: { status: string; locked?: boolean }[],
): number {
  const sellable = seats.filter((s) => !s.locked);
  if (sellable.length === 0) return 0;
  const taken = sellable.filter((s) => s.status === "held" || s.status === "sold").length;
  return Math.round((taken / sellable.length) * 1000) / 10;
}

export function gapRuleRelaxed(
  ctx?: SeatOptimizationContext | null,
): boolean {
  const settings = settingsOf(ctx);
  const occ = ctx?.occupancyPercent;
  if (typeof occ !== "number" || !Number.isFinite(occ)) return false;
  return occ >= settings.gapRuleRelaxOccupancyPercent;
}

type FreeRun = { seats: OptSeat[]; key: string };

/** Contiguous free runs using segment adjacency (not seatNumber±1 across aisles). */
export function findFreeRuns(seats: OptSeat[]): FreeRun[] {
  const available = seats.filter(isSellableAvailable);
  const bySeg = new Map<string, OptSeat[]>();
  for (const seat of available) {
    const key = segKey(seat);
    const list = bySeg.get(key) ?? [];
    list.push(seat);
    bySeg.set(key, list);
  }

  const runs: FreeRun[] = [];
  for (const [key, list] of bySeg) {
    list.sort((a, b) => positionOf(a) - positionOf(b));
    let start = 0;
    while (start < list.length) {
      let end = start;
      while (
        end + 1 < list.length &&
        positionOf(list[end + 1]!) === positionOf(list[end]!) + 1
      ) {
        end += 1;
      }
      runs.push({ seats: list.slice(start, end + 1), key });
      start = end + 1;
    }
  }
  return runs;
}

/** Singleton free seats in the current availability (existing gaps). */
export function findSingletonSeatIds(seats: OptSeat[]): Set<string> {
  const ids = new Set<string>();
  for (const run of findFreeRuns(seats)) {
    if (run.seats.length === 1) ids.add(run.seats[0]!.id);
  }
  return ids;
}

/**
 * Remnant sizes left in a free run after taking `quantity` seats starting at offset.
 * Example: run of 8, take 3 at offset 1 → remnants [1, 4].
 */
export function remnantSizes(runLength: number, quantity: number, offset: number): number[] {
  if (quantity < 1 || quantity > runLength || offset < 0 || offset + quantity > runLength) {
    return [];
  }
  const left = offset;
  const right = runLength - offset - quantity;
  const out: number[] = [];
  if (left > 0) out.push(left);
  if (right > 0) out.push(right);
  return out;
}

function scoreRemnants(
  remnants: number[],
  settings: SeatOptimizationSettings,
): { score: number; createsSingleton: boolean } {
  if (!settings.intelligentRemnantOptimization && !settings.preventNewSingletonGaps) {
    return { score: 0, createsSingleton: remnants.includes(1) };
  }
  let score = 0;
  let createsSingleton = false;
  for (const r of remnants) {
    if (r === 1) {
      createsSingleton = true;
      if (settings.preventNewSingletonGaps || settings.intelligentRemnantOptimization) {
        score += SEAT_OPT_WEIGHTS.SINGLETON_CREATED;
      }
    } else if (settings.intelligentRemnantOptimization) {
      // Prefer larger contiguous leftovers; mild penalty for awkward 3 when alternatives exist.
      score += Math.max(0, 4 - r) * SEAT_OPT_WEIGHTS.REMNANT_SIZE_PENALTY;
      if (r === 3) score += SEAT_OPT_WEIGHTS.ODD_REMNANT;
    }
  }
  return { score, createsSingleton };
}

function qualityScore(run: OptSeat[]): number {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  const mid = (first.seatIndex + last.seatIndex) / 2;
  return (
    first.rowIndex * SEAT_OPT_WEIGHTS.ROW_INDEX +
    Math.abs(mid - 10) * SEAT_OPT_WEIGHTS.CENTER_BIAS +
    run.length * SEAT_OPT_WEIGHTS.RUN_LENGTH_BONUS
  );
}

type SliceCandidate = {
  seats: OptSeat[];
  score: number;
  createsSingleton: boolean;
};

function scoreSlice(
  run: OptSeat[],
  offset: number,
  quantity: number,
  settings: SeatOptimizationSettings,
): SliceCandidate | null {
  if (offset < 0 || offset + quantity > run.length) return null;
  const seats = run.slice(offset, offset + quantity);
  const remnants = remnantSizes(run.length, quantity, offset);
  const rem = scoreRemnants(remnants, settings);
  let score = qualityScore(seats) + rem.score;
  // Prefer centered slices among equal remnant quality (existing Bestplatz feel).
  const centerStart = Math.max(0, Math.floor((run.length - quantity) / 2));
  score += Math.abs(offset - centerStart) * 0.01;
  return { seats, score, createsSingleton: rem.createsSingleton };
}

/**
 * Pick best contiguous slice of `quantity` within a free run (remnant-aware).
 */
export function pickBestSliceInRun(
  run: OptSeat[],
  quantity: number,
  ctx?: SeatOptimizationContext | null,
): OptSeat[] {
  const settings = settingsOf(ctx);
  if (quantity < 1 || run.length < quantity) return [];
  if (!settings.preferContiguous && !settings.intelligentRemnantOptimization) {
    const start = Math.max(0, Math.floor((run.length - quantity) / 2));
    return run.slice(start, start + quantity);
  }

  let best: SliceCandidate | null = null;
  for (let offset = 0; offset <= run.length - quantity; offset += 1) {
    const cand = scoreSlice(run, offset, quantity, settings);
    if (!cand) continue;
    if (!best || cand.score < best.score) best = cand;
  }
  return best?.seats ?? [];
}

/**
 * Bestplatz: prefer one contiguous segment run of N; else remnant-aware partitions.
 * Standing (`:ST:`) is filled only after numbered seats.
 */
export function pickOptimizedSeats(
  seats: OptSeat[],
  quantity: number,
  ctx?: SeatOptimizationContext | null,
): OptSeat[] {
  if (quantity < 1) return [];
  const settings = settingsOf(ctx);
  const numbered = seats.filter((s) => isSellableAvailable(s));
  const standing = seats.filter(
    (s) => s.status === "available" && !s.locked && s.seatKey.includes(":ST:"),
  );

  const fromNumbered = pickFromNumberedPool(numbered, quantity, settings);
  if (fromNumbered.length === quantity) return fromNumbered;
  const need = quantity - fromNumbered.length;
  const fromStanding = standing.slice(0, need);
  if (fromNumbered.length + fromStanding.length < quantity) return [];
  return [...fromNumbered, ...fromStanding];
}

function pickFromNumberedPool(
  seats: OptSeat[],
  quantity: number,
  settings: SeatOptimizationSettings,
): OptSeat[] {
  if (quantity < 1) return [];
  if (seats.length < quantity) return seats.length ? seats.slice(0, Math.min(quantity, seats.length)) : [];

  const runs = findFreeRuns(seats).sort((a, b) => {
    const qa = qualityScore(a.seats);
    const qb = qualityScore(b.seats);
    return qa - qb || b.seats.length - a.seats.length;
  });

  // 1) Single contiguous run ≥ N — remnant-aware slice.
  if (settings.preferContiguous) {
    const longEnough = runs
      .filter((r) => r.seats.length >= quantity)
      .map((r) => {
        const slice = pickBestSliceInRun(r.seats, quantity, { settings });
        const remnants = remnantSizes(
          r.seats.length,
          quantity,
          r.seats.findIndex((s) => s.id === slice[0]?.id),
        );
        const rem = scoreRemnants(remnants, settings);
        return {
          seats: slice,
          score: qualityScore(slice) + rem.score,
        };
      })
      .filter((c) => c.seats.length === quantity)
      .sort((a, b) => a.score - b.score);
    if (longEnough[0]) return longEnough[0].seats;
  }

  // 2) Fallback: partition across runs — prefer N, then larger balanced parts (2+2 over 3+1).
  return pickPartitioned(runs.map((r) => r.seats), quantity, settings);
}

function pickPartitioned(
  runs: OptSeat[][],
  quantity: number,
  settings: SeatOptimizationSettings,
): OptSeat[] {
  // Greedy: take best remnant-aware chunks, preferring larger chunks first.
  const sorted = [...runs].sort((a, b) => b.length - a.length || qualityScore(a) - qualityScore(b));
  const picked: OptSeat[] = [];
  const used = new Set<string>();
  let remaining = quantity;

  while (remaining > 0) {
    let best: { seats: OptSeat[]; score: number } | null = null;
    for (const run of sorted) {
      const free = run.filter((s) => !used.has(s.id));
      if (free.length === 0) continue;
      const take = Math.min(remaining, free.length);
      // Prefer taking the full remaining need in one chunk when possible.
      const candidates = take === remaining ? [take] : [take, ...uniqueDescending(free.length, remaining)];
      for (const n of candidates) {
        if (n < 1 || n > free.length) continue;
        // Avoid creating singleton in this run when we can take differently.
        for (let offset = 0; offset <= free.length - n; offset += 1) {
          // Only contiguous offsets within the free sub-run — free is already a contiguous run slice.
          const slice = free.slice(offset, offset + n);
          if (slice.length !== n) continue;
          // Check contiguity by position
          let contig = true;
          for (let i = 1; i < slice.length; i += 1) {
            if (positionOf(slice[i]!) !== positionOf(slice[i - 1]!) + 1) {
              contig = false;
              break;
            }
          }
          if (!contig) continue;
          const remInFree = remnantSizes(free.length, n, offset);
          const rem = scoreRemnants(remInFree, settings);
          let score =
            qualityScore(slice) +
            rem.score +
            SEAT_OPT_WEIGHTS.MULTI_RUN_PENALTY +
            (remaining - n) * SEAT_OPT_WEIGHTS.PARTITION_FRAGMENT;
          if (n === 1 && remaining > 1) score += SEAT_OPT_WEIGHTS.PARTITION_UNBALANCED;
          // Prefer even splits: when remaining is 4, prefer taking 2 over 3.
          if (remaining >= 4 && n === remaining - 1) score += SEAT_OPT_WEIGHTS.PARTITION_UNBALANCED;
          if (!best || score < best.score) best = { seats: slice, score };
        }
      }
    }
    if (!best || best.seats.length === 0) {
      // Last resort: any remaining free seats.
      for (const run of sorted) {
        for (const s of run) {
          if (picked.length >= quantity) break;
          if (used.has(s.id)) continue;
          picked.push(s);
          used.add(s.id);
        }
      }
      break;
    }
    for (const s of best.seats) {
      picked.push(s);
      used.add(s.id);
    }
    remaining = quantity - picked.length;
  }

  return picked.slice(0, quantity);
}

function uniqueDescending(max: number, remaining: number): number[] {
  const out: number[] = [];
  for (let n = Math.min(max, remaining); n >= 1; n -= 1) out.push(n);
  return out;
}

export type SelectionValidation =
  | { ok: true }
  | {
      ok: false;
      code: "CREATES_SINGLETON_GAP";
      message: string;
      problemSeatIds: string[];
    };

export const SINGLETON_GAP_MESSAGE =
  "Deine Auswahl würde einen einzelnen freien Platz hinterlassen. Bitte wähle nach Möglichkeit direkt angrenzende Plätze.";

/**
 * Manual selection validation: multi-seat need not be contiguous across rows.
 * Only block when selection creates NEW avoidable singletons.
 * Never block buying an already-existing singleton.
 */
export function validateSeatSelection(
  allSeats: OptSeat[],
  selectedIds: string[],
  ctx?: SeatOptimizationContext | null,
): SelectionValidation {
  const settings = settingsOf(ctx);
  if (!settings.preventNewSingletonGaps) return { ok: true };
  if (gapRuleRelaxed(ctx)) return { ok: true };
  if (selectedIds.length === 0) return { ok: true };

  const selected = new Set(selectedIds);
  const beforeSingletons = findSingletonSeatIds(allSeats);

  // Simulate: selected seats become unavailable.
  const after = allSeats.map((s) =>
    selected.has(s.id) ? { ...s, status: "held" } : s,
  );
  const afterSingletons = findSingletonSeatIds(after);

  const newSingletonIds: string[] = [];
  for (const id of afterSingletons) {
    if (!beforeSingletons.has(id) && !selected.has(id)) {
      newSingletonIds.push(id);
    }
  }

  if (newSingletonIds.length === 0) return { ok: true };

  return {
    ok: false,
    code: "CREATES_SINGLETON_GAP",
    message: SINGLETON_GAP_MESSAGE,
    problemSeatIds: newSingletonIds,
  };
}

export function seatSnapshots(seats: OptSeat[]) {
  return seats.map((s) => ({
    seatId: s.id,
    seatKey: s.seatKey,
    blockLabel: s.blockLabel,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    seatLabel: formatSeatLabel(s),
  }));
}
