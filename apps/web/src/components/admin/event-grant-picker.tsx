"use client";

import { useMemo, useState } from "react";
import { Calendar, MapPin, Search, X } from "lucide-react";

export type EventGrantOption = {
  id: string;
  name: string;
  whenLabel: string | null;
  locationLabel: string | null;
  optionLabel: string;
};

/**
 * Searchable event multi-select: results with date/city, selection as removable chips.
 * Replaces the old checkbox grid for Vorverkaufsstelle event grants.
 */
export function EventGrantPicker({
  events,
  selectedIds,
  onChange,
  excludeIds,
  legend = "Events freigeben",
  hint = "Suche nach Name, Datum oder Stadt — gleichnamige Termine erkennst du am Datum und Ort.",
  emptyLabel = "Keine Events verfügbar.",
}: {
  events: EventGrantOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Hide these from the searchable list (already granted elsewhere). */
  excludeIds?: string[];
  legend?: string;
  hint?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const exclude = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedEvents = useMemo(
    () => events.filter((ev) => selectedSet.has(ev.id)),
    [events, selectedSet],
  );

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (exclude.has(ev.id) || selectedSet.has(ev.id)) return false;
      if (!q) return true;
      const hay = `${ev.name} ${ev.whenLabel ?? ""} ${ev.locationLabel ?? ""} ${ev.optionLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, exclude, selectedSet, query]);

  function add(id: string) {
    if (selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-[var(--tf-navy)]">{legend}</legend>
      <p className="text-sm text-[var(--tf-text-secondary)]">{hint}</p>

      {selectedEvents.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Ausgewählte Events">
          {selectedEvents.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => remove(ev.id)}
                className="tf-badge tf-badge-teal inline-flex max-w-full items-center gap-1.5 !px-2.5 !py-1.5 text-left text-sm transition duration-200 hover:opacity-90"
                title="Entfernen"
              >
                <span className="min-w-0 truncate">{ev.optionLabel}</span>
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="sr-only">entfernen</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--tf-text-secondary)]">Noch kein Event ausgewählt.</p>
      )}

      <label className="relative block">
        <span className="sr-only">Events suchen</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tf-text-secondary)]"
          aria-hidden
        />
        <input
          className="tf-input pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Event suchen…"
          autoComplete="off"
        />
      </label>

      <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
        {available.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => add(ev.id)}
            className="flex w-full items-start gap-3 rounded-2xl border border-[var(--tf-line)] bg-white px-3 py-3 text-left transition duration-200 hover:border-[var(--tf-teal)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[var(--tf-navy)]">{ev.name}</span>
              {ev.whenLabel ? (
                <span className="mt-1 flex items-start gap-1.5 text-sm text-[var(--tf-text-secondary)]">
                  <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                  {ev.whenLabel}
                </span>
              ) : null}
              {ev.locationLabel ? (
                <span className="mt-0.5 flex items-start gap-1.5 text-sm text-[var(--tf-text-secondary)]">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                  {ev.locationLabel}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs font-medium text-[var(--tf-teal)]">+ Hinzufügen</span>
          </button>
        ))}
        {events.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">{emptyLabel}</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            {query.trim()
              ? "Kein Treffer — Suchbegriff anpassen oder Event schon ausgewählt."
              : "Alle passenden Events sind bereits ausgewählt."}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
