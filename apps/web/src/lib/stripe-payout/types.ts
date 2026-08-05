export type PayoutReconciliationStatus =
  | "announced"
  | "importing"
  | "in_progress"
  | "awaiting_stripe_data"
  | "partially_mapped"
  | "unreconciled"
  | "reconciled"
  | "review_required"
  | "payout_failed"
  | "unsupported_manual_payout";

export type BalanceClassification =
  | "payment"
  | "stripe_fee"
  | "refund"
  | "dispute"
  | "dispute_fee"
  | "adjustment"
  | "reserve"
  | "fee_refund"
  | "payout"
  | "unknown";

export type MappingStatus = "pending" | "mapped" | "unmapped" | "manual" | "awaiting_balance";

export type PayoutDocumentType =
  | "revenue_collective"
  | "stripe_costs"
  | "payout_reconciliation";

export function stripeEnvironment(): "test" | "live" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_test") || key.startsWith("rk_test") ? "test" : "live";
}
