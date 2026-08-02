type HolderLike = {
  userId?: string | null;
  emailNormalized?: string | null;
} | null;

type OrderCustomerLike = {
  userId?: string | null;
  emailNormalized?: string | null;
} | null;

function matchesPerson(
  sessionUserId: string | null,
  sessionEmail: string | null,
  person?: HolderLike | OrderCustomerLike,
) {
  if (!person) return false;
  if (sessionUserId && person.userId === sessionUserId) return true;
  if (sessionEmail && person.emailNormalized === sessionEmail) return true;
  return false;
}

/** Buyer of the order or current ticket holder (or staff handled by caller). */
export function isTicketParty(input: {
  sessionUserId?: string | null;
  sessionEmail?: string | null;
  holder?: HolderLike;
  orderCustomer?: OrderCustomerLike;
}) {
  const email = input.sessionEmail?.toLowerCase() ?? null;
  const uid = input.sessionUserId ?? null;
  if (!uid && !email) return false;
  return (
    matchesPerson(uid, email, input.holder) ||
    matchesPerson(uid, email, input.orderCustomer)
  );
}

export function isTicketHolder(input: {
  sessionUserId?: string | null;
  sessionEmail?: string | null;
  holder?: HolderLike;
}) {
  const email = input.sessionEmail?.toLowerCase() ?? null;
  const uid = input.sessionUserId ?? null;
  if (!uid && !email) return false;
  return matchesPerson(uid, email, input.holder);
}

/** Ticket was handed over to someone other than the order buyer. */
export function isTicketTransferred(input: {
  holderCustomerId?: string | null;
  orderCustomerId?: string | null;
}) {
  return Boolean(
    input.holderCustomerId &&
      input.orderCustomerId &&
      input.holderCustomerId !== input.orderCustomerId,
  );
}

/**
 * Who may show QR / download PDF: current holder (or staff).
 * After forwarding, the original buyer keeps order access but not entry media.
 */
export function canUseTicketEntry(input: {
  sessionUserId?: string | null;
  sessionEmail?: string | null;
  holder?: HolderLike;
  isStaff?: boolean;
}) {
  if (input.isStaff) return true;
  return isTicketHolder({
    sessionUserId: input.sessionUserId,
    sessionEmail: input.sessionEmail,
    holder: input.holder,
  });
}
