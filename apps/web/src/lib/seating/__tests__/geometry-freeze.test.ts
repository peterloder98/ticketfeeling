import { describe, expect, it } from "vitest";
import {
  geometryPayloadChangesSeatIdentities,
  isSeatingGeometryFrozen,
  isSeatingGeometryFrozenByStatus,
} from "@/lib/seating/geometry-freeze";

describe("isSeatingGeometryFrozenByStatus", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  const past = new Date("2026-08-06T08:00:00.000Z");
  const future = new Date("2026-08-07T12:00:00.000Z");

  it("freezes released sale statuses", () => {
    expect(isSeatingGeometryFrozenByStatus({ status: "presale_active" }, now)).toBe(true);
    expect(isSeatingGeometryFrozenByStatus({ status: "published" }, now)).toBe(true);
    expect(isSeatingGeometryFrozenByStatus({ status: "sold_out" }, now)).toBe(true);
  });

  it("freezes paused (after sale)", () => {
    expect(isSeatingGeometryFrozenByStatus({ status: "paused" }, now)).toBe(true);
  });

  it("freezes effective Im Verkauf (announcement + reached start)", () => {
    expect(
      isSeatingGeometryFrozenByStatus(
        { status: "announcement", presaleStartsAt: past },
        now,
      ),
    ).toBe(true);
  });

  it("does not freeze draft / future announcement without committed seats", () => {
    expect(isSeatingGeometryFrozenByStatus({ status: "draft" }, now)).toBe(false);
    expect(
      isSeatingGeometryFrozenByStatus(
        { status: "announcement", presaleStartsAt: future },
        now,
      ),
    ).toBe(false);
  });
});

describe("isSeatingGeometryFrozen with committed seats", () => {
  it("freezes when seats are held/sold even in draft", () => {
    expect(
      isSeatingGeometryFrozen({ status: "draft", hasCommittedSeats: true }),
    ).toBe(true);
  });

  it("stays open for draft without commitment", () => {
    expect(
      isSeatingGeometryFrozen({ status: "draft", hasCommittedSeats: false }),
    ).toBe(false);
  });
});

describe("geometryPayloadChangesSeatIdentities", () => {
  const block = {
    id: "b1",
    type: "seat_block",
    label: "Parkett",
    xCm: 100,
    yCm: 200,
    widthCm: 400,
    heightCm: 300,
    rotationDeg: 0,
    rows: 5,
    seatsPerRow: 10,
    numberedSeats: true,
  };

  it("detects dimension changes", () => {
    expect(
      geometryPayloadChangesSeatIdentities({
        previousWidthCm: 2000,
        previousDepthCm: 1500,
        previousObjects: [block],
        nextWidthCm: 2100,
        nextDepthCm: 1500,
        nextObjects: [block],
      }),
    ).toBe(true);
  });

  it("detects object moves / row adds", () => {
    expect(
      geometryPayloadChangesSeatIdentities({
        previousWidthCm: 2000,
        previousDepthCm: 1500,
        previousObjects: [block],
        nextWidthCm: 2000,
        nextDepthCm: 1500,
        nextObjects: [{ ...block, xCm: 150 }],
      }),
    ).toBe(true);
    expect(
      geometryPayloadChangesSeatIdentities({
        previousWidthCm: 2000,
        previousDepthCm: 1500,
        previousObjects: [block],
        nextWidthCm: 2000,
        nextDepthCm: 1500,
        nextObjects: [{ ...block, rows: 6 }],
      }),
    ).toBe(true);
  });

  it("allows identical geometry", () => {
    expect(
      geometryPayloadChangesSeatIdentities({
        previousWidthCm: 2000,
        previousDepthCm: 1500,
        previousObjects: [block],
        nextWidthCm: 2000,
        nextDepthCm: 1500,
        nextObjects: [block],
      }),
    ).toBe(false);
  });
});
