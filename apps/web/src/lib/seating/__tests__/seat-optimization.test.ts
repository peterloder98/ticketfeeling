import { describe, expect, it } from "vitest";
import {
  addAisleToRow,
  buildSegmentsForRow,
  countGeometricSeats,
  resolveSeatBlockRows,
  toggleRemovedSeat,
} from "@/lib/saalplan/seat-structure";
import {
  pickBestAvailableSeats,
  validateSeatSelection,
} from "@/lib/seating/best-available";
import {
  computeOccupancyPercent,
  pickBestSliceInRun,
  remnantSizes,
} from "@/lib/seating/seat-optimization";
import { parseVenuePlanObjects, seatCountOfObject } from "@/lib/saalplan/types";

function seat(
  id: string,
  block: string,
  row: number,
  index: number,
  opts?: {
    status?: "available" | "held" | "sold";
    segmentIndex?: number;
    positionInSegment?: number;
    locked?: boolean;
  },
) {
  return {
    id,
    seatKey: `${block}:R${row}:S${index}`,
    blockObjectId: block,
    blockLabel: block,
    rowIndex: row,
    seatIndex: index,
    rowLabel: String(row),
    seatNumber: String(index),
    status: opts?.status ?? "available",
    locked: opts?.locked ?? false,
    segmentIndex: opts?.segmentIndex ?? 0,
    positionInSegment: opts?.positionInSegment ?? index - 1,
  };
}

