import { prisma } from "@/lib/db";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import { ensureEventSeatsIfNeeded, expireSeatHolds } from "@/lib/seating/materialize";
import type { PublicSeatBlock, SeatMapPayload } from "@/lib/seating/types";

export async function getSeatMapPayload(
  eventId: string,
  opts?: { viewerCartItemIds?: string[] },
): Promise<SeatMapPayload | null> {
  await expireSeatHolds().catch(() => undefined);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { venuePlan: true },
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

  const stageObj = objects.find((o) => o.type === "stage");
  const blocks: PublicSeatBlock[] = [];

  for (const obj of objects) {
    if (obj.type !== "seat_block") continue;
    const blockSeats = seats.filter((s) => s.blockObjectId === obj.id);
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
      seats: blockSeats.map((s) => {
        let status: "available" | "taken" | "held_by_you" = "available";
        if (s.status === "sold") status = "taken";
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
          status,
        };
      }),
    });
  }

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
    availableCount: seats.filter((s) => s.status === "available").length,
  };
}
