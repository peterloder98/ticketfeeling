/**
 * Browser-Tracking (GA4/Meta Scripts + Client-Events) nur auf Ticket-Commerce-Pfaden.
 * Startseite, Admin, Kasse, Scanner, Hilfe usw. bleiben stumm — auch wenn trackingEnabled.
 * Server-Purchase (MP/CAPI beim Fulfill) ist davon unabhängig und läuft weiter.
 */

const COMMERCE_PREFIXES = [
  "/event",
  "/events",
  "/tour",
  "/embed",
  "/warenkorb",
  "/checkout",
  "/konto/bestellung",
] as const;

export function isPublicCommerceTrackingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.split("#")[0] || "";
  if (!path.startsWith("/")) return false;

  return COMMERCE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
