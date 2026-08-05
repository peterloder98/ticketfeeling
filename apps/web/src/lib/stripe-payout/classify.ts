import type { BalanceClassification } from "@/lib/stripe-payout/types";

/** Classify a Stripe balance transaction for accounting — never drop unknown types. */
export function classifyBalanceTransaction(input: {
  type: string;
  reportingCategory?: string | null;
  description?: string | null;
  sourceType?: string | null;
}): BalanceClassification {
  const type = (input.type || "").toLowerCase();
  const reporting = (input.reportingCategory || "").toLowerCase();
  const desc = (input.description || "").toLowerCase();
  const source = (input.sourceType || "").toLowerCase();

  if (type === "payout" || type === "payout_cancel" || type === "payout_failure") {
    return "payout";
  }
  if (type === "charge" || type === "payment") {
    return "payment";
  }
  if (type === "payment_refund" || type === "refund" || type === "refund_failure") {
    return "refund";
  }
  if (type === "stripe_fee" || reporting === "fee") {
    return "stripe_fee";
  }
  if (type === "network_cost" || type.includes("fee")) {
    if (desc.includes("dispute") || desc.includes("chargeback")) return "dispute_fee";
    return "stripe_fee";
  }
  if (type === "adjustment") {
    if (desc.includes("dispute") || source === "dispute") return "dispute";
    if (desc.includes("fee")) return "fee_refund";
    return "adjustment";
  }
  if (type === "reserve_transaction" || type === "reserved_funds" || type.includes("reserve")) {
    return "reserve";
  }
  if (type === "dispute" || source === "dispute") {
    return "dispute";
  }
  if (type === "advance" || type === "advance_funding" || type === "topup" || type === "transfer") {
    return "adjustment";
  }
  if (reporting === "charge" || reporting === "charge_failure") return "payment";
  if (reporting === "refund") return "refund";
  if (reporting === "dispute") return "dispute";
  if (reporting === "fee") return "stripe_fee";

  return "unknown";
}

export function classificationRequiresOrder(c: BalanceClassification): boolean {
  return c === "payment" || c === "refund" || c === "dispute";
}
