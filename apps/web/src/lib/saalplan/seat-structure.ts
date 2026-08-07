/**
 * Seat-block geometry: rows → segments with aisle boundaries.
 * Adjacency for Bestplatz / gap rules uses segments — never raw seatNumber±1 across aisles.
 *
 * Prefer `blockAisles` for gang/interruption that spans the whole block.
 * Per-row `rowDefs[].aisles` still load (legacy); resolve merges both (block wins on conflict).
 */

export type PlanSeatType = "standard" | "wheelchair" | "companion";

export type RowAisle = {
  /** Aisle sits after this seat number (numbering continues across the aisle). */
  afterSeatNumber: number;
  /** Gap width in cm (e.g. 150 = 1,50 m). */
  widthCm: number;
};

export type SeatBlockRowDef = {
  rowIndex: number;
  rowLabel?: string;
  /** Highest seat number in this row; defaults to block.seatsPerRow. */
  seatCount?: number;
  aisles?: RowAisle[];
  /** Seat numbers with no geometric seat (FOH / pillar) — not sellable, not capacity. */
  removedSeatNumbers?: number[];
  /** seatNumber (string key) → type */
  seatTypes?: Record<string, PlanSeatType>;
  /** companion seatNumber → wheelchair seatNumber */
  companionOf?: Record<string, number>;
};

export type SeatBlockStructureInput = {
  rows?: number | null;
  seatsPerRow?: number | null;
  /** Block-wide aisles — applied to every row where afterSeatNumber < seatCount. */
  blockAisles?: RowAisle[] | null;
  rowDefs?: SeatBlockRowDef[] | null;
};

/** Result of mutators that may rewrite both block- and row-level aisle data. */
export type SeatBlockAisleMutation = {
  blockAisles: RowAisle[];
  rowDefs: SeatBlockRowDef[];
};

export type ResolvedSegment = {
  rowIndex: number;
  segmentIndex: number;
  /** Ordered seat numbers that exist geometrically in this segment. */
  seatNumbers: number[];
};

export type ResolvedSeatSlot = {
  rowIndex: number;
  rowLabel: string;
  seatNumber: number;
  segmentIndex: number;
  positionInSegment: number;
  seatType: PlanSeatType;
  companionOfSeatNumber: number | null;
};

export type ResolvedRowLayout = {
  rowIndex: number;
  rowLabel: string;
  seatCount: number;
  aisles: RowAisle[];
  removedSeatNumbers: number[];
  segments: ResolvedSegment[];
  seats: ResolvedSeatSlot[];
};

function clampPositiveInt(n: unknown, fallback: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return fallback;
  return v;
}

function parseSeatType(raw: unknown): PlanSeatType {
  if (raw === "wheelchair" || raw === "companion") return raw;
  return "standard";
}

export function parseRowAisle(raw: unknown): RowAisle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const afterSeatNumber = Math.round(Number(o.afterSeatNumber));
  const widthCm = Math.round(Number(o.widthCm));
  if (!Number.isFinite(afterSeatNumber) || afterSeatNumber < 1) return null;
  if (!Number.isFinite(widthCm) || widthCm < 1) return null;
  return { afterSeatNumber, widthCm: Math.max(10, widthCm) };
}

export function parseBlockAisles(raw: unknown): RowAisle[] {
  if (!Array.isArray(raw)) return [];
  const byAfter = new Map<number, RowAisle>();
  for (const item of raw) {
    const aisle = parseRowAisle(item);
    if (!aisle) continue;
    byAfter.set(aisle.afterSeatNumber, aisle);
  }
  return [...byAfter.values()].sort((a, b) => a.afterSeatNumber - b.afterSeatNumber);
}

/** Merge block-wide + per-row aisles; block entry wins on same afterSeatNumber. */
export function mergeAislesForRow(
  blockAisles: RowAisle[] | null | undefined,
  rowAisles: RowAisle[] | null | undefined,
  seatCount: number,
): RowAisle[] {
  const byAfter = new Map<number, RowAisle>();
  for (const a of rowAisles ?? []) {
    if (a.afterSeatNumber >= 1 && a.afterSeatNumber < seatCount) {
      byAfter.set(a.afterSeatNumber, {
        afterSeatNumber: a.afterSeatNumber,
        widthCm: Math.max(10, Math.round(a.widthCm)),
      });
    }
  }
  for (const a of blockAisles ?? []) {
    if (a.afterSeatNumber >= 1 && a.afterSeatNumber < seatCount) {
      byAfter.set(a.afterSeatNumber, {
        afterSeatNumber: a.afterSeatNumber,
        widthCm: Math.max(10, Math.round(a.widthCm)),
      });
    }
  }
  return [...byAfter.values()].sort((a, b) => a.afterSeatNumber - b.afterSeatNumber);
}

