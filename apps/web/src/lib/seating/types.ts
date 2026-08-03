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
  /** available for this viewer; held by others looks sold */
  status: "available" | "taken" | "held_by_you";
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
  estimatedCapacity: number;
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
  availableCount: number;
};

export function formatSeatLabel(input: {
  blockLabel: string;
  rowLabel: string;
  seatNumber: string;
}) {
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
  if (input.freeSeating) return false;
  const kind = input.categoryKind ?? "standard";
  // Stehplatz & freie Platzwahl bleiben ohne festen Sitz
  if (kind === "standing" || kind === "free_choice") return false;
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
