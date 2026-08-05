/** Central Verwaltungsgebühr configuration and helpers. All money in integer cents. */

export const PLATFORM_FEE_CALCULATION_VERSION = "platform-fee-v1";

export type PlatformFeeCalculationBase =
  | "ticket_subtotal_before_discounts"
  | "ticket_subtotal_after_discounts";

export type PlatformFeeTaxMode = "inherit_ticket_tax_rate" | "custom";

export type PlatformFeeConfig = {
  enabled: boolean;
  /** 400 = 4.00% */
  percentageBasisPoints: number;
  displayName: string;
  calculationBase: PlatformFeeCalculationBase;
  taxMode: PlatformFeeTaxMode;
  customTaxRateBasisPoints: number | null;
  customerDescription: string;
  /** ISO datetime; null = immediately active */
  activeFrom: string | null;
  version: number;
};

/** Default platform fee: 4.00% (400 basis points). */
export const DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS = 400;

export function feePercentLabel(bps: number): string {
  const pct = bps / 100;
  if (!Number.isFinite(pct)) return "0 %";
  if (Number.isInteger(pct)) return `${pct} %`;
  return `${pct.toFixed(2).replace(".", ",").replace(/0+$/, "").replace(/,$/, "")} %`;
}

/** Short percent for prose (no space before %), e.g. "4" or "4,5". */
export function feePercentNumberLabel(bps: number): string {
  const pct = bps / 100;
  if (!Number.isFinite(pct)) return "0";
  if (Number.isInteger(pct)) return String(pct);
  return pct.toFixed(2).replace(".", ",").replace(/0+$/, "").replace(/,$/, "");
}

export function buildDefaultPlatformFeeCustomerDescription(bps: number): string {
  const pct = feePercentNumberLabel(bps);
  return `Die Verwaltungsgebühr unterstützt den sicheren Betrieb, die Zahlungsabwicklung, die Ticketbereitstellung und unseren persönlichen Kundenservice. Mit ${pct} % bleibt Ticketfeeling bewusst deutlich unter den Gebühren vieler klassischer Ticketanbieter.`;
}

export const DEFAULT_PLATFORM_FEE_CONFIG: PlatformFeeConfig = {
  enabled: true,
  percentageBasisPoints: DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS,
  displayName: "Verwaltungsgebühr",
  calculationBase: "ticket_subtotal_after_discounts",
  taxMode: "inherit_ticket_tax_rate",
  customTaxRateBasisPoints: null,
  customerDescription: buildDefaultPlatformFeeCustomerDescription(
    DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS,
  ),
  activeFrom: null,
  version: 1,
};

/** What the Verwaltungsgebühr covers — shown in the checkout info dialog. */
export const PLATFORM_FEE_INFO_BULLETS = [
  "Betrieb der Ticketfeeling-Plattform",
  "Sichere Zahlungsabwicklung",
  "Erstellung und Versand Ihrer Tickets",
  "QR-Codes und Einlasskontrolle",
  "Hosting und technische Infrastruktur",
  "Persönlichen Kundenservice",
  "Weiterentwicklung des Produkts",
] as const;

export function buildPlatformFeeInfoClosing(bps: number): string {
  const pct = feePercentNumberLabel(bps);
  return `Mit ${pct} % bleibt Ticketfeeling bewusst deutlich unter den Gebühren vieler klassischer Ticketanbieter.`;
}

export function parsePlatformFeeConfig(raw: unknown): PlatformFeeConfig {
  const base = { ...DEFAULT_PLATFORM_FEE_CONFIG };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;

  const calcBase =
    r.calculationBase === "ticket_subtotal_before_discounts"
      ? "ticket_subtotal_before_discounts"
      : "ticket_subtotal_after_discounts";
  const taxMode = r.taxMode === "custom" ? "custom" : "inherit_ticket_tax_rate";

  let percentageBasisPoints = base.percentageBasisPoints;
  if (typeof r.percentageBasisPoints === "number" && Number.isFinite(r.percentageBasisPoints)) {
    percentageBasisPoints = Math.max(0, Math.round(r.percentageBasisPoints));
  } else if (typeof r.percentage === "number" && Number.isFinite(r.percentage)) {
    percentageBasisPoints = Math.max(0, Math.round(r.percentage * 100));
  }

  return {
    enabled: r.enabled === undefined ? true : Boolean(r.enabled),
    percentageBasisPoints,
    displayName:
      typeof r.displayName === "string" && r.displayName.trim()
        ? r.displayName.trim()
        : base.displayName,
    calculationBase: calcBase,
    taxMode,
    customTaxRateBasisPoints:
      typeof r.customTaxRateBasisPoints === "number" && Number.isFinite(r.customTaxRateBasisPoints)
        ? Math.max(0, Math.round(r.customTaxRateBasisPoints))
        : null,
    customerDescription:
      typeof r.customerDescription === "string" && r.customerDescription.trim()
        ? r.customerDescription.trim()
        : buildDefaultPlatformFeeCustomerDescription(percentageBasisPoints),
    activeFrom: typeof r.activeFrom === "string" && r.activeFrom ? r.activeFrom : null,
    version:
      typeof r.version === "number" && Number.isFinite(r.version)
        ? Math.max(1, Math.round(r.version))
        : base.version,
  };
}

/** Config effective at `at` (default now). */
export function resolveActivePlatformFeeConfig(
  raw: unknown,
  at: Date = new Date(),
): PlatformFeeConfig {
  const config = parsePlatformFeeConfig(raw);
  if (config.activeFrom) {
    const from = new Date(config.activeFrom);
    if (!Number.isNaN(from.getTime()) && from.getTime() > at.getTime()) {
      return { ...config, enabled: false };
    }
  }
  return config;
}

/** Commercial round half-up for non-negative amounts. */
export function roundHalfUpCents(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.floor((numerator + denominator / 2) / denominator);
}

export function computePlatformFeeGrossCents(
  baseCents: number,
  percentageBasisPoints: number,
): number {
  const base = Math.max(0, baseCents);
  const bps = Math.max(0, percentageBasisPoints);
  if (base === 0 || bps === 0) return 0;
  // round(base * bps / 10000) with half-up
  return Math.round((base * bps) / 10_000);
}
