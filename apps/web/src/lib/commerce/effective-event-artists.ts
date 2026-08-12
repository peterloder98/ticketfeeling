/**
 * Effective line-up for an event: tour artists when inheriting, else event override.
 */

export function eventInheritsTourArtists(event: {
  tourId?: string | null;
  artistsUseTourDefaults?: boolean | null;
}): boolean {
  return Boolean(event.tourId && event.artistsUseTourDefaults !== false);
}

/**
 * Pick override EventArtist[] or tour TourArtist[] for public/admin display.
 * Event and tour link shapes differ slightly; callers usually only need `.artist` / role fields.
 */
export function resolveEffectiveArtistLinks<
  TEventLink extends { artist: unknown },
  TTourLink extends { artist: unknown } = TEventLink,
>(event: {
  tourId?: string | null;
  artistsUseTourDefaults?: boolean | null;
  artists: TEventLink[];
  tour?: { artists?: TTourLink[] | null } | null;
}): Array<TEventLink | TTourLink> {
  const tourArtists = event.tour?.artists;
  // Empty tour line-up (e.g. schema seeded without copy) must not wipe event artists.
  if (eventInheritsTourArtists(event) && tourArtists && tourArtists.length > 0) {
    return tourArtists;
  }
  return event.artists;
}

/** Slim listing shape used by EventCard / public listings. */
export function resolveEffectiveListingArtists(event: {
  tourId?: string | null;
  artistsUseTourDefaults?: boolean | null;
  artists: { artist: { name: string; profileImageUrl: string | null } }[];
  tour?: {
    artists?: { artist: { name: string; profileImageUrl: string | null } }[] | null;
  } | null;
}): { name: string; imageUrl: string | null }[] {
  const links = resolveEffectiveArtistLinks(event);
  return links.map((a) => ({
    name: a.artist.name,
    imageUrl: a.artist.profileImageUrl,
  }));
}