function normalizeAisleList(aisles: RowAisle[]): RowAisle[] {
  const byAfter = new Map<number, RowAisle>();
  for (const a of aisles) {
    if (a.afterSeatNumber < 1) continue;
    byAfter.set(a.afterSeatNumber, {
      afterSeatNumber: a.afterSeatNumber,
      widthCm: Math.max(10, Math.round(a.widthCm)),
    });
  }
  return [...byAfter.values()].sort((a, b) => a.afterSeatNumber - b.afterSeatNumber);
}

function stripAisleFromRowDefs(
  rowDefs: SeatBlockRowDef[],
  afterSeatNumber: number,
): SeatBlockRowDef[] {
  return rowDefs.map((def) => {
    if (!def.aisles?.length) return def;
    const aisles = def.aisles.filter((a) => a.afterSeatNumber !== afterSeatNumber);
    if (aisles.length === def.aisles.length) return def;
    const next = { ...def };
    if (aisles.length) next.aisles = aisles;
    else delete next.aisles;
    return next;
  });
}

/**
 * Promote per-row aisles that match across all eligible rows into `blockAisles`.
 * Leaves unmatched / row-only aisles on rowDefs. Idempotent.
 */
export function promoteMatchingRowAislesToBlock(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[]; blockAisles?: RowAisle[] },
): SeatBlockAisleMutation {
  const rowCount = clampPositiveInt(block.rows, 0);
  const defaultSeats = clampPositiveInt(block.seatsPerRow, 1);
  let rowDefs = ensureAllRowDefs(block);
  const blockAisles = normalizeAisleList([...(block.blockAisles ?? [])]);

  if (rowCount < 1) {
    return { blockAisles, rowDefs };
  }

  type Cand = { widthCm: number; rows: number };
  const candidates = new Map<number, Cand>();

  for (let r = 1; r <= rowCount; r += 1) {
    const def = rowDefs.find((d) => d.rowIndex === r);
    const seatCount = clampPositiveInt(def?.seatCount ?? defaultSeats, defaultSeats);
    for (const a of def?.aisles ?? []) {
      if (a.afterSeatNumber < 1 || a.afterSeatNumber >= seatCount) continue;
      // Already represented at block level — will be stripped below.
      if (blockAisles.some((b) => b.afterSeatNumber === a.afterSeatNumber)) continue;
      const prev = candidates.get(a.afterSeatNumber);
      if (!prev) {
        candidates.set(a.afterSeatNumber, { widthCm: a.widthCm, rows: 1 });
      } else if (prev.widthCm === a.widthCm) {
        prev.rows += 1;
      } else {
        // Conflicting widths across rows — do not promote this afterSeat.
        candidates.set(a.afterSeatNumber, { widthCm: -1, rows: -1 });
      }
    }
  }

  const promoted: RowAisle[] = [...blockAisles];
  for (const [afterSeatNumber, cand] of candidates) {
    if (cand.rows < 1 || cand.widthCm < 1) continue;
    // Eligible rows: those long enough for this aisle position.
    let eligible = 0;
    for (let r = 1; r <= rowCount; r += 1) {
      const def = rowDefs.find((d) => d.rowIndex === r);
      const seatCount = clampPositiveInt(def?.seatCount ?? defaultSeats, defaultSeats);
      if (afterSeatNumber < seatCount) eligible += 1;
    }
    if (eligible > 0 && cand.rows === eligible) {
      promoted.push({ afterSeatNumber, widthCm: Math.max(10, Math.round(cand.widthCm)) });
    }
  }

  const nextBlock = normalizeAisleList(promoted);
  for (const a of nextBlock) {
    rowDefs = stripAisleFromRowDefs(rowDefs, a.afterSeatNumber);
  }
  return { blockAisles: nextBlock, rowDefs };
}

function ensureAllRowDefs(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
): SeatBlockRowDef[] {
  const rowCount = clampPositiveInt(block.rows, 1);
  const defaultSeats = clampPositiveInt(block.seatsPerRow, 1);
  const existing = new Map(
    (block.rowDefs ?? [])
      .map((d) => parseSeatBlockRowDef(d) ?? d)
      .filter((d): d is SeatBlockRowDef => Boolean(d?.rowIndex))
      .map((d) => [d.rowIndex, d]),
  );
  for (let r = 1; r <= rowCount; r += 1) {
    if (!existing.has(r)) {
      existing.set(r, { rowIndex: r, seatCount: defaultSeats });
    }
  }
  return [...existing.values()].sort((a, b) => a.rowIndex - b.rowIndex);
}

