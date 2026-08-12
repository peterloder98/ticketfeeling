/**
 * Schedule-change helpers: detect start moves, preserve end/doors offsets,
 * and clamp price campaigns so they don't outlive the new event start/end.
 */

import type { PrismaClient } from "@prisma/client";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * TEMPORARY KILL SWITCH — buyer emails, public/admin „Termin geändert“ banners,
 * and the admin confirm dialog when saving start/doors/end.
 * Default OFF so event dates can be corrected without side effects.
 *
 * Re-enable when the user asks:
 * 1) set `SCHEDULE_CHANGE_ALERTS_ENABLED = true` below, OR
 * 2) set env `SCHEDULE_CHANGE_NOTIFICATIONS_ENABLED=true` (env wins when set).
 */
export const SCHEDULE_CHANGE_ALERTS_ENABLED = false;

export function isScheduleChangeAlertsEnabled(): boolean {
  const env = process.env.SCHEDULE_CHANGE_NOTIFICATIONS_ENABLED?.trim().toLowerCase();
  if (env === "true" || env === "1") return true;
  if (env === "false" || env === "0") return false;
  return SCHEDULE_CHANGE_ALERTS_ENABLED;
}

/** Public/admin banner when scheduleChangedAt is set AND alerts are enabled. */
export function shouldShowScheduleChangedBanner(
  scheduleChangedAt: Date | string | null | undefined,
): boolean {
  return Boolean(isScheduleChangeAlertsEnabled() && scheduleChangedAt);
}

/** Millisecond precision for “same instant” compares (datetime-local is minute). */
export function sameInstantMs(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

export function scheduleStartChanged(
  previous: Date | null | undefined,
  next: Date | null | undefined,
): boolean {
  return !sameInstantMs(previous, next);
}

export function scheduleEndChanged(
  previous: Date | null | undefined,
  next: Date | null | undefined,
): boolean {
  return !sameInstantMs(previous, next);
}

/**
 * Shift a companion datetime by the same delta as old→new start.
 * If companion is missing, returns null. If old start is missing, returns companion unchanged.
 */
export function shiftRelativeToStart(
  companion: Date | null | undefined,
  oldStart: Date | null | undefined,
  newStart: Date | null | undefined,
): Date | null {
  if (!companion) return null;
  if (!oldStart || !newStart) return companion;
  const delta = newStart.getTime() - oldStart.getTime();
  if (delta === 0) return companion;
  return new Date(companion.getTime() + delta);
}

/** On-sale / sold statuses where schedule change must be confirmed + buyers notified. */
export function requiresStrictScheduleConfirm(status: string): boolean {
  return (
    status === "presale_active" ||
    status === "published" ||
    status === "sold_out" ||
    status === "paused"
  );
}

export function shouldConfirmScheduleChange(opts: {
  status: string;
  ticketsSold: number;
}): boolean {
  return requiresStrictScheduleConfirm(opts.status) || opts.ticketsSold > 0;
}

/**
 * Clamp campaign end to just before the new event start when it would otherwise
 * outlive the event. Preserves validFrom when still before the new end.
 */
export function clampCampaignToEventStart(input: {
  validFrom: Date;
  validUntil: Date;
  newEventStartsAt: Date;
}): { validFrom: Date; validUntil: Date; changed: boolean } {
  const { validFrom, validUntil, newEventStartsAt } = input;
  if (validUntil.getTime() <= newEventStartsAt.getTime()) {
    return { validFrom, validUntil, changed: false };
  }

  // One minute before Beginn — keeps countdown meaningful and sale before doors.
  let nextUntil = new Date(newEventStartsAt.getTime() - 60_000);
  if (nextUntil.getTime() <= 0) {
    nextUntil = new Date(newEventStartsAt.getTime());
  }

  let nextFrom = validFrom;
  if (nextFrom.getTime() >= nextUntil.getTime()) {
    // Collapsed window: keep a minimal 1-minute window ending at clamp.
    nextFrom = new Date(nextUntil.getTime() - 60_000);
  }

  return { validFrom: nextFrom, validUntil: nextUntil, changed: true };
}

export function campaignCountdownWouldShow(
  validUntil: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!validUntil) return false;
  const end = typeof validUntil === "string" ? Date.parse(validUntil) : validUntil.getTime();
  if (!Number.isFinite(end)) return false;
  const remaining = end - nowMs;
  return remaining > 0 && remaining <= SEVEN_DAYS_MS;
}

