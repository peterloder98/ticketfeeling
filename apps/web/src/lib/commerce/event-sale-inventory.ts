import { prisma } from "@/lib/db";

/**
 * True when the event already has committed inventory: sold/held pool qty,
 * sold/held seats, or issued tickets. Used to lock creating new price categories.
 *
 * Kept out of `event-sale.ts` so client components can import pure sale-policy
 * helpers without pulling Prisma into the browser bundle.
 */
export async function eventHasSoldOrHeldInventory(eventId: string): Promise<boolean> {
  const pool = await prisma.inventoryPool.findFirst({
    where: {
      eventId,
      OR: [{ soldQuantity: { gt: 0 } }, { heldQuantity: { gt: 0 } }],
    },
    select: { id: true },
  });
  if (pool) return true;

  const seat = await prisma.eventSeat.findFirst({
    where: { eventId, status: { in: ["held", "sold"] } },
    select: { id: true },
  });
  if (seat) return true;

  const ticket = await prisma.ticket.findFirst({
    where: { eventId },
    select: { id: true },
  });
  return Boolean(ticket);
}

/**
 * New price categories are allowed until the first real sold/held ticket (or seat).
 * Editing existing categories stays allowed separately — this only gates create.
 */
export async function canCreateEventCategories(eventId: string): Promise<boolean> {
  return !(await eventHasSoldOrHeldInventory(eventId));
}
