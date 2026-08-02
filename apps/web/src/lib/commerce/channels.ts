export type SalesChannel = "online" | "box_office" | "internal";

export function channelLabel(channel: string | null | undefined): string {
  switch (channel) {
    case "box_office":
      return "Tageskasse";
    case "internal":
      return "Intern";
    case "online":
    default:
      return "Online";
  }
}

export function channelShortHint(channel: string | null | undefined): string {
  switch (channel) {
    case "box_office":
      return "Vor Ort verkauft (nicht Online-Selbstkauf)";
    case "internal":
      return "Interner Vorgang";
    case "online":
    default:
      return "Kunde hat selbst online gekauft";
  }
}

export function paymentMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "cash":
      return "Bar";
    case "card_terminal":
      return "Kartenterminal";
    case "other":
      return "Sonstige";
    case "card":
    case "stripe_card":
    case "dev_card":
      return "Kredit- oder Debitkarte";
    case "sepa_debit":
    case "stripe_sepa":
      return "SEPA-Lastschrift";
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    case "paypal":
      return "PayPal (historisch)";
    default:
      return method?.trim() ? method : "—";
  }
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Zahlung ausstehend";
    case "paid":
      return "Bezahlt";
    case "fulfilled":
      // Online: tickets issued. Box office uses boxOfficeSaleStatusLabel instead.
      return "Tickets ausgestellt";
    case "payment_failed":
      return "Zahlung fehlgeschlagen";
    case "cancelled":
      return "Storniert";
    case "refunded":
      return "Erstattet";
    default:
      return status;
  }
}

/** Cancelled / refunded / voided — still listed, but styled as inactive. */
export function isOrderCancelled(input: {
  status?: string | null;
  voidedAt?: Date | string | null;
}): boolean {
  if (input.voidedAt) return true;
  return input.status === "cancelled" || input.status === "refunded";
}

/** Classes for order-number / amount / event lines when cancelled. */
export function orderCancelledStrikeClass(cancelled: boolean): string {
  return cancelled ? "line-through opacity-70" : "";
}

/** Status text color — danger for cancelled, gold otherwise (admin lists). */
export function orderStatusToneClass(cancelled: boolean): string {
  return cancelled ? "text-[var(--danger)] font-semibold" : "text-[var(--gold)]";
}

/** Status for Tageskasse lists / receipts — voided vs. sold only. */
export function boxOfficeSaleStatusLabel(input: {
  voided?: boolean;
  deliveryStatus?: string | null;
  orderStatus?: string | null;
}): string {
  if (input.voided || input.orderStatus === "cancelled" || input.orderStatus === "refunded") {
    return "Storniert";
  }
  return "Verkauft/bezahlt";
}

export function deliveryStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "printed":
      return "gedruckt";
    case "emailed":
      return "per E-Mail";
    case "printed_and_emailed":
      return "gedruckt und per E-Mail";
    case "none":
    default:
      return "Ausgabe noch offen";
  }
}

export function isBoxOfficeChannel(channel: string | null | undefined): boolean {
  return channel === "box_office";
}
