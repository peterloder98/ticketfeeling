import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/event-form";

/**
 * Build a unique event slug.
 * Tour dates: name + city (or date) so 2nd/3rd termin never collide with the tour name.
 */
export async function allocateUniqueEventSlug(input: {
  organizationId: string;
  name: string;
  preferredSlug?: string | null;
  tourId?: string | null;
  locationCity?: string | null;
  locationName?: string | null;
  eventStartsAt?: Date | null;
  excludeEventId?: string | null;
}): Promise<string> {
  const base = slugify(input.preferredSlug?.trim() || input.name);
  let candidate = base;

  if (input.tourId) {
    const place = slugify(input.locationCity || input.locationName || "");
    const datePart = input.eventStartsAt
      ? [
          input.eventStartsAt.getUTCFullYear(),
          String(input.eventStartsAt.getUTCMonth() + 1).padStart(2, "0"),
          String(input.eventStartsAt.getUTCDate()).padStart(2, "0"),
        ].join("")
      : "";
    if (place) candidate = `${base}-${place}`;
    else if (datePart) candidate = `${base}-${datePart}`;
  }

  const stem = candidate;
  for (let n = 2; n <= 200; n += 1) {
    const taken = await prisma.event.findFirst({
      where: {
        organizationId: input.organizationId,
        slug: candidate,
        ...(input.excludeEventId ? { NOT: { id: input.excludeEventId } } : {}),
      },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${stem}-${n}`;
  }
  throw new Error("SLUG_TAKEN");
}
