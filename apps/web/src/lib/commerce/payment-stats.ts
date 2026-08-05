import { prisma } from "@/lib/db";
import type { PaymentMethodKey } from "@/lib/commerce/payment-fees";
import { PAYMENT_METHOD_META } from "@/lib/commerce/payment-fees";

export type PaymentMethodStatRow = {
  method: PaymentMethodKey | "other";
  label: string;
  orderCount: number;
  revenueCents: number;
  estimatedFeeCents: number;
  actualFeeCents: number;
  /** Average actual Stripe fee per order */
  avgFeeCents: number;
  netPayoutCents: number;
  feeVarianceCents: number;
  /** Share of total revenue (0–100) */
  sharePercent: number;
};

export type PlatformFeeVsStripeStats = {
  orderCount: number;
  customerRevenueCents: number;
  administrationFeeGrossCents: number;
  stripeFeeActualCents: number;
  stripeFeeEstimatedCents: number;
  stripeNetPayoutCents: number;
  /** Verwaltungsgebühr − Stripe-Kosten (interner Deckungsbeitrag, nicht Umsatz) */
  feeCoverageCents: number;
};

export async function getPaymentFeeStats(input: {
  organizationId: string;
  from?: Date | null;
  to?: Date | null;
}) {
  const where = {
    organizationId: input.organizationId,
    channel: "online" as const,
    status: { in: ["paid", "fulfilled"] },
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    select: {
      paymentMethod: true,
      customerTotalCents: true,
      grossCents: true,
      estimatedPaymentFeeCents: true,
      actualPaymentFeeCents: true,
      stripeFeeActualCents: true,
      stripeFeeEstimatedCents: true,
      stripeNetPayoutCents: true,
      netPayoutCents: true,
      administrationFeeGrossCents: true,
      feeGrossCents: true,
    },
  });

  const buckets = new Map<string, PaymentMethodStatRow>();
  for (const key of Object.keys(PAYMENT_METHOD_META) as PaymentMethodKey[]) {
    buckets.set(key, {
      method: key,
      label: PAYMENT_METHOD_META[key].title,
      orderCount: 0,
      revenueCents: 0,
      estimatedFeeCents: 0,
      actualFeeCents: 0,
      avgFeeCents: 0,
      netPayoutCents: 0,
      feeVarianceCents: 0,
      sharePercent: 0,
    });
  }

  for (const order of orders) {
    const raw = order.paymentMethod;
    const normalized =
      raw === "stripe_card"
        ? "card"
        : raw === "stripe_sepa"
          ? "sepa_debit"
          : raw;
    const method =
      normalized && buckets.has(normalized) ? normalized : "other";
    if (!buckets.has("other") && method === "other") {
      buckets.set("other", {
        method: "other",
        label: "Sonstige",
        orderCount: 0,
        revenueCents: 0,
        estimatedFeeCents: 0,
        actualFeeCents: 0,
        avgFeeCents: 0,
        netPayoutCents: 0,
        feeVarianceCents: 0,
        sharePercent: 0,
      });
    }
    const row = buckets.get(method)!;
    const revenue = order.customerTotalCents || order.grossCents;
    const estimated = order.estimatedPaymentFeeCents ?? 0;
    const actual = order.actualPaymentFeeCents ?? estimated;
    const net = order.netPayoutCents ?? Math.max(0, revenue - actual);
    row.orderCount += 1;
    row.revenueCents += revenue;
    row.estimatedFeeCents += estimated;
    row.actualFeeCents += actual;
    row.netPayoutCents += net;
    row.feeVarianceCents += actual - estimated;
  }

  const rows = [...buckets.values()].filter((r) => r.orderCount > 0 || r.method !== "other");
  const totals = rows.reduce(
    (acc, r) => {
      acc.orderCount += r.orderCount;
      acc.revenueCents += r.revenueCents;
      acc.estimatedFeeCents += r.estimatedFeeCents;
      acc.actualFeeCents += r.actualFeeCents;
      acc.netPayoutCents += r.netPayoutCents;
      acc.feeVarianceCents += r.feeVarianceCents;
      return acc;
    },
    {
      orderCount: 0,
      revenueCents: 0,
      estimatedFeeCents: 0,
      actualFeeCents: 0,
      netPayoutCents: 0,
      feeVarianceCents: 0,
    },
  );

  for (const row of rows) {
    row.avgFeeCents =
      row.orderCount > 0 ? Math.round(row.actualFeeCents / row.orderCount) : 0;
    row.sharePercent =
      totals.revenueCents > 0
        ? Math.round((row.revenueCents / totals.revenueCents) * 10_000) / 100
        : 0;
  }

  const avgFeeCents =
    totals.orderCount > 0 ? Math.round(totals.actualFeeCents / totals.orderCount) : 0;

  const platform: PlatformFeeVsStripeStats = {
    orderCount: 0,
    customerRevenueCents: 0,
    administrationFeeGrossCents: 0,
    stripeFeeActualCents: 0,
    stripeFeeEstimatedCents: 0,
    stripeNetPayoutCents: 0,
    feeCoverageCents: 0,
  };
  for (const order of orders) {
    const revenue = order.customerTotalCents || order.grossCents;
    const adminFee = order.administrationFeeGrossCents || order.feeGrossCents || 0;
    const stripeActual =
      order.stripeFeeActualCents ?? order.actualPaymentFeeCents ?? 0;
    const stripeEst =
      order.stripeFeeEstimatedCents ?? order.estimatedPaymentFeeCents ?? 0;
    const net =
      order.stripeNetPayoutCents ??
      order.netPayoutCents ??
      Math.max(0, revenue - stripeActual);
    platform.orderCount += 1;
    platform.customerRevenueCents += revenue;
    platform.administrationFeeGrossCents += adminFee;
    platform.stripeFeeActualCents += stripeActual;
    platform.stripeFeeEstimatedCents += stripeEst;
    platform.stripeNetPayoutCents += net;
  }
  platform.feeCoverageCents =
    platform.administrationFeeGrossCents - platform.stripeFeeActualCents;

  return { rows, totals, avgFeeCents, platform };
}

export function paymentStatsToCsv(rows: PaymentMethodStatRow[]) {
  const header = [
    "Zahlungsart",
    "Bestellungen",
    "Umsatz_EUR",
    "Anteil_Prozent",
    "Gebuehren_geschaetzt_EUR",
    "Gebuehren_tatsaechlich_EUR",
    "Gebuehren_durchschnitt_EUR",
    "Abweichung_EUR",
    "Netto_EUR",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.label,
        String(r.orderCount),
        (r.revenueCents / 100).toFixed(2).replace(".", ","),
        r.sharePercent.toFixed(2).replace(".", ","),
        (r.estimatedFeeCents / 100).toFixed(2).replace(".", ","),
        (r.actualFeeCents / 100).toFixed(2).replace(".", ","),
        (r.avgFeeCents / 100).toFixed(2).replace(".", ","),
        (r.feeVarianceCents / 100).toFixed(2).replace(".", ","),
        (r.netPayoutCents / 100).toFixed(2).replace(".", ","),
      ].join(";"),
    );
  }
  return lines.join("\n");
}