export function parseSeatBlockRowDef(raw: unknown): SeatBlockRowDef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rowIndex = Math.round(Number(o.rowIndex));
  if (!Number.isFinite(rowIndex) || rowIndex < 1) return null;
  const def: SeatBlockRowDef = { rowIndex };
  if (typeof o.rowLabel === "string" && o.rowLabel.trim()) {
    def.rowLabel = o.rowLabel.trim();
  }
  if (typeof o.seatCount === "number" && Number.isFinite(o.seatCount)) {
    def.seatCount = Math.max(1, Math.round(o.seatCount));
  }
  if (Array.isArray(o.aisles)) {
    const aisles = o.aisles.map(parseRowAisle).filter((a): a is RowAisle => Boolean(a));
    if (aisles.length) def.aisles = aisles;
  }
  if (Array.isArray(o.removedSeatNumbers)) {
    const removed = [
      ...new Set(
        o.removedSeatNumbers
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1),
      ),
    ].sort((a, b) => a - b);
    if (removed.length) def.removedSeatNumbers = removed;
  }
  if (o.seatTypes && typeof o.seatTypes === "object" && !Array.isArray(o.seatTypes)) {
    const seatTypes: Record<string, PlanSeatType> = {};
    for (const [k, v] of Object.entries(o.seatTypes as Record<string, unknown>)) {
      seatTypes[k] = parseSeatType(v);
    }
    if (Object.keys(seatTypes).length) def.seatTypes = seatTypes;
  }
  if (o.companionOf && typeof o.companionOf === "object" && !Array.isArray(o.companionOf)) {
    const companionOf: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.companionOf as Record<string, unknown>)) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 1) companionOf[k] = n;
    }
    if (Object.keys(companionOf).length) def.companionOf = companionOf;
  }
  return def;
}

/** Split 1..seatCount into segments at aisle boundaries; removed seats are dropped. */
export function buildSegmentsForRow(input: {
  rowIndex: number;
  seatCount: number;
  aisles?: RowAisle[];
  removedSeatNumbers?: number[];
}): ResolvedSegment[] {
  const seatCount = Math.max(0, Math.round(input.seatCount));
  const removed = new Set(input.removedSeatNumbers ?? []);
  const aisleAfter = new Set(
    (input.aisles ?? [])
      .map((a) => a.afterSeatNumber)
      .filter((n) => n >= 1 && n < seatCount),
  );

  const segments: ResolvedSegment[] = [];
  let current: number[] = [];
  let segmentIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    segments.push({
      rowIndex: input.rowIndex,
      segmentIndex,
      seatNumbers: current,
    });
    segmentIndex += 1;
    current = [];
  };

  for (let n = 1; n <= seatCount; n += 1) {
    if (!removed.has(n)) {
      current.push(n);
    } else {
      // Removed seat is a hard boundary (like an aisle).
      flush();
    }
    if (aisleAfter.has(n)) {
      flush();
    }
  }
  flush();
  return segments;
}

export function resolveSeatBlockRows(block: SeatBlockStructureInput): ResolvedRowLayout[] {
  const rowCount = clampPositiveInt(block.rows, 0);
  if (rowCount < 1) return [];
  const defaultSeats = clampPositiveInt(block.seatsPerRow, 1);
  const blockAisles = parseBlockAisles(block.blockAisles);
  const defsByRow = new Map<number, SeatBlockRowDef>();
  for (const raw of block.rowDefs ?? []) {
    const def = raw && typeof raw === "object" ? raw : null;
    if (!def) continue;
    const parsed =
      "rowIndex" in def && typeof (def as SeatBlockRowDef).rowIndex === "number"
        ? (def as SeatBlockRowDef)
        : parseSeatBlockRowDef(def);
    if (parsed) defsByRow.set(parsed.rowIndex, parsed);
  }

  const layouts: ResolvedRowLayout[] = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const def = defsByRow.get(r);
    const seatCount = clampPositiveInt(def?.seatCount ?? defaultSeats, defaultSeats);
    const aisles = mergeAislesForRow(blockAisles, def?.aisles, seatCount);
    const removedSeatNumbers = [...(def?.removedSeatNumbers ?? [])].sort((a, b) => a - b);
    const segments = buildSegmentsForRow({
      rowIndex: r,
      seatCount,
      aisles,
      removedSeatNumbers,
    });
    const rowLabel = def?.rowLabel?.trim() || String(r);
    const seats: ResolvedSeatSlot[] = [];
    for (const seg of segments) {
      seg.seatNumbers.forEach((seatNumber, positionInSegment) => {
        const key = String(seatNumber);
        seats.push({
          rowIndex: r,
          rowLabel,
          seatNumber,
          segmentIndex: seg.segmentIndex,
          positionInSegment,
          seatType: parseSeatType(def?.seatTypes?.[key]),
          companionOfSeatNumber:
            typeof def?.companionOf?.[key] === "number" ? def.companionOf[key]! : null,
        });
      });
    }
    layouts.push({
      rowIndex: r,
      rowLabel,
      seatCount,
      aisles,
      removedSeatNumbers,
      segments,
      seats,
    });
  }
  return layouts;
}

