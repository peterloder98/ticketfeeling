/**
 * Guards against reconcile / dead-letter resurrection blasting emails for
 * old paid orders (e.g. test purchases from days ago).
 */

/** Buyer ticket mail may still be retried this long after payment. */
export const MISSING_MAIL_RETRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Staff „Neue Bestellung“ must not fire for stale fulfillments — those look
 * like brand-new orders in the inbox.
 */
export const STAFF_NOTIFY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function orderPaidReferenceAt(order: {
  paidAt?: Date | null;
  paymentSucceededAt?: Date | null;
  createdAt?: Date | null;
}): Date | null {
  return order.paidAt ?? order.paymentSucceededAt ?? order.createdAt ?? null;
}

export function isWithinAgeMs(reference: Date | null | undefined, maxAgeMs: number, now = new Date()): boolean {
  if (!reference) return false;
  return now.getTime() - reference.getTime() <= maxAgeMs;
}

/** True when reconcile may still enqueue post-fulfill for missing buyer mail. */
export function shouldRetryMissingBuyerMail(
  order: { paidAt?: Date | null; paymentSucceededAt?: Date | null; createdAt?: Date | null },
  now = new Date(),
): boolean {
  return isWithinAgeMs(orderPaidReferenceAt(order), MISSING_MAIL_RETRY_MAX_AGE_MS, now);
}

/** True when staff should get a live „Neue Bestellung“ notification. */
export function shouldSendStaffNewOrderNotify(
  order: { paidAt?: Date | null; paymentSucceededAt?: Date | null; createdAt?: Date | null },
  now = new Date(),
): boolean {
  return isWithinAgeMs(orderPaidReferenceAt(order), STAFF_NOTIFY_MAX_AGE_MS, now);
}
