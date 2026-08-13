/**
 * Responsive event listing grid by visible card count.
 * Phone: always 1 col. Tablet: up to 2. Desktop: up to 3 (never 4).
 */
export function listingGridClassName(
  count: number,
  opts?: { marginTopClass?: string },
): string {
  const mt = opts?.marginTopClass ?? "mt-6";
  if (count <= 0) return mt;
  if (count === 1) {
    // Larger single card — constrained, not full-bleed across the content width.
    return `${mt} grid max-w-[48rem] grid-cols-1 gap-4`;
  }
  if (count === 2) {
    return `${mt} grid grid-cols-1 gap-4 sm:grid-cols-2`;
  }
  // 3+ events: fill with equal columns, wrap at 3 on large screens.
  return `${mt} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`;
}