/** Geometric (sellable inventory) seat count — excludes removed. */
export function countGeometricSeats(block: SeatBlockStructureInput): number {
  return resolveSeatBlockRows(block).reduce((sum, row) => sum + row.seats.length, 0);
}

/** Max seat number across rows (for legacy seatsPerRow / grid width). */
export function maxSeatNumberInBlock(block: SeatBlockStructureInput): number {
  const rows = resolveSeatBlockRows(block);
  if (rows.length === 0) return Math.max(0, Math.round(block.seatsPerRow ?? 0));
  return Math.max(0, ...rows.map((r) => r.seatCount));
}

/** Total aisle width (cm) for the widest row — drives block width. */
export function maxAisleWidthSumCm(block: SeatBlockStructureInput): number {
  const rows = resolveSeatBlockRows(block);
  let max = 0;
  for (const row of rows) {
    const sum = row.aisles.reduce((s, a) => s + a.widthCm, 0);
    if (sum > max) max = sum;
  }
  return max;
}

export function areSegmentNeighbors(a: {
  blockObjectId: string;
  rowIndex: number;
  segmentIndex: number;
  positionInSegment: number;
}, b: {
  blockObjectId: string;
  rowIndex: number;
  segmentIndex: number;
  positionInSegment: number;
}): boolean {
  return (
    a.blockObjectId === b.blockObjectId &&
    a.rowIndex === b.rowIndex &&
    a.segmentIndex === b.segmentIndex &&
    Math.abs(a.positionInSegment - b.positionInSegment) === 1
  );
}

/**
 * Upsert a row def on a seat_block (immutable helper).
 * Ensures rowDefs exist for all rows when mutating structure.
 */
export function upsertRowDef(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
  rowIndex: number,
  patch: Partial<Omit<SeatBlockRowDef, "rowIndex">>,
): SeatBlockRowDef[] {
  const existing = new Map(ensureAllRowDefs(block).map((d) => [d.rowIndex, d]));
  const defaultSeats = clampPositiveInt(block.seatsPerRow, 1);
  const prev = existing.get(rowIndex) ?? { rowIndex, seatCount: defaultSeats };
  existing.set(rowIndex, { ...prev, ...patch, rowIndex });
  return [...existing.values()].sort((a, b) => a.rowIndex - b.rowIndex);
}

/**
 * Add / upsert a block-wide aisle (gang) after seat N for every row in the block.
 * Matching per-row aisles at the same afterSeatNumber are stripped (unified).
 */
export function addAisleToBlock(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[]; blockAisles?: RowAisle[] },
  aisle: RowAisle,
): SeatBlockAisleMutation {
  const maxSeat = maxSeatNumberInBlock(block);
  if (aisle.afterSeatNumber < 1 || aisle.afterSeatNumber >= maxSeat) {
    return {
      blockAisles: parseBlockAisles(block.blockAisles),
      rowDefs: ensureAllRowDefs(block),
    };
  }
  const widthCm = Math.max(10, Math.round(aisle.widthCm));
  const blockAisles = normalizeAisleList([
    ...(block.blockAisles ?? []).filter((a) => a.afterSeatNumber !== aisle.afterSeatNumber),
    { afterSeatNumber: aisle.afterSeatNumber, widthCm },
  ]);
  let rowDefs = ensureAllRowDefs(block);
  rowDefs = stripAisleFromRowDefs(rowDefs, aisle.afterSeatNumber);
  return { blockAisles, rowDefs };
}