export function eventCountdownWouldShow(
  eventStartsAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!eventStartsAt) return false;
  const start =
    typeof eventStartsAt === "string" ? Date.parse(eventStartsAt) : eventStartsAt.getTime();
  if (!Number.isFinite(start)) return false;
  const remaining = start - nowMs;
  return remaining > 0 && remaining <= SEVEN_DAYS_MS;
}

/**
 * Priority: Aktion/campaign countdown wins — hide event countdown when any
 * active campaign countdown would show.
 */
export function shouldShowEventStartCountdown(opts: {
  eventStartsAt: Date | string | null | undefined;
  campaignValidUntils: Array<Date | string | null | undefined>;
  nowMs?: number;
}): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  if (!eventCountdownWouldShow(opts.eventStartsAt, nowMs)) return false;
  if (opts.campaignValidUntils.some((u) => campaignCountdownWouldShow(u, nowMs))) {
    return false;
  }
  return true;
}

/**
 * Clamp campaign end to the event end when it would otherwise outlive the event.
 * Preserves validFrom when still before the new end.
 */
export function clampCampaignToEventEnd(input: {
  validFrom: Date;
  validUntil: Date;
  eventEndsAt: Date;
}): { validFrom: Date; validUntil: Date; changed: boolean } {
  const { validFrom, validUntil, eventEndsAt } = input;
  if (validUntil.getTime() <= eventEndsAt.getTime()) {
    return { validFrom, validUntil, changed: false };
  }

  const nextUntil = new Date(eventEndsAt.getTime());
  let nextFrom = validFrom;
  if (nextFrom.getTime() >= nextUntil.getTime()) {
    nextFrom = new Date(nextUntil.getTime() - 60_000);
  }

  return { validFrom: nextFrom, validUntil: nextUntil, changed: true };
}

/**
 * Adjust active/upcoming campaigns whose validUntil is after the new event start.
 */
export async function clampEventCampaignsToNewStart(
  db: PrismaClient,
  eventId: string,
  newEventStartsAt: Date,
): Promise<{ adjusted: number }> {
  const campaigns = await db.eventPriceCampaign.findMany({
    where: {
      eventId,
      active: true,
      validUntil: { gt: newEventStartsAt },
    },
    select: { id: true, validFrom: true, validUntil: true },
  });

  let adjusted = 0;
  for (const row of campaigns) {
    const next = clampCampaignToEventStart({
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      newEventStartsAt,
    });
    if (!next.changed) continue;
    await db.eventPriceCampaign.update({
      where: { id: row.id },
      data: {
        validFrom: next.validFrom,
        validUntil: next.validUntil,
      },
    });
    adjusted += 1;
  }
  return { adjusted };
}

/**
 * Adjust campaigns whose validUntil is after the new event end.
 * Applies to active and inactive rows so saved windows stay consistent.
 */
export async function clampEventCampaignsToNewEnd(
  db: PrismaClient,
  eventId: string,
  newEventEndsAt: Date,
): Promise<{ adjusted: number }> {
  const campaigns = await db.eventPriceCampaign.findMany({
    where: {
      eventId,
      validUntil: { gt: newEventEndsAt },
    },
    select: { id: true, validFrom: true, validUntil: true },
  });

  let adjusted = 0;
  for (const row of campaigns) {
    const next = clampCampaignToEventEnd({
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      eventEndsAt: newEventEndsAt,
    });
    if (!next.changed) continue;
    await db.eventPriceCampaign.update({
      where: { id: row.id },
      data: {
        validFrom: next.validFrom,
        validUntil: next.validUntil,
      },
    });
    adjusted += 1;
  }
  return { adjusted };
}
