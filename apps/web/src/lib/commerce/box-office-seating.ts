import type { Prisma } from "@prisma/client";
import { categoryNeedsSeats, seatsPerTicket } from "@/lib/seating/types";

export type BoxOfficeSeatingMode = "best_available" | "seat_map" | "free";

export type BoxOfficeSeatAssignment = {
  categoryId: string;
  seatIds: string[];
};

const seatSelect = {
  id: true,
  seatKey: true,
  blockObjectId: true,
  blockLabel: true,
  rowIndex: true,
  seatIndex: true,
  rowLabel: true,
  seatNumber: true,
  status: true,
  categoryId: true,
  locked: true,
  segmentIndex: true,
  positionInSegment: true,
  seatType: true,
} as const;

type Tx = Prisma.TransactionClient;

/**
 * Resolve + atomically claim EventSeats for a Tageskasse sale.
 * Returns assignments stored on order.contractSnapshot for fulfillPaidOrder.
 */
export async function claimBoxOfficeSeats(
  tx: Tx,
  input: {
    eventId: string;
    seatingBookingMode: string;
    seatingMode: BoxOfficeSeatingMode;
    items: {
      categoryId: string;
      quantity: number;
      seatIds?: string[];
      categoryKind: string;
      freeSeating: boolean;
      companionFree: boolean;
    }[];
    holdExpiresAt: Date;
    seatOpt?: {
      seatOptPreferContiguous?: boolean;
      seatOptPreventNewSingletons?: boolean;
      seatOptIntelligentRemnants?: boolean;
      seatOptGapRelaxOccupancyPercent?: number;
    } | null;
  },
): Promise<BoxOfficeSeatAssignment[]> {
  const {
    pickBestAvailableSeats,
    pickBestAvailablePairs,
    assignCompanionSeats,
    validateSeatSelection,
    computeOccupancyPercent,
  } = await import("@/lib/seating/best-available");
  const { parseSeatOptimizationSettings } = await import(
    "@/lib/seating/seat-optimization-settings"
  );
  const seatOptSettings = parseSeatOptimizationSettings(input.seatOpt);

  const assignments: BoxOfficeSeatAssignment[] = [];

  for (const item of input.items) {
    const needsSeats = categoryNeedsSeats({
      seatingBookingMode: input.seatingBookingMode,
      categoryKind: item.categoryKind,
      freeSeating: item.freeSeating,
    });
    if (!needsSeats) continue;

    let mode = input.seatingMode;
    if (mode === "free") mode = "best_available";
    // Box office may use seat_map regardless of online-only best_available mode.

    const companionFree =
      item.categoryKind === "wheelchair" && Boolean(item.companionFree);
    const seatSlots =
      item.quantity *
      seatsPerTicket({
        categoryKind: item.categoryKind,
        companionFree,
      });

    const assignedCount = await tx.eventSeat.count({
      where: { eventId: input.eventId, categoryId: { not: null } },
    });
    const categoryFilter =
      assignedCount > 0
        ? { categoryId: item.categoryId }
        : ({} as { categoryId?: string });

    const sellableWhere = {
      eventId: input.eventId,
      status: "available" as const,
      locked: false,
      ...categoryFilter,
    };

    const occupancyPool = await tx.eventSeat.findMany({
      where: {
        eventId: input.eventId,
        locked: false,
        ...categoryFilter,
        seatKey: { not: { contains: ":ST:" } },
      },
      select: { status: true, locked: true },
    });
    const optCtx = {
      settings: seatOptSettings,
      occupancyPercent: computeOccupancyPercent(occupancyPool),
    };

    let seatIdsToHold: string[] = [];

    if (mode === "seat_map") {
      if (!item.seatIds?.length || item.seatIds.length !== item.quantity) {
        throw new Error("SEATS_REQUIRED");
      }
      const requested = await tx.eventSeat.findMany({
        where: {
          id: { in: item.seatIds },
          ...sellableWhere,
        },
        select: seatSelect,
      });
      if (requested.length !== item.quantity) throw new Error("SEATS_UNAVAILABLE");

      const poolForValidation = await tx.eventSeat.findMany({
        where: {
          eventId: input.eventId,
          locked: false,
          ...categoryFilter,
          seatKey: { not: { contains: ":ST:" } },
        },
        select: seatSelect,
      });
      const validation = validateSeatSelection(
        poolForValidation,
        requested.map((s) => s.id),
        optCtx,
      );
      if (!validation.ok) throw new Error(validation.code);

      if (companionFree) {
        const poolSeats = await tx.eventSeat.findMany({
          where: sellableWhere,
          select: seatSelect,
        });
        const withCompanions = assignCompanionSeats(requested, poolSeats);
        if (!withCompanions || withCompanions.length !== seatSlots) {
          throw new Error("COMPANION_SEAT_UNAVAILABLE");
        }
        seatIdsToHold = withCompanions.map((s) => s.id);
      } else {
        seatIdsToHold = requested.map((s) => s.id);
      }
    } else {
      const all = await tx.eventSeat.findMany({
        where: sellableWhere,
        select: seatSelect,
      });
      if (companionFree) {
        const picked = pickBestAvailablePairs(all, item.quantity);
        if (picked.length !== seatSlots) throw new Error("SEATS_UNAVAILABLE");
        seatIdsToHold = picked.map((s) => s.id);
      } else {
        const picked = pickBestAvailableSeats(all, item.quantity, optCtx);
        if (picked.length !== item.quantity) throw new Error("SEATS_UNAVAILABLE");
        seatIdsToHold = picked.map((s) => s.id);
      }
    }

    const claimed = await tx.eventSeat.updateMany({
      where: {
        id: { in: seatIdsToHold },
        status: "available",
        locked: false,
      },
      data: {
        status: "held",
        holdExpiresAt: input.holdExpiresAt,
        cartItemId: null,
      },
    });
    if (claimed.count !== seatIdsToHold.length) throw new Error("SEATS_UNAVAILABLE");

    assignments.push({ categoryId: item.categoryId, seatIds: seatIdsToHold });
  }

  return assignments;
}

export function readBoxOfficeSeatAssignments(
  contractSnapshot: unknown,
): BoxOfficeSeatAssignment[] {
  if (!contractSnapshot || typeof contractSnapshot !== "object" || Array.isArray(contractSnapshot)) {
    return [];
  }
  const seating = (contractSnapshot as Record<string, unknown>).seating;
  if (!seating || typeof seating !== "object" || Array.isArray(seating)) return [];
  const assignments = (seating as Record<string, unknown>).assignments;
  if (!Array.isArray(assignments)) return [];
  return assignments
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const row = raw as Record<string, unknown>;
      const categoryId = typeof row.categoryId === "string" ? row.categoryId : null;
      const seatIds = Array.isArray(row.seatIds)
        ? row.seatIds.filter((id): id is string => typeof id === "string")
        : [];
      if (!categoryId || seatIds.length === 0) return null;
      return { categoryId, seatIds };
    })
    .filter((a): a is BoxOfficeSeatAssignment => Boolean(a));
}
