import { prisma } from "@/lib/db";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import { parseSeatingLayoutConfig } from "@/lib/seating/layout-config";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";

type DesiredSeat = {
  eventId: string;
  venuePlanId: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  seatKey: string;
  status: string;
};

function buildDesiredSeats(
  eventId: string,
  venuePlanId: string,
  objects: ReturnType<typeof parseVenuePlanObjects>,
): DesiredSeat[] {
  const rows: DesiredSeat[] = [];
  for (const block of objects) {
    if (block.type !== "seat_block") continue;
    // Free-choice / unnumbered blocks are geometry only — no EventSeat inventory.
    if (block.numberedSeats === false) continue;
    const rowCount = Math.max(0, Math.round(block.rows ?? 0));
    const colCount = Math.max(0, Math.round(block.seatsPerRow ?? 0));
    const blockLabel = (block.label ?? "Block").trim() || "Block";
    for (let r = 1; r <= rowCount; r += 1) {
      for (let s = 1; s <= colCount; s += 1) {
        rows.push({
          eventId,
          venuePlanId,
          blockObjectId: block.id,
          blockLabel,
          rowIndex: r,
          seatIndex: s,
          rowLabel: String(r),
          seatNumber: String(s),
          seatKey: `${block.id}:R${r}:S${s}`,
          status: "available",
        });
      }
    }
  }
  return rows;
}

/**
 * Expand / sync venue plan seat_blocks into EventSeat rows.
 * - Adds missing seats
 * - Updates labels for existing keys
 * - Removes only `available` seats that no longer exist in the plan
 * - Never deletes held/sold seats
 */
export async function ensureEventSeats(eventId: string) {
  await ensureSeatingAssignmentSchema(prisma);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { venuePlan: true },
  });
  if (!event?.venuePlanId || !event.venuePlan) return { created: 0, updated: 0, removed: 0, total: 0 };
  if (event.seatingBookingMode === "none") return { created: 0, updated: 0, removed: 0, total: 0 };

  // Plan switch: drop non-sold inventory from the previous plan
  const foreign = await prisma.eventSeat.findFirst({
    where: { eventId, venuePlanId: { not: event.venuePlanId }, status: { not: "sold" } },
    select: { id: true },
  });
  if (foreign) {
    await prisma.eventSeat.updateMany({
      where: { eventId, venuePlanId: { not: event.venuePlanId }, status: "held" },
      data: { status: "available", holdExpiresAt: null, cartItemId: null },
    });
    await prisma.eventSeat.deleteMany({
      where: {
        eventId,
        venuePlanId: { not: event.venuePlanId },
        status: { in: ["available", "held"] },
      },
    });
  }

  const objects = parseVenuePlanObjects(event.venuePlan.objects);
  const desired = buildDesiredSeats(event.id, event.venuePlanId, objects);
  const desiredByKey = new Map(desired.map((s) => [s.seatKey, s]));

  const existing = await prisma.eventSeat.findMany({
    where: { eventId, venuePlanId: event.venuePlanId },
    select: {
      id: true,
      seatKey: true,
      status: true,
      blockLabel: true,
      rowLabel: true,
      seatNumber: true,
      blockObjectId: true,
      rowIndex: true,
      seatIndex: true,
      categoryId: true,
      locked: true,
    },
  });
  const existingByKey = new Map(existing.map((s) => [s.seatKey, s]));

  const layout = parseSeatingLayoutConfig(event.seatingLayoutConfig);
  const toCreate = desired.filter((s) => !existingByKey.has(s.seatKey));
  let created = 0;
  const chunk = 500;
  for (let i = 0; i < toCreate.length; i += chunk) {
    const slice = toCreate.slice(i, i + chunk).map((s) => {
      const blockCfg = layout.blocks?.[s.blockObjectId];
      const rowLocked = blockCfg?.lockedRowIndexes?.includes(s.rowIndex) ?? false;
      return {
        ...s,
        categoryId: blockCfg?.categoryId ?? null,
        locked: Boolean(blockCfg?.locked) || rowLocked,
      };
    });
    const result = await prisma.eventSeat.createMany({
      data: slice,
      skipDuplicates: true,
    });
    created += result.count;
  }

  let updated = 0;
  for (const seat of existing) {
    const next = desiredByKey.get(seat.seatKey);
    if (!next) continue;
    if (
      seat.blockLabel !== next.blockLabel ||
      seat.rowLabel !== next.rowLabel ||
      seat.seatNumber !== next.seatNumber ||
      seat.blockObjectId !== next.blockObjectId ||
      seat.rowIndex !== next.rowIndex ||
      seat.seatIndex !== next.seatIndex
    ) {
      await prisma.eventSeat.update({
        where: { id: seat.id },
        data: {
          blockLabel: next.blockLabel,
          rowLabel: next.rowLabel,
          seatNumber: next.seatNumber,
          blockObjectId: next.blockObjectId,
          rowIndex: next.rowIndex,
          seatIndex: next.seatIndex,
          // Preserve categoryId + locked — never wipe admin assignments.
        },
      });
      updated += 1;
    }
  }

  const removableIds = existing
    .filter((s) => s.status === "available" && !desiredByKey.has(s.seatKey))
    .map((s) => s.id);
  let removed = 0;
  if (removableIds.length > 0) {
    const del = await prisma.eventSeat.deleteMany({
      where: { id: { in: removableIds }, status: "available" },
    });
    removed = del.count;
  }

  const total = await prisma.eventSeat.count({ where: { eventId } });
  return { created, updated, removed, total };
}

/**
 * Hot-path guard: only materialize when this event has no seats yet.
 * Full sync stays on admin plan save via syncSeatsForVenuePlan.
 */
export async function ensureEventSeatsIfNeeded(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venuePlanId: true, seatingBookingMode: true },
  });
  if (!event?.venuePlanId || event.seatingBookingMode === "none") {
    return { created: 0, updated: 0, removed: 0, total: 0, skipped: true as const };
  }
  const total = await prisma.eventSeat.count({
    where: { eventId, venuePlanId: event.venuePlanId },
  });
  if (total > 0) {
    return { created: 0, updated: 0, removed: 0, total, skipped: true as const };
  }
  const result = await ensureEventSeats(eventId);
  return { ...result, skipped: false as const };
}

/** Sync all events that use a venue plan (after editor save). */
export async function syncSeatsForVenuePlan(venuePlanId: string) {
  const events = await prisma.event.findMany({
    where: {
      venuePlanId,
      seatingBookingMode: { in: ["best_available", "seat_map_and_best"] },
    },
    select: { id: true },
  });
  let synced = 0;
  for (const event of events) {
    await ensureEventSeats(event.id);
    synced += 1;
  }
  return synced;
}

/** Release expired seat holds. */
export async function expireSeatHolds(now = new Date()) {
  await ensureSeatingAssignmentSchema(prisma);
  const expired = await prisma.eventSeat.findMany({
    where: {
      status: "held",
      holdExpiresAt: { lt: now },
    },
    select: { id: true },
    take: 500,
  });
  if (expired.length === 0) return 0;
  await prisma.eventSeat.updateMany({
    where: { id: { in: expired.map((s) => s.id) } },
    data: {
      status: "available",
      holdExpiresAt: null,
      cartItemId: null,
    },
  });
  return expired.length;
}
