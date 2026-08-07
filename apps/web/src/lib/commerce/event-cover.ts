/** Hard display cap — never upscale covers past this CSS size (incl. embeds). */
export const COVER_DISPLAY_MAX_PX = 444;

/** Tailwind-friendly class: max width and height, no upscale past COVER_DISPLAY_MAX_PX. */
export const COVER_DISPLAY_MAX_CLASS = "max-h-[444px] max-w-[444px]";

/** Known-dead remote covers that still sit in older seed/DB rows (Safari shows "?").
 * Not an allowlist — only remaps this one broken Unsplash URL to a local asset. */
const DEAD_COVER_URLS = [
  "https://images.unsplash.com/photo-1459749411175-047513050fa9",
] as const;

const DEAD_COVER_REPLACEMENTS: Record<string, string> = {
  "https://images.unsplash.com/photo-1459749411175-047513050fa9":
    "/covers/schlagerfeeling-open-air-2027.jpg",
};

/** Drop or replace broken cover URLs so the UI never renders a dead img src. */
export function normalizeCoverImageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() || null;
  if (!trimmed) return null;
  for (const dead of DEAD_COVER_URLS) {
    if (trimmed.startsWith(dead)) {
      return DEAD_COVER_REPLACEMENTS[dead] ?? null;
    }
  }
  return trimmed;
}

/** Resolve public cover: event override, else tour poster, else null. */
export function resolveEventCoverUrl(input: {
  coverImageUrl?: string | null;
  tour?: { coverImageUrl?: string | null } | null;
}): string | null {
  const own = normalizeCoverImageUrl(input.coverImageUrl);
  if (own) return own;
  return normalizeCoverImageUrl(input.tour?.coverImageUrl);
}
