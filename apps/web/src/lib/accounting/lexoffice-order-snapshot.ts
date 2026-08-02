/**
 * Lexoffice-ready order payload (persisted fields + stub sync).
 * Ticketfeeling remains source of truth; Stripe fees are expense, not revenue reduction.
 */

export type LexofficeOrderSnapshot = {
  orderId: string;
  orderNumber: string;
  currency: string;
  ticketGrossCents: number;
  ticketNetCents: number;
  ticketTaxCents: number;
  administrationFeeGrossCents: number;
  administrationFeeNetCents: number;
  administrationFeeTaxCents: number;
  administrationFeeTaxAllocations: unknown;
  totalGrossCents: number;
  totalNetCents: number;
  totalTaxCents: number;
  stripeFeeActualCents: number | null;
  stripeNetPayoutCents: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeBalanceTransactionId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  lexofficeVoucherId: string | null;
  lexofficeSyncStatus: string | null;
};

export function buildLexofficeOrderSnapshot(order: {
  id: string;
  orderNumber: string;
  currency: string;
  ticketSubtotalCents: number;
  ticketsGrossCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  customerTotalCents: number;
  feeGrossCents: number;
  feeNetCents: number;
  feeTaxCents: number;
  administrationFeeGrossCents: number;
  administrationFeeNetCents: number;
  administrationFeeTaxCents: number;
  administrationFeeTaxAllocations: unknown;
  stripeFeeActualCents: number | null;
  stripeNetPayoutCents: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeBalanceTransactionId: string | null;
  lexofficeVoucherId: string | null;
  lexofficeSyncStatus: string | null;
  invoices?: { invoiceNumber: string; status: string }[];
}): LexofficeOrderSnapshot {
  const feeGross = order.administrationFeeGrossCents || order.feeGrossCents;
  const feeNet = order.administrationFeeNetCents || order.feeNetCents;
  const feeTax = order.administrationFeeTaxCents || order.feeTaxCents;
  const totalGross = order.customerTotalCents || order.grossCents;
  const ticketGross = order.ticketSubtotalCents || order.ticketsGrossCents;
  // Approximate ticket net/tax as order totals minus fee (snapshots already include fee in order net/tax)
  const ticketNet = Math.max(0, order.netCents - feeNet);
  const ticketTax = Math.max(0, order.taxCents - feeTax);
  const invoice = order.invoices?.[0] ?? null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    ticketGrossCents: ticketGross,
    ticketNetCents: ticketNet,
    ticketTaxCents: ticketTax,
    administrationFeeGrossCents: feeGross,
    administrationFeeNetCents: feeNet,
    administrationFeeTaxCents: feeTax,
    administrationFeeTaxAllocations: order.administrationFeeTaxAllocations,
    totalGrossCents: totalGross,
    totalNetCents: order.netCents,
    totalTaxCents: order.taxCents,
    stripeFeeActualCents: order.stripeFeeActualCents,
    stripeNetPayoutCents: order.stripeNetPayoutCents,
    stripePaymentIntentId: order.stripePaymentIntentId,
    stripeChargeId: order.stripeChargeId,
    stripeBalanceTransactionId: order.stripeBalanceTransactionId,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceStatus: invoice?.status ?? null,
    lexofficeVoucherId: order.lexofficeVoucherId,
    lexofficeSyncStatus: order.lexofficeSyncStatus,
  };
}
