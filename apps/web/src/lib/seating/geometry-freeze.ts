/**
 * Saalplan geometry freeze after sale start / inventory commitment.
 *
 * Once an event is on sale (or has reserved/sold seats), structural plan changes
 * that add/move/delete/renumber seats are blocked. Lock/unlock of unsold seats
 * and category paint on available seats remain allowed elsewhere.
 */

import {
  effectiveEventStatus,
  isEventSalesReleased,
} from "@/lib/commerce/event-sale";
import { prisma } from "@/lib/db";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";

/** Clear German copy for admin UI / server actions. */
export const GEOMETRY_FROZEN_MESSAGE =
  "Saalplan gesperrt: Sobald der Verkauf läuft oder Plätze verkauft/reserviert sind, dürfen Blöcke, Reihen und Sitze nicht mehr umgebaut, ergänzt oder umnummeriert werden. Freigeben oder Sperren von unverkauften Plätzen ist weiterhin möglich.";

export const LOCK_INCLUDES_SOLD_MESSAGE =
  "Sperren nicht möglich: Die Auswahl enthält verkaufte oder reservierte Plätze. Bitte nur freie, unverkaufte Plätze sperren.";

export const UNLOCK_INCLUDES_SOLD_MESSAGE =
  "Freigeben nicht möglich: Die Auswahl enthält verkaufte Plätze. Verkaufte Sitze bleiben gesperrt für den Verkauf.";

/** Status-based freeze (effective status + pause after sale). */
export function isSeatingGeometryFrozenByStatus(
  event: { status: string; presaleStartsAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if (event.status === "paused") return true;
  const status = effectiveEventStatus(event, now);
  return isEventSalesReleased(status);
}

/**
 * Full freeze check: on-sale/paused OR any sold/held seat inventory.
 * Prefer this when you can hit the DB (or already know seat commitment).
 */
export function isSeatingGeometryFrozen(event: {
  status: string;
  presaleStartsAt?: Date | null;
  hasCommittedSeats?: boolean;
}): boolean {
  if (isSeatingGeometryFrozenByStatus(event)) return true;
  return Boolean(event.hasCommittedSeats);
}

/** True when any seat is held (cart) or sold — inventory is committed. */
export async function eventHasCommittedSeats(eventId: string): Promise<boolean> {
  const committed = await prisma.eventSeat.findFirst({
    where: { eventId, status: { in: ["held", "sold"] } },
    select: { id: true },
  });
  if (committed) return true;
  const ticket = await prisma.ticket.findFirst({
    where: { eventId },
    select: { id: true },
  });
  return Boolean(ticket);
}

export async function resolveEventGeometryFrozen(event: {
  id: string;
  status: string;
  presaleStartsAt?: Date | null;
}): Promise<boolean> {
  if (isSeatingGeometryFrozenByStatus(event)) return true;
  return eventHasCommittedSeats(event.id);
}

/**
 * Whether saving new plan geometry would alter seat inventory identities
 * (add/remove keys or change dimensions/layout JSON for numbered seats).
 */
export function geometryPayloadChangesSeatIdentities(input: {
  previousWidthCm: number;
  previousDepthCm: number;
  previousObjects: unknown;
  nextWidthCm: number;
  nextDepthCm: number;
  nextObjects: unknown;
}): boolean {
  if (
    input.previousWidthCm !== input.nextWidthCm ||
    input.previousDepthCm !== input.nextDepthCm
  ) {
    return true;
  }

  const prev = parseVenuePlanObjects(input.previousObjects);
  const next = parseVenuePlanObjects(input.nextObjects);

  // Any object graph change can move seats visually or renumber rows.
  return JSON.stringify(prev) !== JSON.stringify(next);
}

export type VenuePlanFreezeCheck =
  | { frozen: false }
  | { frozen: true; eventIds: string[]; message: string };

/** True if any event using this venue plan is geometry-frozen. */
export async function checkVenuePlanGeometryFrozen(
  venuePlanId: string,
): Promise<VenuePlanFreezeCheck> {
  const events = await prisma.event.findMany({
    where: {
      venuePlanId,
      seatingBookingMode: { in: ["best_available", "seat_map_and_best"] },
    },
    select: { id: true, status: true, presaleStartsAt: true },
  });

  const frozenIds: string[] = [];
  for (const event of events) {
    if (await resolveEventGeometryFrozen(event)) {
      frozenIds.push(event.id);
    }
  }

  if (frozenIds.length === 0) return { frozen: false };
  return { frozen: true, eventIds: frozenIds, message: GEOMETRY_FROZEN_MESSAGE };
}
