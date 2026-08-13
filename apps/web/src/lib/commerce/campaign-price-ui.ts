/** Shared campaign / event urgency countdown helpers (server + client safe). */

export function discountBadgeLabel(listCents: number, unitCents: number): string | null {
  if (unitCents >= listCents || listCents <= 0) return null;
  const pct = Math.round(((listCents - unitCents) / listCents) * 100);
  if (pct >= 1) return `−${pct}%`;
  return "Aktion";
}

export type CampaignPromoCalloutParts = {
  /** Campaign name or primary benefit line (legacy / fallback) */
  title: string;
  /** Benefit / condition — omit when redundant with title */
  detail?: string;
  /** Distinct campaign name when savings are shown separately */
  name?: string;
  /** Most prominent savings fragment, e.g. „10 € Rabatt“ / „−20%“ */
  savings?: string;
  /** Soft condition after savings, e.g. „ab 2 Tickets“ */
  condition?: string;
};

function normalizePromoText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a benefit line so savings stay scannable:
 * „10 € Rabatt ab 2 Tickets“ → savings + condition
 * „−20%“ → savings only
 */
export function parsePromoBenefitLine(line: string): {
  savings?: string;
  condition?: string;
  fallback?: string;
} {
  const text = line.replace(/\s+/g, " ").trim();
  if (!text) return {};

  const euroRabatt = text.match(
    /^((?:−|-)?\d+(?:[.,]\d+)?\s*(?:€|EUR|Euro)\s*Rabatt)\s+(.+)$/i,
  );
  if (euroRabatt) {
    return {
      savings: euroRabatt[1]
        .replace(/\s*EUR\s*/i, " € ")
        .replace(/\s+/g, " ")
        .trim(),
      condition: euroRabatt[2].trim(),
    };
  }

  const pctRabatt = text.match(/^((?:−|-)?\d+(?:[.,]\d+)?\s*%\s*Rabatt)\s+(.+)$/i);
  if (pctRabatt) {
    return { savings: pctRabatt[1].trim(), condition: pctRabatt[2].trim() };
  }

  if (/^(?:−|-)?\d+(?:[.,]\d+)?\s*(?:€|EUR|Euro)\s*Rabatt$/i.test(text)) {
    return {
      savings: text
        .replace(/\s*EUR\s*/i, " € ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }
  if (/^(?:−|-)?\d+(?:[.,]\d+)?\s*%\s*Rabatt$/i.test(text)) {
    return { savings: text };
  }
  if (/^(?:−|-)\d+(?:[.,]\d+)?\s*%$/.test(text)) {
    return { savings: text };
  }
  if (/^\d+(?:[.,]\d+)?\s*(?:€|EUR|Euro)\s*sparen$/i.test(text)) {
    return {
      savings: text
        .replace(/\s*EUR\s*/i, " € ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }

  return { fallback: text };
}

/**
 * Consolidate campaign name + badge + disclaimer into one callout
 * (avoids three weak stacked lines on cards).
 */
export function formatCampaignPromoCallout(input: {
  campaignName?: string | null;
  saleBadge?: string | null;
  saleDisclaimer?: string | null;
}): CampaignPromoCalloutParts | null {
  const name = input.campaignName?.trim() || "";
  const badge = input.saleBadge?.trim() || "";
  let disclaimer = input.saleDisclaimer?.trim() || "";
  if (disclaimer.startsWith("*")) {
    disclaimer = disclaimer.replace(/^\*\s*/, "").trim();
  }

  if (!name && !badge && !disclaimer) return null;

  const nName = name ? normalizePromoText(name) : "";
  const nBadge = badge ? normalizePromoText(badge) : "";
  const nDisc = disclaimer ? normalizePromoText(disclaimer) : "";

  let title = "";
  let detail: string | undefined;

  if (name && badge) {
    if (nName === nBadge || nBadge.includes(nName)) {
      title = badge;
    } else if (nName.includes(nBadge)) {
      title = name;
    } else {
      title = name;
      detail = badge;
    }
  } else if (name && disclaimer) {
    title = name;
    detail = disclaimer;
  } else if (badge && disclaimer) {
    if (
      /\d+\s*tickets?/i.test(badge) &&
      (nDisc.includes("beim kauf") || /\d+\s*tickets?/.test(nDisc))
    ) {
      title = badge;
    } else {
      title = badge;
      detail = disclaimer;
    }
  } else if (badge) {
    title = badge;
  } else if (name) {
    title = name;
  } else {
    title = disclaimer;
  }

  const benefitSource =
    detail && /(?:€|EUR|%|Rabatt|sparen)/i.test(detail)
      ? detail
      : /(?:€|EUR|%|Rabatt|sparen)/i.test(title) && (!name || title !== name)
        ? title
        : detail || "";

  const parsed = benefitSource ? parsePromoBenefitLine(benefitSource) : {};

  if (parsed.savings) {
    const resolvedName =
      name && normalizePromoText(name) !== normalizePromoText(parsed.savings)
        ? name
        : undefined;

    let condition = parsed.condition;
    if (
      !condition &&
      disclaimer &&
      !/\d+\s*tickets?/i.test(benefitSource) &&
      (nDisc.includes("beim kauf") || /\d+\s*tickets?/.test(nDisc))
    ) {
      condition = disclaimer;
    }

    return {
      title: resolvedName || parsed.savings,
      detail: [parsed.savings, condition].filter(Boolean).join(" "),
      name: resolvedName,
      savings: parsed.savings,
      condition,
    };
  }

  if (name && (detail || (badge && title === name))) {
    if (!detail && badge && title === name) {
      return { title: name };
    }
    return {
      title: name,
      detail,
      name,
    };
  }

  return { title, detail };
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  remainingMs: number;
};

export type UrgencyCountdownKind = "campaign" | "event";

export type UrgencyCountdownTarget = {
  kind: UrgencyCountdownKind;
  endsAt: string;
  /** German headline above the units */
  title: string;
};

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Split remaining time into Tage / Std / Min / Sek (≤7 days and still future). */
export function getCountdownParts(
  endsAt: Date | string,
  nowMs = Date.now(),
): CountdownParts | null {
  const end = toMs(endsAt);
  if (end == null) return null;
  const remainingMs = end - nowMs;
  if (remainingMs <= 0 || remainingMs > SEVEN_DAYS_MS) return null;

  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, remainingMs };
}

function withinSevenDaysWindow(endsAtMs: number, nowMs: number): boolean {
  const remaining = endsAtMs - nowMs;
  return remaining > 0 && remaining <= SEVEN_DAYS_MS;
}

/** German label above Aktion countdown units — prefer campaign name when set. */
export function campaignCountdownTitle(campaignName?: string | null): string {
  const name = campaignName?.trim();
  return name ? `${name} endet in` : "Aktion endet in";
}

/**
 * Priority: Aktion/campaign wins over event start.
 * Among active campaign ends, pick the soonest.
 */
export function resolveUrgencyCountdown(opts: {
  eventStartsAt?: Date | string | null;
  campaignValidUntils?: Array<Date | string | null | undefined>;
  /** Used for Aktion label when a campaign countdown wins (e.g. „Frühbucherrabatt endet in“) */
  campaignName?: string | null;
  nowMs?: number;
}): UrgencyCountdownTarget | null {
  const nowMs = opts.nowMs ?? Date.now();
  const campaignEnds = (opts.campaignValidUntils ?? [])
    .map((u) => toMs(u))
    .filter((ms): ms is number => ms != null && withinSevenDaysWindow(ms, nowMs))
    .sort((a, b) => a - b);

  if (campaignEnds.length > 0) {
    return {
      kind: "campaign",
      endsAt: new Date(campaignEnds[0]).toISOString(),
      title: campaignCountdownTitle(opts.campaignName),
    };
  }

  const eventStart = toMs(opts.eventStartsAt);
  if (eventStart != null && withinSevenDaysWindow(eventStart, nowMs)) {
    return {
      kind: "event",
      endsAt: new Date(eventStart).toISOString(),
      title: "Event startet in",
    };
  }

  return null;
}

/** Remaining campaign time as calm German „Noch 2 T · 14 Std · 05 Min“. */
export function formatCampaignCountdown(
  validUntil: Date | string,
  nowMs = Date.now(),
): string | null {
  const parts = getCountdownParts(validUntil, nowMs);
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
  const parts = getCountdownParts(eventStartsAt, nowMs);
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
