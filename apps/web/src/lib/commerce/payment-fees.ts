/**
 * Internal Stripe PSP fee estimates — never added to the customer total.
 * PayPal removed; customer surcharge always false.
 */

import { DEFAULT_SEPA_MIN_DAYS_BEFORE_EVENT } from "@/lib/commerce/sepa-availability";

export type PaymentMethodKey = "card" | "sepa_debit" | "apple_pay" | "google_pay";

/** Legacy keys still accepted from older sessions / DB rows */
export type LegacyPaymentMethodKey = "stripe_sepa" | "stripe_card" | "paypal";

export type PaymentMethodFeeConfig = {
  percentageBps: number;
  fixedFeeCents: number;
  active: boolean;
  testMode: boolean;
  customerSurchargeEnabled: boolean;
};

export type PaymentFeeConfigMap = Record<PaymentMethodKey, PaymentMethodFeeConfig>;

/** Display / product config stored alongside fee rates in OrganizationSettings.data or dedicated fields */
export type PaymentUiConfig = {
  methodOrder: PaymentMethodKey[];
  sepaRecommended: boolean;
  recommendedBadgeText: string;
  sepaMinDaysBeforeEvent: number;
};

export const DEFAULT_PAYMENT_METHOD_ORDER: PaymentMethodKey[] = [
  "sepa_debit",
  "card",
  "apple_pay",
  "google_pay",
];

export const DEFAULT_PAYMENT_UI_CONFIG: PaymentUiConfig = {
  methodOrder: [...DEFAULT_PAYMENT_METHOD_ORDER],
  sepaRecommended: true,
  recommendedBadgeText: "Empfohlen",
  sepaMinDaysBeforeEvent: DEFAULT_SEPA_MIN_DAYS_BEFORE_EVENT,
};

export const DEFAULT_PAYMENT_FEE_CONFIG: PaymentFeeConfigMap = {
  sepa_debit: {
    percentageBps: 0,
    fixedFeeCents: 35,
    active: true,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  card: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: true,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  apple_pay: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: true,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  google_pay: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: true,
    testMode: true,
    customerSurchargeEnabled: false,
  },
};

export const PAYMENT_METHOD_META: Record<
  PaymentMethodKey,
  {
    title: string;
    /** Secondary technical label (e.g. SEPA) — smaller than title */
    subtitle?: string;
    description: string;
    hint?: string;
    brands?: string[];
    provider: "stripe";
    /** Wallet methods rely on Stripe card + device support */
    wallet?: boolean;
  }
> = {
  sepa_debit: {
    title: "Lastschrift vom Bankkonto",
    subtitle: "SEPA-Lastschrift",
    description:
      "Bequem per Bankeinzug bezahlen. Du gibst deine IBAN ein und der Betrag wird sicher über Stripe von deinem Bankkonto eingezogen.",
    hint: "Besonders geeignet bei frühzeitiger Buchung.",
    provider: "stripe",
  },
  card: {
    title: "Kredit- oder Debitkarte",
    description: "Sicher mit Visa oder Mastercard bezahlen.",
    brands: ["Visa", "Mastercard"],
    provider: "stripe",
  },
  apple_pay: {
    title: "Apple Pay",
    description: "Schnell und sicher mit Apple Pay bezahlen.",
    provider: "stripe",
    wallet: true,
  },
  google_pay: {
    title: "Google Pay",
    description: "Schnell und sicher mit Google Pay bezahlen.",
    provider: "stripe",
    wallet: true,
  },
};

export function roundCents(value: number): number {
  return Math.round(value);
}

export function normalizePaymentMethodKey(value: string): PaymentMethodKey | null {
  if (value === "card" || value === "sepa_debit" || value === "apple_pay" || value === "google_pay") {
    return value;
  }
  if (value === "stripe_card") return "card";
  if (value === "stripe_sepa") return "sepa_debit";
  return null;
}

