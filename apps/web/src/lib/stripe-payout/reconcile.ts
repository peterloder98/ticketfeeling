/**
 * Stripe payout reconciliation control sum.
 * For automatic EUR payouts, Stripe documents that the sum of balance transaction
 * `net` values linked to the payout equals the payout `amount`.
 * Sign convention is validated with fixtures; do not invent tolerances.
 */
export function computePayoutNetSumCents(
  balanceTransactions: Array<{ netCents: number; type?: string }>,
): number {
  return balanceTransactions.reduce((sum, bt) => {
    // The payout row itself is the bank transfer out — exclude from control sum of contents
    if ((bt.type || "").toLowerCase() === "payout") return sum;
    return sum + bt.netCents;
  }, 0);
}

export function reconcilePayoutAmount(input: {
  payoutAmountCents: number;
  balanceTransactions: Array<{ netCents: number; type?: string }>;
  paginationComplete: boolean;
}): { differenceCents: number; ok: boolean; reason?: string } {
  if (!input.paginationComplete) {
    return { differenceCents: 0, ok: false, reason: "pagination_incomplete" };
  }
  const netSum = computePayoutNetSumCents(input.balanceTransactions);
  // Payout amount is typically positive (money leaving Stripe to bank).
  // Content nets should sum to the same magnitude as payout.amount.
  const differenceCents = netSum - input.payoutAmountCents;
  return {
    differenceCents,
    ok: differenceCents === 0,
    reason: differenceCents === 0 ? undefined : "amount_mismatch",
  };
}
