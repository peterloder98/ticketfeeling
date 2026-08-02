import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getEventListSales } from "@/lib/commerce/event-sales-report";
import { formatEuroFromCents } from "@/lib/money";
import { eventStatusLabel } from "@/lib/admin/nav";
import { TicketProgressBar } from "@/components/admin/category-sales-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function AdminEventsPage() {
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

  const events = await getEventListSales(membership.organizationId);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Events</h1>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Übersicht aller Veranstaltungen — Klick für Details, Verkäufe und Bearbeitung.
          </p>
        </div>
        {canWrite ? (
          <Link href="/admin/events/neu" className="tf-btn tf-btn-primary !min-h-10 text-sm">
            Neues Event
          </Link>
        ) : null}
      </div>

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
            <p className="text-[var(--tf-text-secondary)]">Noch keine Events angelegt.</p>
            {canWrite ? (
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
