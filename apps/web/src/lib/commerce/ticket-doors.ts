/**
 * Resolve effective doors for a ticket: category override if set, else event doors.
 * Not VIP-hardcoded — any category may set Sonder-Einlass + Hinweis.
 */

import { BERLIN_TZ } from "@/lib/datetime-de";

export type DoorsEventLike = {
  doorsOpenAt?: Date | null;
};

export type DoorsCategoryLike = {
  name?: string | null;
  doorsOpenAt?: Date | null;
  doorsNote?: string | null;
};

export type ResolvedTicketDoors = {
  doorsOpenAt: Date | null;
  doorsNote: string | null;
  /** True when category has its own doorsOpenAt */
  isCategoryOverride: boolean;
  categoryName: string | null;
  /** Headline prefix e.g. "EINLASS" or "VIP-EINLASS" */
  headlineLabel: string;
  /** Time only HH:MM (Europe/Berlin), or null */
  timeLabel: string | null;
  /** e.g. "EINLASS 16:00" / "VIP-EINLASS 15:00" */
  headline: string | null;
};

function formatDoorsTime(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("de-DE", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

/** Build print/scan headline label from category name when special doors apply. */
export function doorsHeadlineLabel(
  categoryName: string | null | undefined,
  isOverride: boolean,
): string {
  if (!isOverride) return "EINLASS";
  const raw = (categoryName ?? "").trim();
  if (!raw) return "SONDER-EINLASS";
  const upper = raw.toUpperCase();
  if (upper.includes("EINLASS")) return upper;
  // Compact: "VIP" → "VIP-EINLASS"; longer names keep short prefix
  const short = raw.length <= 24 ? raw : raw.slice(0, 21).trimEnd() + "…";
  return `${short.toUpperCase()}-EINLASS`;
}

export function resolveTicketDoors(
  event: DoorsEventLike,
  category?: DoorsCategoryLike | null,
): ResolvedTicketDoors {
  const categoryDoors = category?.doorsOpenAt ?? null;
  const isCategoryOverride = Boolean(categoryDoors);
  const doorsOpenAt = categoryDoors ?? event.doorsOpenAt ?? null;
  const doorsNote = category?.doorsNote?.trim() || null;
  const categoryName = category?.name?.trim() || null;
  const headlineLabel = doorsHeadlineLabel(categoryName, isCategoryOverride);
  const timeLabel = formatDoorsTime(doorsOpenAt);
  const headline = timeLabel ? `${headlineLabel} ${timeLabel}` : null;

  return {
    doorsOpenAt,
    doorsNote: isCategoryOverride || doorsNote ? doorsNote : null,
    isCategoryOverride,
    categoryName,
    headlineLabel,
    timeLabel,
    headline,
  };
}

/** Gate input using effective (resolved) doors. */
export function doorsForCheckinGate(resolved: ResolvedTicketDoors): {
  doorsOpenAt: Date | null;
} {
  return { doorsOpenAt: resolved.doorsOpenAt };
}
