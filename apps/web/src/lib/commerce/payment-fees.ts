/**
 * Internal Stripe PSP fee estimates — never added to the customer total.
 * PayPal removed; customer surcharge always false.
 */

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

export const DEFAULT_PAYMENT_FEE_CONFIG: PaymentFeeConfigMap = {
  sepa_debit: {
    percentageBps: 0,
    fixedFeeCents: 35,
    active: false,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  card: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: false,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  apple_pay: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: false,
    testMode: true,
    customerSurchargeEnabled: false,
  },
  google_pay: {
    percentageBps: 150,
    fixedFeeCents: 25,
    active: false,
    testMode: true,
    customerSurchargeEnabled: false,
  },
};

export const PAYMENT_METHOD_META: Record<
  PaymentMethodKey,
  {
    title: string;
    description: string;
    hint?: string;
    brands?: string[];
    provider: "stripe";
    /** Wallet methods rely on Stripe card + device support */
    wallet?: boolean;
  }
> = {
  card: {
    title: "Kredit- oder Debitkarte",
    description: "Sicher bezahlen mit Visa oder Mastercard.",
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
  sepa_debit: {
    title: "SEPA-Lastschrift",
    description: "Bequem vom Bankkonto abbuchen.",
    provider: "stripe",
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
  // Map legacy keys into new structure
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
  description: string;
  hint?: string;
  brands?: string[];
  provider: "stripe";
  wallet?: boolean;
  visible: boolean;
  selectable: boolean;
  badge: "test" | "soon" | null;
  estimatedFeeCents: number;
  estimatedNetPayoutCents: number;
};

export function buildCheckoutPaymentOptions(input: {
  customerTotalCents: number;
  config: PaymentFeeConfigMap;
  stripeLiveConfigured?: boolean;
  allowDevTestCheckout?: boolean;
  /** Hide SEPA when true (e.g. event too soon) */
  sepaDisabled?: boolean;
}): CheckoutPaymentOption[] {
  const {
    customerTotalCents,
    config,
    stripeLiveConfigured = false,
    allowDevTestCheckout = false,
    sepaDisabled = false,
  } = input;

  return (Object.keys(PAYMENT_METHOD_META) as PaymentMethodKey[]).map((key) => {
    const meta = PAYMENT_METHOD_META[key];
    const row = config[key];
    const estimatedFeeCents = estimatePaymentFeeCents(key, customerTotalCents, config);
    const liveOk = row.active && stripeLiveConfigured;
    const testOk = row.testMode && allowDevTestCheckout;
    let selectable = liveOk || testOk;
    let visible = true;

    if (key === "sepa_debit" && sepaDisabled) {
      selectable = false;
      visible = false;
    }

    // Apple/Google Pay: visible in UI; Elements shows only when available
    let badge: "test" | "soon" | null = null;
    if (selectable && testOk && !liveOk) badge = "test";
    else if (!selectable && visible) badge = "soon";

    return {
      key,
      title: meta.title,
      description: meta.description,
      hint: undefined,
      brands: meta.brands,
      provider: "stripe" as const,
      wallet: meta.wallet,
      visible,
      selectable,
      badge,
      estimatedFeeCents,
      estimatedNetPayoutCents: estimateNetPayoutCents(customerTotalCents, estimatedFeeCents),
    };
  });
}

export function providerForMethod(_method: PaymentMethodKey): "stripe" {
  return "stripe";
}