describe("seat-structure aisles & removed", () => {
  it("migrates legacy rows to a single segment", () => {
    const rows = resolveSeatBlockRows({ rows: 2, seatsPerRow: 8 });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.segments).toHaveLength(1);
    expect(rows[0]!.segments[0]!.seatNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(countGeometricSeats({ rows: 2, seatsPerRow: 8 })).toBe(16);
  });

  it("splits a row at an aisle — 12 and 13 are not neighbors", () => {
    const segments = buildSegmentsForRow({
      rowIndex: 1,
      seatCount: 25,
      aisles: [{ afterSeatNumber: 12, widthCm: 150 }],
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.seatNumbers.at(-1)).toBe(12);
    expect(segments[1]!.seatNumbers[0]).toBe(13);
  });

  it("removed seats are hard boundaries and drop capacity", () => {
    const segments = buildSegmentsForRow({
      rowIndex: 1,
      seatCount: 10,
      removedSeatNumbers: [5],
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.seatNumbers).toEqual([1, 2, 3, 4]);
    expect(segments[1]!.seatNumbers).toEqual([6, 7, 8, 9, 10]);
    expect(
      countGeometricSeats({
        rows: 1,
        seatsPerRow: 10,
        rowDefs: [{ rowIndex: 1, removedSeatNumbers: [5] }],
      }),
    ).toBe(9);
  });

  it("removing seat 5 does not renumber 6–10", () => {
    const block = { rows: 1, seatsPerRow: 10, rowDefs: [] as ReturnType<typeof toggleRemovedSeat> };
    block.rowDefs = toggleRemovedSeat(block, 1, 5, true);
    const seats = resolveSeatBlockRows(block)[0]!.seats.map((s) => s.seatNumber);
    expect(seats).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
  });

  it("addAisleToRow writes rowDefs for mid-aisle example", () => {
    const block = { rows: 2, seatsPerRow: 25 };
    const rowDefs = addAisleToRow(block, 1, { afterSeatNumber: 12, widthCm: 150 });
    const resolved = resolveSeatBlockRows({ ...block, rowDefs });
    expect(resolved[0]!.segments).toHaveLength(2);
    expect(resolved[1]!.segments).toHaveLength(1); // row 2 untouched single segment
  });

  it("parseVenuePlanObjects keeps rowDefs and foh", () => {
    const objects = parseVenuePlanObjects([
      {
        id: "b1",
        type: "seat_block",
        xCm: 100,
        yCm: 100,
        widthCm: 500,
        heightCm: 200,
        rotationDeg: 0,
        rows: 1,
        seatsPerRow: 10,
        rowDefs: [{ rowIndex: 1, aisles: [{ afterSeatNumber: 4, widthCm: 120 }] }],
      },
      {
        id: "f1",
        type: "foh",
        xCm: 50,
        yCm: 50,
        widthCm: 100,
        heightCm: 80,
        rotationDeg: 0,
        label: "FOH",
      },
    ]);
    expect(objects[0]!.rowDefs?.[0]?.aisles?.[0]?.afterSeatNumber).toBe(4);
    expect(objects[1]!.type).toBe("foh");
    expect(seatCountOfObject(objects[0]!)).toBe(10);
  });
});

describe("Bestplatz remnant & gap rules", () => {
  it("from free block of 8 taking 3 prefers no singleton remnant (avoid 1+4)", () => {
    const run = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => seat(String(n), "A", 1, n));
    const picked = pickBestSliceInRun(run, 3, {
      settings: {
        preferContiguous: true,
        preventNewSingletonGaps: true,
        intelligentRemnantOptimization: true,
        gapRuleRelaxOccupancyPercent: 90,
      },
    });
    const offset = run.findIndex((s) => s.id === picked[0]?.id);
    const rem = remnantSizes(8, 3, offset);
    expect(rem.includes(1)).toBe(false);
  });

  it("A: creating a new singleton gap is blocked", () => {
    const seats = [1, 2, 3, 4, 5].map((n) => seat(String(n), "A", 1, n));
    // Selecting 2 and 4 leaves 3 alone.
    const result = validateSeatSelection(seats, ["2", "4"], {
      settings: {
        preferContiguous: true,
        preventNewSingletonGaps: true,
        intelligentRemnantOptimization: true,
        gapRuleRelaxOccupancyPercent: 90,
      },
      occupancyPercent: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CREATES_SINGLETON_GAP");
      expect(result.problemSeatIds).toContain("3");
    }
  });

  it("B: buying an existing singleton gap is allowed", () => {
    const seats = [
      seat("1", "A", 1, 1, { status: "sold" }),
      seat("2", "A", 1, 2), // existing singleton
      seat("3", "A", 1, 3, { status: "sold" }),
      seat("4", "A", 1, 4),
      seat("5", "A", 1, 5),
    ];
    const result = validateSeatSelection(seats, ["2"], {
      settings: {
        preferContiguous: true,
        preventNewSingletonGaps: true,
        intelligentRemnantOptimization: true,
        gapRuleRelaxOccupancyPercent: 90,
      },
      occupancyPercent: 40,
    });
    expect(result.ok).toBe(true);
  });

  it("does not cross aisle segments for Bestplatz", () => {
    // Segment 0: 1-3, Segment 1: 4-6 (aisle between 3 and 4)
    const seats = [
      seat("1", "A", 1, 1, { segmentIndex: 0, positionInSegment: 0 }),
      seat("2", "A", 1, 2, { segmentIndex: 0, positionInSegment: 1 }),
      seat("3", "A", 1, 3, { segmentIndex: 0, positionInSegment: 2 }),
      seat("4", "A", 1, 4, { segmentIndex: 1, positionInSegment: 0 }),
      seat("5", "A", 1, 5, { segmentIndex: 1, positionInSegment: 1 }),
      seat("6", "A", 1, 6, { segmentIndex: 1, positionInSegment: 2 }),
    ];
    const picked = pickBestAvailableSeats(seats, 3);
    expect(picked).toHaveLength(3);
    const segs = new Set(picked.map((s) => s.segmentIndex ?? 0));
    expect(segs.size).toBe(1);
  });

  it("locked seats are barriers; occupancy ignores locked", () => {
    const seats = [
      seat("1", "A", 1, 1),
      seat("2", "A", 1, 2, { locked: true }),
      seat("3", "A", 1, 3),
      seat("4", "A", 1, 4, { status: "sold" }),
    ];
    // unlocked: 1 avail, 3 avail, 4 sold → 1/3 ≈ 33.3%
    expect(computeOccupancyPercent(seats)).toBeCloseTo(33.3, 0);
    // Only two free seats, not contiguous — still fills quantity from partitions.
    const picked = pickBestAvailableSeats(seats, 2);
    expect(picked.map((s) => s.id).sort()).toEqual(["1", "3"]);
    // Contiguous pair of 2 is impossible across the lock.
    expect(pickBestAvailableSeats(seats, 2).every((s) => s.id !== "2")).toBe(true);
  });

  it("relaxes hard gap block above occupancy threshold", () => {
    const seats = [1, 2, 3, 4, 5].map((n) => seat(String(n), "A", 1, n));
    const result = validateSeatSelection(seats, ["2", "4"], {
      settings: {
        preferContiguous: true,
        preventNewSingletonGaps: true,
        intelligentRemnantOptimization: true,
        gapRuleRelaxOccupancyPercent: 90,
      },
      occupancyPercent: 95,
    });
    expect(result.ok).toBe(true);
  });
});
