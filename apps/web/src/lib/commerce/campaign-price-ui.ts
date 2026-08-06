/** Shared campaign price helpers (server + client safe). */

export function discountBadgeLabel(listCents: number, unitCents: number): string | null {
  if (unitCents >= listCents || listCents <= 0) return null;
  const pct = Math.round(((listCents - unitCents) / listCents) * 100);
  if (pct >= 1) return `−${pct}%`;
  return "Aktion";
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

/** Remaining campaign time as calm German „Noch 2 T · 14 Std · 05 Min“. */
export function formatCampaignCountdown(
  validUntil: Date | string,
  nowMs = Date.now(),
): string | null {
  const end = typeof validUntil === "string" ? Date.parse(validUntil) : validUntil.getTime();
  if (!Number.isFinite(end)) return null;
  const remaining = end - nowMs;
  if (remaining <= 0) return null;
  if (remaining > SEVEN_DAYS_MS) return null;

  const totalMin = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  return `Noch ${days} T · ${hours} Std · ${pad2(minutes)} Min`;
}