/** Remove a block-wide aisle and matching per-row copies at the same afterSeatNumber. */
export function removeAisleFromBlock(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[]; blockAisles?: RowAisle[] },
  afterSeatNumber: number,
): SeatBlockAisleMutation {
  const blockAisles = normalizeAisleList(
    (block.blockAisles ?? []).filter((a) => a.afterSeatNumber !== afterSeatNumber),
  );
  let rowDefs = ensureAllRowDefs(block);
  rowDefs = stripAisleFromRowDefs(rowDefs, afterSeatNumber);
  return { blockAisles, rowDefs };
}

/** @deprecated Prefer addAisleToBlock — kept for legacy single-row edits / tests. */
export function addAisleToRow(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
  rowIndex: number,
  aisle: RowAisle,
): SeatBlockRowDef[] {
  const layouts = resolveSeatBlockRows(block);
  const row = layouts.find((r) => r.rowIndex === rowIndex);
  const seatCount = row?.seatCount ?? clampPositiveInt(block.seatsPerRow, 1);
  if (aisle.afterSeatNumber < 1 || aisle.afterSeatNumber >= seatCount) {
    return block.rowDefs ?? [];
  }
  const prev = (block.rowDefs ?? []).find((d) => d.rowIndex === rowIndex);
  // Effective aisles already include blockAisles; store only row-local extras + this aisle.
  const blockAfter = new Set((block.blockAisles ?? []).map((a) => a.afterSeatNumber));
  const aisles = [...(prev?.aisles ?? [])]
    .filter((a) => a.afterSeatNumber !== aisle.afterSeatNumber)
    .filter((a) => !blockAfter.has(a.afterSeatNumber));
  // If this position is already a block aisle, don't duplicate on the row.
  if (!blockAfter.has(aisle.afterSeatNumber)) {
    aisles.push({
      afterSeatNumber: aisle.afterSeatNumber,
      widthCm: Math.max(10, Math.round(aisle.widthCm)),
    });
  }
  aisles.sort((a, b) => a.afterSeatNumber - b.afterSeatNumber);
  return upsertRowDef(block, rowIndex, { seatCount, aisles: aisles.length ? aisles : undefined });
}

export function toggleRemovedSeat(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
  rowIndex: number,
  seatNumber: number,
  removed: boolean,
): SeatBlockRowDef[] {
  const layouts = resolveSeatBlockRows(block);
  const row = layouts.find((r) => r.rowIndex === rowIndex);
  const seatCount = row?.seatCount ?? clampPositiveInt(block.seatsPerRow, 1);
  const set = new Set(row?.removedSeatNumbers ?? []);
  if (removed) set.add(seatNumber);
  else set.delete(seatNumber);
  return upsertRowDef(block, rowIndex, {
    seatCount,
    removedSeatNumbers: [...set].sort((a, b) => a - b),
  });
}

export function setSeatTypeInRow(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
  rowIndex: number,
  seatNumber: number,
  seatType: PlanSeatType,
): SeatBlockRowDef[] {
  const layouts = resolveSeatBlockRows(block);
  const row = layouts.find((r) => r.rowIndex === rowIndex);
  const seatCount = row?.seatCount ?? clampPositiveInt(block.seatsPerRow, 1);
  const prev = (block.rowDefs ?? []).find((d) => d.rowIndex === rowIndex);
  const seatTypes = { ...(prev?.seatTypes ?? {}) };
  if (seatType === "standard") delete seatTypes[String(seatNumber)];
  else seatTypes[String(seatNumber)] = seatType;
  return upsertRowDef(block, rowIndex, {
    seatCount,
    seatTypes: Object.keys(seatTypes).length ? seatTypes : undefined,
  });
}

export function linkCompanionSeat(
  block: SeatBlockStructureInput & { rowDefs?: SeatBlockRowDef[] },
  rowIndex: number,
  companionSeatNumber: number,
  wheelchairSeatNumber: number | null,
): SeatBlockRowDef[] {
  const layouts = resolveSeatBlockRows(block);
  const row = layouts.find((r) => r.rowIndex === rowIndex);
  const seatCount = row?.seatCount ?? clampPositiveInt(block.seatsPerRow, 1);
  const prev = (block.rowDefs ?? []).find((d) => d.rowIndex === rowIndex);
  const companionOf = { ...(prev?.companionOf ?? {}) };
  if (wheelchairSeatNumber == null) delete companionOf[String(companionSeatNumber)];
  else companionOf[String(companionSeatNumber)] = wheelchairSeatNumber;
  return upsertRowDef(block, rowIndex, {
    seatCount,
    companionOf: Object.keys(companionOf).length ? companionOf : undefined,
  });
}
