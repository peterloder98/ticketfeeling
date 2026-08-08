import { prisma } from "@/lib/db";
import { parseVenuePlanObjects, resolveStandingCapacity } from "@/lib/saalplan/types";
import { resolveSeatBlockRows } from "@/lib/saalplan/seat-structure";
import { ensureEventSeatsIfNeeded, expireSeatHolds } from "@/lib/seating/materialize";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { resolveCategoryColor } from "@/lib/seating/layout-config";
import { countSellableAvailableSeats } from "@/lib/seating/availability";
import { toPublicSeatStatus } from "@/lib/seating/public-seat-status";
import type {
  PublicFohArea,
  PublicSeat,
  PublicSeatBlock,
  PublicStandingArea,
  SeatMapCategoryLegend,
  SeatMapPayload,
} from "@/lib/seating/types";

function toPublicSeat(
  s: {
    id: string;
    seatKey: string;
    blockObjectId: string;
    blockLabel: string;
    rowIndex: number;
    seatIndex: number;
    rowLabel: string;
    seatNumber: string;
    status: string;
    cartItemId: string | null;
    holdExpiresAt?: Date | null;
    categoryId: string | null;
    locked: boolean;
    segmentIndex?: number | null;
    positionInSegment?: number | null;
    seatType?: string | null;
  },
  viewerSet: Set<string>,
): PublicSeat {
  const seatType =
    s.seatType === "wheelchair" || s.seatType === "companion" ? s.seatType : "standard";
  return {
    id: s.id,
    seatKey: s.seatKey,
    blockObjectId: s.blockObjectId,
    blockLabel: s.blockLabel,
    rowIndex: s.rowIndex,
    seatIndex: s.seatIndex,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    categoryId: s.categoryId,
    locked: s.locked,
    segmentIndex: s.segmentIndex ?? 0,
    positionInSegment:
      typeof s.positionInSegment === "number" ? s.positionInSegment : Math.max(0, s.seatIndex - 1),
    seatType,
    status: toPublicSeatStatus(s, viewerSet),
  };
}

