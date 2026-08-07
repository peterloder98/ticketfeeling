import { describe, expect, it } from "vitest";
import {
  pickBestAvailablePairs,
  pickBestAvailableSeats,
  assignCompanionSeats,
} from "@/lib/seating/best-available";

function seat(
  id: string,
  block: string,
  row: number,
  index: number,
  status: "available" | "held" | "sold" = "available",
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
    status,
    segmentIndex: 0,
    positionInSegment: index - 1,
  };
}

describe("pickBestAvailableSeats", () => {
  it("picks a contiguous run in the front row", () => {
    const seats = [
      seat("a", "A", 1, 1),
      seat("b", "A", 1, 2),
      seat("c", "A", 1, 3),
      seat("d", "A", 2, 1),
      seat("e", "A", 2, 2),
    ];
    const picked = pickBestAvailableSeats(seats, 3);
    expect(picked.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("returns empty when not enough seats", () => {
    expect(pickBestAvailableSeats([seat("a", "A", 1, 1)], 2)).toEqual([]);
  });
});

describe("pickBestAvailablePairs", () => {
  it("returns adjacent pairs", () => {
    const seats = [
      seat("1", "A", 1, 1),
      seat("2", "A", 1, 2),
      seat("3", "A", 1, 3),
      seat("4", "A", 1, 4),
    ];
    const picked = pickBestAvailablePairs(seats, 2);
    expect(picked).toHaveLength(4);
    expect(picked[1]!.seatIndex).toBe(picked[0]!.seatIndex + 1);
    expect(picked[3]!.seatIndex).toBe(picked[2]!.seatIndex + 1);
  });
});

describe("assignCompanionSeats", () => {
  it("assigns the neighboring seat", () => {
    const wc = [seat("w", "A", 3, 5)];
    const pool = [seat("w", "A", 3, 5), seat("c", "A", 3, 6), seat("x", "A", 3, 8)];
    const result = assignCompanionSeats(wc, pool);
    expect(result?.map((s) => s.id)).toEqual(["w", "c"]);
  });

  it("fails when no neighbor is free", () => {
    const wc = [seat("w", "A", 3, 5)];
    const pool = [seat("w", "A", 3, 5), seat("x", "A", 3, 8)];
    expect(assignCompanionSeats(wc, pool)).toBeNull();
  });

  it("does not assign companion across segment aisle", () => {
    const wc = [
      {
        ...seat("w", "A", 1, 3),
        segmentIndex: 0,
        positionInSegment: 2,
      },
    ];
    const pool = [
      wc[0]!,
      {
        ...seat("c", "A", 1, 4),
        segmentIndex: 1,
        positionInSegment: 0,
      },
    ];
    expect(assignCompanionSeats(wc, pool)).toBeNull();
  });
});
