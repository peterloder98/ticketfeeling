/** Resolve public cover: event override, else tour poster, else null. */
export function resolveEventCoverUrl(input: {
  coverImageUrl?: string | null;
  tour?: { coverImageUrl?: string | null } | null;
}): string | null {
  const own = input.coverImageUrl?.trim();
  if (own) return own;
  const tour = input.tour?.coverImageUrl?.trim();
  return tour || null;
}