export function parsePaymentFeeConfig(raw: unknown): PaymentFeeConfigMap {
  const base: PaymentFeeConfigMap = structuredClone(DEFAULT_PAYMENT_FEE_CONFIG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;

  const src = raw as Record<string, unknown>;
  const alias: Record<string, PaymentMethodKey> = {
    stripe_card: "card",
    stripe_sepa: "sepa_debit",
    card: "card",
    sepa_debit: "sepa_debit",
    apple_pay: "apple_pay",
    google_pay: "google_pay",
  };

  for (const [srcKey, destKey] of Object.entries(alias)) {
    const row = src[srcKey];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    let percentageBps = base[destKey].percentageBps;
    if (typeof r.percentageBps === "number" && Number.isFinite(r.percentageBps)) {
      percentageBps = Math.max(0, Math.round(r.percentageBps));
    } else if (typeof r.percentage === "number" && Number.isFinite(r.percentage)) {
      percentageBps = Math.max(0, Math.round(r.percentage * 100));
    }
    base[destKey] = {
      percentageBps,
      fixedFeeCents:
        typeof r.fixedFeeCents === "number" && Number.isFinite(r.fixedFeeCents)
          ? Math.max(0, Math.round(r.fixedFeeCents))
          : base[destKey].fixedFeeCents,
      active: Boolean(r.active),
      testMode: r.testMode === undefined ? base[destKey].testMode : Boolean(r.testMode),
      customerSurchargeEnabled: false,
    };
  }
  return base;
}

export function parsePaymentUiConfig(raw: unknown): PaymentUiConfig {
  const base = structuredClone(DEFAULT_PAYMENT_UI_CONFIG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const src = raw as Record<string, unknown>;
  if (Array.isArray(src.methodOrder)) {
    const order = src.methodOrder
      .map((k) => (typeof k === "string" ? normalizePaymentMethodKey(k) : null))
      .filter((k): k is PaymentMethodKey => Boolean(k));
    const missing = DEFAULT_PAYMENT_METHOD_ORDER.filter((k) => !order.includes(k));
    base.methodOrder = [...order, ...missing];
  }
  if (typeof src.sepaRecommended === "boolean") base.sepaRecommended = src.sepaRecommended;
  if (typeof src.recommendedBadgeText === "string" && src.recommendedBadgeText.trim()) {
    base.recommendedBadgeText = src.recommendedBadgeText.trim().slice(0, 40);
  }
  if (typeof src.sepaMinDaysBeforeEvent === "number" && Number.isFinite(src.sepaMinDaysBeforeEvent)) {
    base.sepaMinDaysBeforeEvent = Math.max(0, Math.round(src.sepaMinDaysBeforeEvent));
  }
  return base;
}

export function estimatePaymentFeeCents(
  method: PaymentMethodKey,
  customerTotalCents: number,
  config: PaymentFeeConfigMap = DEFAULT_PAYMENT_FEE_CONFIG,
): number {
  const row = config[method] ?? DEFAULT_PAYMENT_FEE_CONFIG[method];
  const total = Math.max(0, customerTotalCents);
  const percentPart = roundCents((total * row.percentageBps) / 10_000);
  return Math.max(0, percentPart + row.fixedFeeCents);
}

export function estimateNetPayoutCents(
  customerTotalCents: number,
  estimatedFeeCents: number,
): number {
  return Math.max(0, customerTotalCents - estimatedFeeCents);
}

export function isPaymentMethodKey(value: string): value is PaymentMethodKey {
  return (
    value === "card" ||
    value === "sepa_debit" ||
    value === "apple_pay" ||
    value === "google_pay"
  );
}

export type CheckoutPaymentOption = {
  key: PaymentMethodKey;
  title: string;
  subtitle?: string;
  description: string;
  hint?: string;
  brands?: string[];
  provider: "stripe";
  wallet?: boolean;
  visible: boolean;
  selectable: boolean;
  recommended: boolean;
  recommendedBadgeText: string | null;
  badge: "test" | "soon" | "unavailable" | null;
  estimatedFeeCents: number;
  estimatedNetPayoutCents: number;
};

export function buildCheckoutPaymentOptions(input: {
  customerTotalCents: number;
  config: PaymentFeeConfigMap;
  ui?: PaymentUiConfig;
  stripeLiveConfigured?: boolean;
  allowDevTestCheckout?: boolean;
  /** Hide SEPA when true (e.g. event too soon) */
  sepaDisabled?: boolean;
  /** Client-side: which wallets the device supports */
  walletAvailability?: { apple_pay?: boolean; google_pay?: boolean };
}): CheckoutPaymentOption[] {
  const {
    customerTotalCents,
    config,
    ui = DEFAULT_PAYMENT_UI_CONFIG,
    stripeLiveConfigured = false,
    allowDevTestCheckout = false,
    sepaDisabled = false,
    walletAvailability,
  } = input;

  const order = ui.methodOrder?.length ? ui.methodOrder : DEFAULT_PAYMENT_METHOD_ORDER;

  return order.map((key) => {
    const meta = PAYMENT_METHOD_META[key];
    const row = config[key];
    const estimatedFeeCents = estimatePaymentFeeCents(key, customerTotalCents, config);
    const liveOk = row.active && stripeLiveConfigured;
    const testOk = row.testMode && allowDevTestCheckout;
    let selectable = liveOk || testOk;
    let visible = true;

    if (key === "sepa_debit" && sepaDisabled) {
      selectable = false;
      // Keep visible with explanation when near event
      visible = true;
    }

    if (meta.wallet && walletAvailability) {
      const available =
        key === "apple_pay"
          ? walletAvailability.apple_pay === true
          : walletAvailability.google_pay === true;
      if (!available) {
        visible = false;
        selectable = false;
      }
    }

    let badge: "test" | "soon" | "unavailable" | null = null;
    if (key === "sepa_debit" && sepaDisabled) badge = "unavailable";
    else if (selectable && testOk && !liveOk) badge = "test";
    else if (!selectable && visible) badge = "soon";

    const recommended =
      key === "sepa_debit" && ui.sepaRecommended && selectable && !sepaDisabled;

    return {
      key,
      title: meta.title,
      subtitle: meta.subtitle,
      description: meta.description,
      hint:
        key === "sepa_debit" && sepaDisabled
          ? "Lastschrift ist für dieses Event aufgrund des nahen Veranstaltungstermins nicht mehr verfügbar. Bitte bezahle mit Karte, Apple Pay oder Google Pay."
          : meta.hint,
      brands: meta.brands,
      provider: "stripe" as const,
      wallet: meta.wallet,
      visible,
      selectable,
      recommended,
      recommendedBadgeText: recommended ? ui.recommendedBadgeText : null,
      badge,
      estimatedFeeCents,
      estimatedNetPayoutCents: estimateNetPayoutCents(customerTotalCents, estimatedFeeCents),
    };
  });
}

export function providerForMethod(_method: PaymentMethodKey): "stripe" {
  void _method;
  return "stripe";
}

export function translateStripePaymentError(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Zahlung fehlgeschlagen. Bitte versuche es erneut.";
  const lower = raw.toLowerCase();
  if (
    lower.includes("sepa") ||
    lower.includes("iban") ||
    lower.includes("debit payment method") ||
    lower.includes("invalid account")
  ) {
    return "Bitte prüfe deine IBAN und versuche es erneut.";
  }
  if (lower.includes("card_declined") || lower.includes("declined")) {
    return "Deine Karte wurde abgelehnt. Bitte nutze eine andere Karte oder Zahlungsart.";
  }
  if (lower.includes("expired")) {
    return "Die Karte ist abgelaufen. Bitte nutze eine andere Karte.";
  }
  if (lower.includes("insufficient")) {
    return "Das Konto oder die Karte hat nicht genügend Decung.";
  }
  if (lower.includes("authentication") || lower.includes("3d secure")) {
    return "Die zusätzliche Bestätigung ist fehlgeschlagen. Bitte versuche es erneut.";
  }
  // Avoid leaking raw Stripe English tech messages when possible
  if (/^[A-Z_]+$/.test(raw) || lower.includes("invalid")) {
    return "Die Zahlung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben.";
  }
  return raw;
}