export async function getSeatMapPayload(
  eventId: string,
  opts?: { viewerCartItemIds?: string[]; categoryId?: string | null },
): Promise<SeatMapPayload | null> {
  await ensureSeatingAssignmentSchema(prisma);
  // Never force-expire on the hot map path — that held pool connections under load
  // (Prisma pool timeout). Throttled background cleanup; display treats expired holds as free.
  void expireSeatHolds(new Date()).catch(() => undefined);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venuePlan: true,
      ticketCategories: {
        where: { status: "active" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, color: true, freeSeating: true, categoryKind: true },
      },
    },
  });
  if (!event?.venuePlan || event.seatingBookingMode === "none") return null;
  if (
    event.seatingBookingMode !== "best_available" &&
    event.seatingBookingMode !== "seat_map_and_best"
  ) {
    return null;
  }

  await ensureEventSeatsIfNeeded(eventId);

  const seats = await prisma.eventSeat.findMany({
    where: { eventId },
    orderBy: [{ blockLabel: "asc" }, { rowIndex: "asc" }, { seatIndex: "asc" }],
    select: {
      id: true,
      seatKey: true,
      blockObjectId: true,
      blockLabel: true,
      rowIndex: true,
      seatIndex: true,
      rowLabel: true,
      seatNumber: true,
      status: true,
      cartItemId: true,
      holdExpiresAt: true,
      categoryId: true,
      locked: true,
      segmentIndex: true,
      positionInSegment: true,
      seatType: true,
    },
  });

  const objects = parseVenuePlanObjects(event.venuePlan.objects);
  const viewerSet = new Set(opts?.viewerCartItemIds ?? []);
  // Legend includes plan-backed Stehplatz so standing fill can resolve colors.
  const seatingCategories = event.ticketCategories.filter(
    (c) => c.categoryKind !== "free_choice" && (c.categoryKind === "standing" || !c.freeSeating),
  );
  const categories: SeatMapCategoryLegend[] = seatingCategories.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: resolveCategoryColor(c.color, i),
  }));
  const colorById = new Map(categories.map((c) => [c.id, c.color]));

  const stageObj = objects.find((o) => o.type === "stage");
  const seatsByBlock = new Map<string, typeof seats>();
  for (const seat of seats) {
    const list = seatsByBlock.get(seat.blockObjectId);
    if (list) list.push(seat);
    else seatsByBlock.set(seat.blockObjectId, [seat]);
  }

  const blocks: PublicSeatBlock[] = [];
  const standingAreas: PublicStandingArea[] = [];
  const standingSeats: PublicSeat[] = [];
  const fohAreas: PublicFohArea[] = [];

  for (const obj of objects) {
    if (obj.type === "foh") {
      fohAreas.push({
        objectId: obj.id,
        label: obj.label ?? "FOH / Technik",
        xCm: obj.xCm,
        yCm: obj.yCm,
        widthCm: obj.widthCm,
        heightCm: obj.heightCm,
        rotationDeg: obj.rotationDeg,
      });
      continue;
    }

    if (obj.type === "standing_area") {
      const mode = obj.standingMode === "standing_tables" ? "standing_tables" : "standing";
      const capacity = resolveStandingCapacity(obj);
      const zoneSeats = seatsByBlock.get(obj.id) ?? [];
      const publicZone = zoneSeats.map((s) => toPublicSeat(s, viewerSet));
      standingSeats.push(...publicZone);
      const catIds = [
        ...new Set(zoneSeats.map((s) => s.categoryId).filter(Boolean)),
      ] as string[];
      const categoryId = catIds.length === 1 ? catIds[0]! : null;
      const availableCount = countSellableAvailableSeats(publicZone, {
        categoryId: opts?.categoryId,
        assignedCategoryIds: seatingCategories.map((c) => c.id),
      });
      standingAreas.push({
        objectId: obj.id,
        label: obj.label ?? "Stehbereich",
        xCm: obj.xCm,
        yCm: obj.yCm,
        widthCm: obj.widthCm,
        heightCm: obj.heightCm,
        rotationDeg: obj.rotationDeg,
        standingMode: mode,
        estimatedCapacity: capacity,
        capacity,
        categoryId,
        color: categoryId ? (colorById.get(categoryId) ?? null) : null,
        availableCount,
      });
      continue;
    }

    if (obj.type !== "seat_block") continue;
    const numbered = obj.numberedSeats !== false;
    const blockSeats = numbered ? (seatsByBlock.get(obj.id) ?? []) : [];
    const layouts = numbered ? resolveSeatBlockRows(obj) : [];
    blocks.push({
      objectId: obj.id,
      label: obj.label ?? "Block",
      rows: obj.rows ?? 0,
      seatsPerRow: obj.seatsPerRow ?? 0,
      xCm: obj.xCm,
      yCm: obj.yCm,
      widthCm: obj.widthCm,
      heightCm: obj.heightCm,
      rotationDeg: obj.rotationDeg,
      numberedSeats: numbered,
      seats: blockSeats.map((s) => toPublicSeat(s, viewerSet)),
      rowLayouts: layouts.map((row) => ({
        rowIndex: row.rowIndex,
        rowLabel: row.rowLabel,
        seatCount: row.seatCount,
        aisles: row.aisles,
        removedSeatNumbers: row.removedSeatNumbers,
        segments: row.segments.map((seg) => ({
          segmentIndex: seg.segmentIndex,
          seatNumbers: seg.seatNumbers,
        })),
      })),
    });
  }

  // Numbered free seats + standing inventory (standing not pickable on the map UI).
  const availableCount = countSellableAvailableSeats(seats, {
    categoryId: opts?.categoryId,
    assignedCategoryIds: seatingCategories.map((c) => c.id),
  });

  return {
    eventId,
    planName: event.venuePlan.name,
    widthCm: event.venuePlan.widthCm,
    depthCm: event.venuePlan.depthCm,
    bookingMode: event.seatingBookingMode,
    stage: stageObj
      ? {
          xCm: stageObj.xCm,
          yCm: stageObj.yCm,
          widthCm: stageObj.widthCm,
          heightCm: stageObj.heightCm,
          rotationDeg: stageObj.rotationDeg,
          label: stageObj.label ?? "Bühne",
        }
      : null,
    blocks,
    standingAreas,
    standingSeats,
    fohAreas,
    categories,
    availableCount,
  };
}
