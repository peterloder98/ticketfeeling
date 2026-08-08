/**
 * Approximate buyer locations from DE/AT/CH postal codes for admin heatmaps.
 * Uses 2-digit PLZ region centroids + small deterministic jitter — no street-level PII.
 */

export type HeatmapPeriodKey =
  | "all"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

export type HeatmapPeriod = {
  key: HeatmapPeriodKey;
  from: Date | null;
  to: Date | null;
  label: string;
};

/** Rough geographic centers for DE PLZ regions (first 2 digits). */
const DE_PLZ2: Record<string, [number, number]> = {
  "01": [51.05, 13.74],
  "02": [51.15, 14.99],
  "03": [51.76, 14.33],
  "04": [51.34, 12.37],
  "06": [51.48, 11.97],
  "07": [50.93, 11.59],
  "08": [50.72, 12.50],
  "09": [50.83, 12.92],
  "10": [52.52, 13.40],
  "12": [52.47, 13.52],
  "13": [52.56, 13.35],
  "14": [52.39, 13.06],
  "15": [52.33, 14.55],
  "16": [52.87, 13.00],
  "17": [54.09, 13.38],
  "18": [54.09, 12.14],
  "19": [53.63, 11.41],
  "20": [53.55, 9.99],
  "21": [53.46, 9.98],
  "22": [53.61, 10.08],
  "23": [54.31, 10.13],
  "24": [54.32, 10.14],
  "25": [53.87, 9.70],
  "26": [53.14, 8.21],
  "27": [53.55, 8.58],
  "28": [53.08, 8.80],
  "29": [52.77, 10.35],
  "30": [52.37, 9.74],
  "31": [52.27, 9.82],
  "32": [52.03, 8.53],
  "33": [51.95, 8.68],
  "34": [51.31, 9.49],
  "35": [50.58, 8.68],
  "36": [50.55, 9.68],
  "37": [51.53, 9.93],
  "38": [52.27, 10.52],
  "39": [52.13, 11.63],
  "40": [51.23, 6.78],
  "41": [51.19, 6.44],
  "42": [51.26, 7.15],
  "44": [51.51, 7.47],
  "45": [51.43, 7.01],
  "46": [51.66, 6.98],
  "47": [51.43, 6.76],
  "48": [51.96, 7.63],
  "49": [52.28, 8.05],
  "50": [50.94, 6.96],
  "51": [50.99, 7.12],
  "52": [50.78, 6.08],
  "53": [50.74, 7.10],
  "54": [49.76, 6.64],
  "55": [49.99, 8.27],
  "56": [50.36, 7.60],
  "57": [50.88, 8.02],
  "58": [51.26, 7.47],
  "59": [51.67, 7.82],
  "60": [50.11, 8.68],
  "61": [50.22, 8.62],
  "63": [50.00, 8.27],
  "64": [49.87, 8.65],
  "65": [50.08, 8.24],
  "66": [49.24, 7.00],
  "67": [49.44, 8.44],
  "68": [49.49, 8.47],
  "69": [49.49, 8.46],
  "70": [48.78, 9.18],
  "71": [48.80, 9.21],
  "72": [48.52, 9.06],
  "73": [48.81, 9.52],
  "74": [49.14, 9.22],
  "75": [48.94, 8.40],
  "76": [49.01, 8.40],
  "77": [48.47, 7.95],
  "78": [47.98, 8.53],
  "79": [47.99, 7.84],
  "80": [48.14, 11.58],
  "81": [48.12, 11.55],
  "82": [48.00, 11.50],
  "83": [47.85, 12.13],
  "84": [48.57, 12.15],
  "85": [48.26, 11.43],
  "86": [48.37, 10.90],
  "87": [47.72, 10.32],
  "88": [47.68, 9.48],
  "89": [48.40, 9.99],
  "90": [49.45, 11.08],
  "91": [49.45, 11.08],
  "92": [49.45, 11.85],
  "93": [49.02, 12.10],
  "94": [48.99, 12.66],
  "95": [50.12, 11.92],
  "96": [50.04, 10.93],
  "97": [49.79, 9.94],
  "98": [50.98, 10.32],
  "99": [50.98, 11.03],
};

const AT_PLZ2: Record<string, [number, number]> = {
  "10": [48.21, 16.37],
  "20": [48.20, 16.00],
  "30": [48.21, 15.63],
  "40": [48.31, 14.29],
  "50": [47.81, 13.04],
  "60": [47.27, 11.39],
  "70": [46.72, 14.33],
  "80": [47.07, 15.44],
  "90": [46.62, 14.31],
};

