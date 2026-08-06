import type { Prisma, PrismaClient } from "@prisma/client";
import { sharedCommittedQuantity } from "@/lib/commerce/inventory-availability";
import {
  isStandingSeatKey,
  parseVenuePlanObjects,
  standingSeatKey,
  type VenuePlanObject,
} from "@/lib/saalplan/types";
import { syncPlanBackedCategoryCapacities } from "@/lib/seating/sync-category-capacity";

type Db = Pick<
  PrismaClient,
  "event" | "eventSeat" | "eventTicketCategory" | "venuePlan" | "inventoryPool"
>;

export class StandingCapacityError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "StandingCapacityError";
    this.code = code;
  }
}

function isStandingSeat(seat: { seatKey: string; rowLabel: string }) {
  return seat.rowLabel === "Steh" || isStandingSeatKey(seat.seatKey);
}

/**
 * After Saalplan assignment, Stehplatz Kontingent is editable on the Preiskategorie.
 * Geometry capacity is only the initial recommendation — this rematerializes EventSeat
 * units for the assigned standing block(s) and keeps inventory pools in sync.
 *
 * Decrease floor: max(shared sold+held across channels, non-available standing seats).
 * Increase: freely (new units auto-assigned to the category).
 */
export async function adjustStandingCategoryCapacity(
  db: Db,
  eventId: string,
  categoryId: string,
  desiredCapacity: number,
): Promise<{ capacity: number }> {
  const desired = Math.max(0, Math.floor(desiredCapacity));

  const category = await db.eventTicketCategory.findFirst({
    where: { id: categoryId, eventId },
    include: { pools: true },
  });
  if (!category) {
    throw new StandingCapacityError("NOT_FOUND");
  }
  if (category.categoryKind !== "standing") {
    throw new StandingCapacityError("NOT_STANDING_CATEGORY");
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      venuePlanId: true,
      seatingBookingMode: true,
      venuePlan: { select: { id: true, objects: true } },
    },
  });
  if (!event?.venuePlanId || !event.venuePlan || event.seatingBookingMode === "none") {
    throw new StandingCapacityError("SEATING_REQUIRED");
  }

  const allSeats = await db.eventSeat.findMany({
    where: { eventId, categoryId },
    select: {
      id: true,
      seatKey: true,
      rowLabel: true,
      seatIndex: true,
      blockObjectId: true,
      blockLabel: true,
      status: true,
    },
    orderBy: [{ blockObjectId: "asc" }, { seatIndex: "asc" }],
  });
  const standingSeats = allSeats.filter(isStandingSeat);

  if (standingSeats.length === 0 && desired > 0) {
    throw new StandingCapacityError(
      "STANDING_NOT_ASSIGNED",
      "Zuerst Stehplätze im Saalplan dieser Kategorie zuordnen — danach kannst du das Kontingent anpassen.",
    );
  }

  const poolFloor = sharedCommittedQuantity(category.pools);
  const protectedCount = standingSeats.filter((s) => s.status !== "available").length;
  const floor = Math.max(poolFloor, protectedCount);
  if (desired < floor) {
    throw new StandingCapacityError(
      "CAPACITY_BELOW_SOLD",
      `Kontingent darf nicht unter ${floor} sinken (bereits verkauft oder reserviert).`,
    );
  }

  const current = standingSeats.length;
  if (desired === current) {
    const synced = await syncPlanBackedCategoryCapacities(db, eventId);
    return { capacity: synced[categoryId] ?? current };
  }

  const byBlock = new Map<string, typeof standingSeats>();
  for (const seat of standingSeats) {
    const list = byBlock.get(seat.blockObjectId) ?? [];
    list.push(seat);
    byBlock.set(seat.blockObjectId, list);
  }
  const primaryBlockId =
    [...byBlock.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ??
    standingSeats[0]?.blockObjectId;
  if (!primaryBlockId) {
    throw new StandingCapacityError("STANDING_NOT_ASSIGNED");
  }

  if (desired > current) {
    const add = desired - current;
    const blockSeats = await db.eventSeat.findMany({
      where: { eventId, blockObjectId: primaryBlockId },
      select: { seatIndex: true, seatKey: true },
    });
    let nextIndex = blockSeats.reduce((m, s) => Math.max(m, s.seatIndex), 0) + 1;
    const existingKeys = new Set(blockSeats.map((s) => s.seatKey));
    const blockLabel =
      standingSeats.find((s) => s.blockObjectId === primaryBlockId)?.blockLabel ?? "Stehbereich";

    const toCreate: {
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
      categoryId: string;
      locked: boolean;
    }[] = [];

    for (let i = 0; i < add; i += 1) {
      while (existingKeys.has(standingSeatKey(primaryBlockId, nextIndex))) {
        nextIndex += 1;
      }
      const seatKey = standingSeatKey(primaryBlockId, nextIndex);
      existingKeys.add(seatKey);
      toCreate.push({
        eventId,
        venuePlanId: event.venuePlanId,
        blockObjectId: primaryBlockId,
        blockLabel,
        rowIndex: 1,
        seatIndex: nextIndex,
        rowLabel: "Steh",
        seatNumber: String(nextIndex),
        seatKey,
        status: "available",
        categoryId,
        locked: false,
      });
      nextIndex += 1;
    }

    if (toCreate.length > 0) {
      await db.eventSeat.createMany({ data: toCreate, skipDuplicates: true });
    }
  } else {
    const removeCount = current - desired;
    const removable = standingSeats
      .filter((s) => s.status === "available")
      .sort((a, b) => b.seatIndex - a.seatIndex || b.seatKey.localeCompare(a.seatKey));
    if (removable.length < removeCount) {
      throw new StandingCapacityError(
        "CAPACITY_BELOW_SOLD",
        `Kontingent darf nicht unter ${current - removable.length} sinken (bereits verkauft oder reserviert).`,
      );
    }
    const ids = removable.slice(0, removeCount).map((s) => s.id);
    if (ids.length > 0) {
      await db.eventSeat.deleteMany({
        where: { id: { in: ids }, status: "available" },
      });
    }
  }

  // Keep venue-plan standing capacity aligned so rematerialize does not fight the override.
  const touchedBlockIds = new Set<string>([primaryBlockId, ...byBlock.keys()]);
  const objects = parseVenuePlanObjects(event.venuePlan.objects);
  let objectsChanged = false;
  const nextObjects: VenuePlanObject[] = [];
  for (const obj of objects) {
    if (obj.type !== "standing_area" || !touchedBlockIds.has(obj.id)) {
      nextObjects.push(obj);
      continue;
    }
    const count = await db.eventSeat.count({
      where: { eventId, blockObjectId: obj.id, rowLabel: "Steh" },
    });
    if (obj.capacity !== count || !obj.capacityManual) {
      objectsChanged = true;
      nextObjects.push({ ...obj, capacity: count, capacityManual: true });
    } else {
      nextObjects.push(obj);
    }
  }

  if (objectsChanged) {
    await db.venuePlan.update({
      where: { id: event.venuePlan.id },
      data: { objects: nextObjects as Prisma.InputJsonValue },
    });
  }

  const synced = await syncPlanBackedCategoryCapacities(db, eventId);
  return { capacity: synced[categoryId] ?? desired };
}
