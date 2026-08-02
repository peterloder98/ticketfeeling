import { prisma } from "@/lib/db";

/**
 * Keep tour dates in sync with the tour poster.
 * Events with a different coverImageUrl are treated as custom overrides and left alone.
 */
export async function syncTourCoverToEvents(input: {
  tourId: string;
  previousCoverUrl: string | null;
  nextCoverUrl: string | null;
}): Promise<number> {
  const prev = input.previousCoverUrl?.trim() || null;
  const next = input.nextCoverUrl?.trim() || null;
  if (prev === next) return 0;

  const result = await prisma.event.updateMany({
    where: {
      tourId: input.tourId,
      OR: [
        { coverImageUrl: null },
        ...(prev ? [{ coverImageUrl: prev }] as const : []),
      ],
    },
    data: { coverImageUrl: next },
  });

  return result.count;
}

/** Resolve which cover to persist on a tour date (tour default unless custom override). */
export async function resolveCoverForTourEvent(input: {
  tourId: string | null;
  coverImageUrl: string | null;
}): Promise<string | null> {
  const own = input.coverImageUrl?.trim() || null;
  if (!input.tourId) return own;

  const tour = await prisma.tour.findUnique({
    where: { id: input.tourId },
    select: { coverImageUrl: true },
  });
  const tourCover = tour?.coverImageUrl?.trim() || null;

  // Explicit custom cover (different from tour poster)
  if (own && own !== tourCover) return own;

  // Default: store tour poster on the event so it is "gesetzt"
  return tourCover;
}

export function eventUsesTourCover(input: {
  coverImageUrl?: string | null;
  tourCoverUrl?: string | null;
}): boolean {
  const own = input.coverImageUrl?.trim() || null;
  const tour = input.tourCoverUrl?.trim() || null;
  if (!tour) return false;
  return !own || own === tour;
}
