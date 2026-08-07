/** Shared campaign / event urgency countdown helpers (server + client safe). */

export function discountBadgeLabel(listCents: number, unitCents: number): string | null {
  if (unitCents >= listCents || listCents <= 0) return null;
  const pct = Math.round(((listCents - unitCents) / listCents) * 100);
  if (pct >= 1) return `−${pct}%`;
  return "Aktion";
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function formatRemainingParts(remainingMs: number): {
  days: number;
  hours: number;
  minutes: number;
} | null {
  if (remainingMs <= 0 || remainingMs > SEVEN_DAYS_MS) return null;
  const totalMin = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  return { days, hours, minutes };
}

/** Remaining campaign time as calm German „Noch 2 T · 14 Std · 05 Min“. */
export function formatCampaignCountdown(
  validUntil: Date | string,
  nowMs = Date.now(),
): string | null {
  const end = typeof validUntil === "string" ? Date.parse(validUntil) : validUntil.getTime();
  if (!Number.isFinite(end)) return null;
  const parts = formatRemainingParts(end - nowMs);
  if (!parts) return null;
  return `Noch ${parts.days} T · ${parts.hours} Std · ${pad2(parts.minutes)} Min`;
}

/**
 * Event-start urgency when Beginn is within 7 days.
 * German copy: „Nur noch X Tage …“ / hours-minutes when closer.
 */
export function formatEventStartCountdown(
  eventStartsAt: Date | string,
  nowMs = Date.now(),
): string | null {
  const start =
    typeof eventStartsAt === "string" ? Date.parse(eventStartsAt) : eventStartsAt.getTime();
  if (!Number.isFinite(start)) return null;
  const parts = formatRemainingParts(start - nowMs);
  if (!parts) return null;

  if (parts.days >= 2) {
    return `Nur noch ${parts.days} Tage bis zum Event`;
  }
  if (parts.days === 1) {
    return `Nur noch 1 Tag · ${parts.hours} Std · ${pad2(parts.minutes)} Min`;
  }
  if (parts.hours >= 1) {
    return `Nur noch ${parts.hours} Std · ${pad2(parts.minutes)} Min bis zum Beginn`;
  }
  return `Nur noch ${pad2(parts.minutes)} Min bis zum Beginn`;
}
