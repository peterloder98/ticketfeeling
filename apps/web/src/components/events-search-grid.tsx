import { EventCard, type EventCardData } from "@/components/event-card";

/**
 * Event grid for /events. Filtering uses `?q=` from the site-header search
 * (no duplicate search bar on this page).
 */
export function EventsSearchGrid({
  cards,
  initialQuery = "",
}: {
  cards: EventCardData[];
  initialQuery?: string;
}) {
  const needle = initialQuery.trim().toLowerCase();
  const filtered = !needle
    ? cards
    : cards.filter((card) => {
        const haystack = [
          card.name,
          card.subtitle,
          card.locationName,
          card.locationCity,
          card.whenLabel,
          ...(card.artists?.map((a) => a.name) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });

  return (
    <>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((card) => (
          <EventCard key={card.id} event={card} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 text-base text-[var(--tf-text-secondary)]">
          Keine Treffer{needle ? ` für „${initialQuery.trim()}“` : ""}. Versuche einen anderen
          Suchbegriff.
        </p>
      ) : null}
    </>
  );
}
