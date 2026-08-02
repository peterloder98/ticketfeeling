import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getEventListSales } from "@/lib/commerce/event-sales-report";
import { formatEuroFromCents } from "@/lib/money";
import { eventStatusLabel } from "@/lib/admin/nav";
import { TicketProgressBar } from "@/components/admin/category-sales-table";
import {
  DEFAULT_EVENT_LIST_FILTERS,
  EVENT_LIST_FILTERS,
  eventListFilterHref,
  parseEventListFilters,
  statusesForEventListFilters,
  toggleEventListFilter,
  type EventListFilterKey,
} from "@/lib/admin/event-list-filters";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

type Props = { searchParams: Promise<{ f?: string }> };

export default async function AdminEventsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed = await userHasPermission(session.user.id, membership.organizationId, "events:read");
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung (events:read).</p>;

  const canWrite = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:write",
  );

  const sp = await searchParams;
  const activeFilters = parseEventListFilters(sp.f);
  const statuses = statusesForEventListFilters(activeFilters);
  const events = await getEventListSales(membership.organizationId, { statuses });

  const isDefaultView =
    activeFilters.length === DEFAULT_EVENT_LIST_FILTERS.length &&
    DEFAULT_EVENT_LIST_FILTERS.every((k) => activeFilters.includes(k));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Events</h1>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Einzeltermine und Tour-Termine. Mehrere Orte/Daten? Zuerst unter{" "}
            <Link href="/admin/tours" className="font-medium text-[var(--tf-navy)] underline">
              Touren
            </Link>{" "}
            das Projekt anlegen.
          </p>
        </div>
        {canWrite ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/admin/tours" className="tf-btn tf-btn-primary !min-h-10 text-sm">
              Neue Tour
            </Link>
            <Link href="/admin/events/neu" className="tf-btn tf-btn-primary !min-h-10 text-sm">
              Einzelnes Event
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <AdminSubnav items={ADMIN_SUBNAV.tours} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {EVENT_LIST_FILTERS.map((filter) => {
          const active = activeFilters.includes(filter.key);
          const next = toggleEventListFilter(activeFilters, filter.key as EventListFilterKey);
          return (
            <Link
              key={filter.key}
              href={eventListFilterHref(next)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-[#0F2747] bg-[#0F2747] !text-white"
                  : "border-[var(--tf-line)] bg-white !text-[#0F2747] hover:border-[var(--tf-teal)]"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
        {!isDefaultView ? (
          <Link
            href="/admin/events"
            className="text-sm font-medium text-[var(--tf-teal)] hover:underline"
          >
            Standard zurücksetzen
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
        Standard: Im Verkauf + Pausiert. Entwurf und Abgesagt nur über die Filter.
      </p>

      <div className="mt-6 space-y-3">
        {events.map((event) => {
          const when = event.eventStartsAt
            ? event.eventStartsAt.toLocaleString("de-DE", {
                timeZone: "Europe/Berlin",
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Termin offen";
          const place = [event.location?.name, event.location?.city].filter(Boolean).join(", ");

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

        {events.length === 0 ? (
          <div className="tf-card py-12 text-center">
            <p className="text-[var(--tf-text-secondary)]">
              Keine Events für diese Filter.
            </p>
            {canWrite && isDefaultView ? (
              <Link href="/admin/events/neu" className="tf-btn tf-btn-primary mt-4 inline-flex">
                Erstes Event anlegen
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
