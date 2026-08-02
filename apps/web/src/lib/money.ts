/** All amounts in integer cents. Never use floats for money. */

export function splitGrossToNetTax(grossCents: number, taxRateBps: number) {
  // gross = net * (1 + rate); net = gross / (1 + rate)
  const netCents = Math.round((grossCents * 10000) / (10000 + taxRateBps));
  const taxCents = grossCents - netCents;
  return { netCents, taxCents, grossCents };
}

export function formatEuroFromCents(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function nextOrderNumber(seq: number) {
  const year = new Date().getFullYear();
  return `TF-${year}-${String(seq).padStart(6, "0")}`;
}

export function nextTicketNumber(seq: number) {
  const year = new Date().getFullYear();
  return `TCK-${year}-${String(seq).padStart(8, "0")}`;
}
