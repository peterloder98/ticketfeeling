"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EventCard, type EventCardData } from "@/components/event-card";

/**
 * Instant client-side search over the already-loaded event cards (max ~80).
 */
export function EventsSearchGrid({
  cards,
  initialQuery = "",
}: {
  cards: EventCardData[];
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => {
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
  }, [cards, q]);

  return (
    <>
      <div className="relative mt-6 max-w-xl">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[var(--tf-teal)]"
          strokeWidth={2}
          aria-hidden
        />
        <input
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            const url = next.trim()
              ? `/events?q=${encodeURIComponent(next.trim())}`
              : "/events";
            window.history.replaceState(null, "", url);
          }}
          placeholder="Künstler, Events oder Orte suchen"
          className="tf-input tf-input-search !min-h-11 text-base"
          aria-label="Events suchen"
          autoComplete="off"
        />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((card) => (
          <EventCard key={card.id} event={card} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 text-base text-[var(--tf-text-secondary)]">
          Keine Treffer{q.trim() ? ` für „${q.trim()}“` : ""}. Versuche einen anderen Suchbegriff.
        </p>
      ) : null}
    </>
  );
}