function hashJitter(seed: string): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = ((h % 1000) / 1000 - 0.5) * 0.18;
  const b = (((h >> 10) % 1000) / 1000 - 0.5) * 0.22;
  return [a, b];
}

export function approxCoordsFromPostal(input: {
  postalCode?: string | null;
  country?: string | null;
}): { lat: number; lng: number } | null {
  const raw = (input.postalCode ?? "").replace(/\s/g, "");
  if (!/^\d{4,5}$/.test(raw)) return null;
  const country = (input.country ?? "DE").toUpperCase();
  const key2 = raw.slice(0, 2);
  let center: [number, number] | undefined;
  if (country === "AT" || raw.length === 4) {
    center = AT_PLZ2[key2] ?? [47.5, 14.0];
  } else if (country === "CH") {
    // Coarse CH centers by first 2 digits
    center = [46.8 + (Number(key2) % 10) * 0.05, 8.2 + (Number(key2) % 10) * 0.08];
  } else {
    center = DE_PLZ2[key2];
  }
  if (!center) return null;
  const [jLat, jLng] = hashJitter(raw);
  return { lat: center[0] + jLat, lng: center[1] + jLng };
}

function berlinParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  return { y, m };
}

/** Start of Berlin calendar day as UTC Date (approx via noon offset). */
function berlinDayStart(y: number, m: number, day: number): Date {
  // Europe/Berlin offset: use 00:00 Berlin ≈ UTC+1/2 — construct via ISO with +01:00 then adjust
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+01:00`);
}

export function resolveHeatmapPeriod(opts: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): HeatmapPeriod {
  const now = opts.now ?? new Date();
  const key = (opts.period ?? "all") as HeatmapPeriodKey;
  const { y, m } = berlinParts(now);

  switch (key) {
    case "this_month":
      return {
        key,
        from: berlinDayStart(y, m, 1),
        to: now,
        label: "Dieser Monat",
      };
    case "last_month": {
      const lm = m === 1 ? 12 : m - 1;
      const ly = m === 1 ? y - 1 : y;
      const daysInLast = new Date(ly, lm, 0).getDate();
      return {
        key,
        from: berlinDayStart(ly, lm, 1),
        to: berlinDayStart(ly, lm, daysInLast + 1),
        label: "Letzter Monat",
      };
    }
    case "this_year":
      return {
        key,
        from: berlinDayStart(y, 1, 1),
        to: now,
        label: "Dieses Jahr",
      };
    case "last_year":
      return {
        key,
        from: berlinDayStart(y - 1, 1, 1),
        to: berlinDayStart(y, 1, 1),
        label: "Letztes Jahr",
      };
    case "custom": {
      const from = opts.from ? new Date(opts.from) : null;
      const to = opts.to ? new Date(opts.to) : null;
      return {
        key,
        from: from && !Number.isNaN(from.getTime()) ? from : null,
        to: to && !Number.isNaN(to.getTime()) ? to : null,
        label: "Manueller Zeitraum",
      };
    }
    default:
      return { key: "all", from: null, to: null, label: "Gesamtzeit" };
  }
}

export const HEATMAP_PERIOD_OPTIONS: { key: HeatmapPeriodKey; label: string }[] = [
  { key: "all", label: "Gesamtzeit" },
  { key: "this_month", label: "Dieser Monat" },
  { key: "last_month", label: "Letzter Monat" },
  { key: "this_year", label: "Dieses Jahr" },
  { key: "last_year", label: "Letztes Jahr" },
  { key: "custom", label: "Manueller Zeitraum" },
];

export type BuyerHeatPoint = {
  lat: number;
  lng: number;
  /** Ticket count weight */
  weight: number;
  /** City label only — no street/name */
  city: string | null;
  postalPrefix: string;
};

export function extractOrderPostal(order: {
  invoicePostalCode?: string | null;
  invoiceCity?: string | null;
  invoiceCountry?: string | null;
  billingSnapshot?: unknown;
  customer?: {
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
}): { postalCode: string | null; city: string | null; country: string | null } {
  const snap =
    order.billingSnapshot && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : null;
  const snapPostal =
    typeof snap?.postalCode === "string" ? snap.postalCode.trim() : null;
  const snapCity = typeof snap?.city === "string" ? snap.city.trim() : null;
  const snapCountry =
    typeof snap?.country === "string" ? snap.country.trim() : null;

  return {
    postalCode:
      order.invoicePostalCode?.trim() ||
      snapPostal ||
      order.customer?.postalCode?.trim() ||
      null,
    city:
      order.invoiceCity?.trim() || snapCity || order.customer?.city?.trim() || null,
    country:
      order.invoiceCountry?.trim() ||
      snapCountry ||
      order.customer?.country?.trim() ||
      "DE",
  };
}
