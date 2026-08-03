import { prisma } from "@/lib/db";
import {
  estimateStandingCapacity,
  parseVenuePlanObjects,
} from "@/lib/saalplan/types";
import { ensureEventSeatsIfNeeded, expireSeatHolds } from "@/lib/seating/materialize";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { resolveCategoryColor } from "@/lib/seating/layout-config";
import type {
  PublicSeatBlock,
  PublicStandingArea,
  SeatMapCategoryLegend,
  SeatMapPayload,
} from "@/lib/seating/types";

export async function getSeatMapPayload(
  eventId: string,
  opts?: { viewerCartItemIds?: string[]; categoryId?: string | null },
): Promise<SeatMapPayload | null> {
  await ensureSeatingAssignmentSchema(prisma);
  await expireSeatHolds().catch(() => undefined);
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
  });

  const objects = parseVenuePlanObjects(event.venuePlan.objects);
  const viewerSet = new Set(opts?.viewerCartItemIds ?? []);
  const seatingCategories = event.ticketCategories.filter(
    (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
  );
  const categories: SeatMapCategoryLegend[] = seatingCategories.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: resolveCategoryColor(c.color, i),
  }));

  const stageObj = objects.find((o) => o.type === "stage");
  const blocks: PublicSeatBlock[] = [];
  const standingAreas: PublicStandingArea[] = [];

  for (const obj of objects) {
    if (obj.type === "standing_area") {
      const mode = obj.standingMode === "standing_tables" ? "standing_tables" : "standing";
      standingAreas.push({
        objectId: obj.id,
        label: obj.label ?? "Stehbereich",
        xCm: obj.xCm,
        yCm: obj.yCm,
        widthCm: obj.widthCm,
        heightCm: obj.heightCm,
        rotationDeg: obj.rotationDeg,
        standingMode: mode,
        estimatedCapacity: estimateStandingCapacity(obj.widthCm, obj.heightCm, mode),
      });
      continue;
    }

    if (obj.type !== "seat_block") continue;
    const numbered = obj.numberedSeats !== false;
    const blockSeats = numbered ? seats.filter((s) => s.blockObjectId === obj.id) : [];
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
      seats: blockSeats.map((s) => {
        let status: "available" | "taken" | "held_by_you" | "locked" = "available";
        if (s.locked) status = "locked";
        else if (s.status === "sold") status = "taken";
        else if (s.status === "held") {
          status =
            s.cartItemId && viewerSet.has(s.cartItemId) ? "held_by_you" : "taken";
        }
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
          status,
        };
      }),
    });
  }

  const hasAssignments = seats.some((s) => s.categoryId);
  const availableCount = seats.filter((s) => {
    if (s.status !== "available" || s.locked) return false;
    if (opts?.categoryId && hasAssignments && s.categoryId !== opts.categoryId) return false;
    return true;
  }).length;

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
    categories,
    availableCount,
  };
}
