/**
 * Resolve public/admin display name + copy when an event inherits from its tour.
 */

export type TourDetailsSource = {
  name: string;
  shortDescription?: string | null;
  description?: string | null;
};

export type EventDetailsSource = {
  tourId?: string | null;
  detailsUseTourDefaults?: boolean | null;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  tour?: TourDetailsSource | null;
};

export function eventInheritsTourDetails(
  event: Pick<EventDetailsSource, "tourId" | "detailsUseTourDefaults">,
): boolean {
  return Boolean(event.tourId && event.detailsUseTourDefaults !== false);
}

export function resolveEffectiveEventDetails(event: EventDetailsSource): {
  name: string;
  shortDescription: string | null;
  description: string | null;
  inherits: boolean;
} {
  const inherits = eventInheritsTourDetails(event);
  const tour = event.tour;
  if (inherits && tour) {
    return {
      name: tour.name?.trim() || event.name,
      shortDescription: tour.shortDescription?.trim() || null,
      description: tour.description?.trim() || null,
      inherits: true,
    };
  }
  return {
    name: event.name,
    shortDescription: event.shortDescription?.trim() || null,
    description: event.description?.trim() || null,
    inherits: false,
  };
}
