import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getEventListSales } from "@/lib/commerce/event-sales-report";
import { parseEventListFilters } from "@/lib/admin/event-list-filters";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { AdminEventsList } from "@/components/admin/admin-events-list";
import { releaseDuePresales } from "@/lib/commerce/ensure-presale-release";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

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

  // Persist due Vorverkaufsstart → Im Verkauf before listing (closes cron lag).
  await releaseDuePresales({ organizationId: membership.organizationId });

  const sp = await searchParams;
  const activeFilters = parseEventListFilters(sp.f);
  // Load all statuses once — chips filter client-side for instant response.
  const events = await getEventListSales(membership.organizationId);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Events</h1>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Einzeltermine und Tour-Termine. Mehrere Orte/Daten? Zuerst unter{" "}
            <Link href="/admin/tours" className="tf-admin-link">
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

      <AdminEventsList
        canWrite={canWrite}
        initialFilters={activeFilters}
        events={events.map((event) => ({
          id: event.id,
          name: event.name,
          slug: event.slug,
          status: event.status,
          coverUrl: resolveEventCoverUrl({
            coverImageUrl: event.coverImageUrl,
            tour: event.tour,
          }),
          presaleStartsAt: event.presaleStartsAt?.toISOString() ?? null,
          eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
          locationName: event.location?.name ?? null,
          locationCity: event.location?.city ?? null,
          categoryCount: event.categoryCount,
          capacity: event.capacity,
          sold: event.sold,
          remaining: event.remaining,
          revenueCents: event.revenueCents,
          onlineSold: event.onlineSold,
          boxOfficeSold: event.boxOfficeSold,
        }))}
      />
    </div>
  );
}
