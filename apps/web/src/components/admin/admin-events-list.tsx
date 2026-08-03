"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEuroFromCents } from "@/lib/money";
import { eventStatusLabel } from "@/lib/admin/nav";
import { TicketProgressBar } from "@/components/admin/category-sales-table";
import {
  DEFAULT_EVENT_LIST_FILTERS,
  EVENT_LIST_FILTERS,
  eventListFilterHref,
  isDefaultEventListFilters,
  statusesForEventListFilters,
  toggleEventListFilter,
  type EventListFilterKey,
} from "@/lib/admin/event-list-filters";

export type AdminEventListRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  eventStartsAt: string | null;
  locationName: string | null;
  locationCity: string | null;
  categoryCount: number;
  capacity: number;
  sold: number;
  remaining: number;
  revenueCents: number;
  onlineSold: number;
  boxOfficeSold: number;
};

/**
 * Filter chips update instantly in the client — no full RSC reload per click.
 */
export function AdminEventsList({
  events,
  initialFilters,
  canWrite,
}: {
  events: AdminEventListRow[];
  initialFilters: EventListFilterKey[];
  canWrite: boolean;
}) {
  const [activeFilters, setActiveFilters] = useState<EventListFilterKey[]>(initialFilters);

  const visible = useMemo(() => {
    const statuses = new Set(statusesForEventListFilters(activeFilters));
    return events.filter((event) => statuses.has(event.status));
  }, [events, activeFilters]);

  const isDefaultView = isDefaultEventListFilters(activeFilters);

  function setFilters(next: EventListFilterKey[]) {
    setActiveFilters(next);
    const href = eventListFilterHref(next);
    window.history.replaceState(null, "", href);
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {EVENT_LIST_FILTERS.map((filter) => {
          const active = activeFilters.includes(filter.key);
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() =>
                setFilters(toggleEventListFilter(activeFilters, filter.key as EventListFilterKey))
              }
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-[#0F2747] bg-[#0F2747] !text-white"
                  : "border-[var(--tf-line)] bg-white !text-[#0F2747] hover:border-[var(--tf-teal)]"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
        {!isDefaultView ? (
          <button
            type="button"
            onClick={() => setFilters([...DEFAULT_EVENT_LIST_FILTERS])}
            className="text-sm font-medium text-[var(--tf-teal)] hover:underline"
          >
            Standard zurücksetzen
          </button>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        {visible.map((event) => {
          const when = event.eventStartsAt
            ? new Date(event.eventStartsAt).toLocaleString("de-DE", {
                timeZone: "Europe/Berlin",
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Termin offen";
          const place = [event.locationName, event.locationCity].filter(Boolean).join(", ");

          return (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="tf-card tf-card-hover block !p-5 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--tf-navy)]">{event.name}</h2>
                    <span className="rounded-full bg-[rgba(15,39,71,0.06)] px-2.5 py-0.5 text-xs font-medium text-[var(--tf-navy)]">
                      {eventStatusLabel(event.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                    {when}
                    {place ? ` · ${place}` : ""}
                    {` · ${event.categoryCount} ${event.categoryCount === 1 ? "Kategorie" : "Kategorien"}`}
                  </p>
                </div>
                <div className="w-full max-w-[220px] sm:w-56">
                  <TicketProgressBar sold={event.sold} capacity={event.capacity} />
                  <p className="mt-1.5 text-xs text-[var(--tf-text-secondary)]">
                    {formatEuroFromCents(event.revenueCents)} Umsatz
                    {event.sold > 0
                      ? ` · Shop ${event.onlineSold} · Kasse ${event.boxOfficeSold}`
                      : null}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

        {visible.length === 0 ? (
          <div className="tf-card py-12 text-center">
            <p className="text-[var(--tf-text-secondary)]">Keine Events für diese Filter.</p>
            {canWrite && isDefaultView ? (
              <Link href="/admin/events/neu" className="tf-btn tf-btn-primary mt-4 inline-flex">
                Erstes Event anlegen
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
