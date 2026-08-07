export type SeatStatus = "available" | "held" | "sold";

export type PublicSeat = {
  id: string;
  seatKey: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  categoryId: string | null;
  locked: boolean;
  segmentIndex?: number;
  positionInSegment?: number;
  seatType?: "standard" | "wheelchair" | "companion";
  /**
   * available — pickable
   * held_by_you — in this cart (mint)
   * held — held by another cart (unavailable, not sold)
   * taken — sold
   * locked — withheld from sale
   */
  status: "available" | "taken" | "held" | "held_by_you" | "locked";
};

export type PublicRowAisle = {
  afterSeatNumber: number;
  widthCm: number;
};

export type PublicRowLayout = {
  rowIndex: number;
  rowLabel: string;
  seatCount: number;
  aisles: PublicRowAisle[];
  removedSeatNumbers: number[];
  segments: { segmentIndex: number; seatNumbers: number[] }[];
};

export type PublicSeatBlock = {
  objectId: string;
  label: string;
  rows: number;
  seatsPerRow: number;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
  /** false = free-choice zone (no reservable seats) */
  numberedSeats: boolean;
  seats: PublicSeat[];
  /** Segment / aisle layout for correct adjacency rendering */
  rowLayouts?: PublicRowLayout[];
};

export type PublicFohArea = {
  objectId: string;
  label: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
};

export type SeatMapCategoryLegend = {
  id: string;
  name: string;
  color: string;
};

export type PublicStandingArea = {
  objectId: string;
  label: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
  standingMode: "standing" | "standing_tables";
  /** @deprecated use capacity — kept for older clients */
  estimatedCapacity: number;
  /** Assignable standing places for this zone */
  capacity: number;
  /** Dominant assigned category when uniformly painted (for map fill). */
  categoryId?: string | null;
  /** Category color when assigned */
  color?: string | null;
  /** Free standing units in this zone (not pickable dots). */
  availableCount?: number;
};

export type SeatMapPayload = {
  eventId: string;
  planName: string;
  widthCm: number;
  depthCm: number;
  bookingMode: "best_available" | "seat_map_and_best";
  stage: {
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
    rotationDeg: number;
    label: string;
  } | null;
  blocks: PublicSeatBlock[];
  standingAreas: PublicStandingArea[];
  /**
   * Standing inventory units — counted for availability / best-available,
   * not rendered as pickable seat dots on the saalplan.
   */
  standingSeats: PublicSeat[];
  /** Non-sellable FOH / Technik zones */
  fohAreas?: PublicFohArea[];
  categories: SeatMapCategoryLegend[];
  availableCount: number;
};

export function formatSeatLabel(input: {
  blockLabel: string;
  rowLabel: string;
  seatNumber: string;
  seatKey?: string;
}) {
  if (input.rowLabel === "Steh" || (input.seatKey && input.seatKey.includes(":ST:"))) {
    return `${input.blockLabel} · Stehplatz ${input.seatNumber}`;
  }
  return `${input.blockLabel} · Reihe ${input.rowLabel} · Platz ${input.seatNumber}`;
}

export function categoryNeedsSeats(input: {
  seatingBookingMode: string;
  categoryKind?: string | null;
  freeSeating?: boolean | null;
}) {
  if (
    input.seatingBookingMode !== "best_available" &&
    input.seatingBookingMode !== "seat_map_and_best"
  ) {
    return false;
  }
  const kind = input.categoryKind ?? "standard";
  // Freie Platzwahl: qty only, no EventSeat holds.
  if (kind === "free_choice") return false;
  // Plan-backed Stehplatz: qty / best-available claims assigned :ST: units
  // (not pickable map dots). freeSeating stays true for "no seat number" UX.
  if (kind === "standing") return true;
  if (input.freeSeating) return false;
  return true;
}

/** Wheelchair + Begleitung frei: 2 physical seats per paid ticket. */
export function seatsPerTicket(input: {
  categoryKind?: string | null;
  companionFree?: boolean | null;
}) {
  return input.categoryKind === "wheelchair" && input.companionFree ? 2 : 1;
}

export function categoryKindLabel(kind?: string | null) {
  switch (kind) {
    case "vip":
      return "VIP";
    case "standing":
      return "Stehplatz";
    case "free_choice":
      return "Freie Platzwahl";
    case "wheelchair":
      return "Rollstuhlplatz";
    default:
      return "Sitzplatz";
  }
}
