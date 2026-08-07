import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getEventSalesReport } from "@/lib/commerce/event-sales-report";
import { formatEuroFromCents } from "@/lib/money";
import { eventStatusLabel } from "@/lib/admin/nav";
import {
  CategorySalesTable,
  TicketProgressBar,
} from "@/components/admin/category-sales-table";
import { SalesPieChart, SalesTimelineChart } from "@/components/admin/sales-charts";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { EventSeatingSetup } from "@/components/admin/event-seating-setup";
import { EventDiscountsPanel } from "@/components/admin/event-discounts-panel";
import { EventEditForm } from "@/components/admin/event-edit-form";
import { EventLineupForm } from "@/components/admin/event-lineup-form";
import { EmbedCodeModalButton } from "@/components/admin/embed-code-modal";
import { EventAdminHeaderActions } from "@/components/admin/event-admin-header-actions";
import {
  UnassignedSeatsBanner,
  UnassignedSeatsProvider,
} from "@/components/admin/unassigned-seats-banner";
import { canCreateEventCategories, effectiveEventStatus } from "@/lib/commerce/event-sale";
import { ensurePresaleAutoRelease } from "@/lib/commerce/ensure-presale-release";
import { cmToMetersLabel, parseVenuePlanObjects, planSeatCapacity } from "@/lib/saalplan/types";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { eventUsesTourCover } from "@/lib/commerce/tour-cover-sync";
import { formatDeDateTime } from "@/lib/datetime-de";
import { isPlanBackedTicketCategory } from "@/lib/seating/sync-category-capacity";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { ensureSepaPaymentSchema } from "@/lib/commerce/ensure-sepa-schema";
import { ensureEventPricingSchema } from "@/lib/commerce/ensure-event-pricing-schema";
import { ensureSaleClosedEarlyColumn } from "@/lib/commerce/ensure-sale-closed-early";
import { ensureScheduleChangedAtColumn } from "@/lib/commerce/ensure-schedule-changed";
import type { EventCategoryRow } from "@/components/admin/event-categories-panel";
import { expireAndReconcileHolds } from "@/lib/commerce/cart";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

function EventLoadError({ message }: { message?: string }) {
  return (
    <div className="tf-card space-y-3 !p-6">
      <h1 className="text-2xl font-semibold text-[var(--tf-navy)]">Event konnte nicht geladen werden</h1>
      <p className="text-sm text-[var(--tf-text-secondary)]">
        {message ??
          "Die Eventdaten sind unvollständig oder die Datenbank ist noch nicht aktuell. Bitte kurz warten und erneut öffnen — oder den Entwurf im Assistenten speichern."}
      </p>
      <Link href="/admin/events" className="tf-btn tf-btn-secondary inline-flex !min-h-10 text-sm">
        ← Zurück zur Event-Liste
      </Link>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { name: true },
    });
    return { title: event?.name ? `${event.name} · Event` : "Event" };
  } catch {
    return { title: "Event" };
  }
}

export default async function AdminEventDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed = await userHasPermission(session.user.id, membership.organizationId, "events:read");
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung (events:read).</p>;

  const canWrite =
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    )) ||
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "tours:write",
    ));

  // Full Event scalars need SEPA + seating columns; list page uses a narrow select and
  // can look fine while detail 500s on schema drift (P2022 → Application error).
  await Promise.all([
    ensureSeatingAssignmentSchema(prisma),
    ensureSepaPaymentSchema(prisma),
    ensureEventPricingSchema(prisma),
    ensureSaleClosedEarlyColumn(),
    ensureScheduleChangedAtColumn(),
  ]);

  // Expire stale cart holds and repair negative „reserviert“ counters before we render.
  await expireAndReconcileHolds().catch((err) => {
    console.error("[admin/event] hold expire/reconcile failed", err);
  });

  let event;
  try {
    event = await prisma.event.findFirst({
      where: { id, organizationId: membership.organizationId },
      include: {
        // Never `location: true` — Decimal lat/lng breaks Client Component serialization.
        location: { select: { id: true, name: true, city: true } },
        tour: { select: { id: true, name: true, coverImageUrl: true } },
        venuePlan: { select: { id: true, name: true, locationId: true } },
        ticketCategories: {
          orderBy: { sortOrder: "asc" },
          include: { pools: true },
        },
        artists: {
          orderBy: { sortOrder: "asc" },
          include: {
            artist: {
              select: {
                id: true,
                name: true,
                homepage: true,
                youtube: true,
                shortBio: true,
                profileImageUrl: true,
                headerImageUrl: true,
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("[admin/events/[id]] event load failed", id, err);
    return (
      <EventLoadError message="Die Eventdaten konnten nicht aus der Datenbank gelesen werden. Oft hilft ein erneuter Versuch in ein paar Sekunden." />
    );
  }
  if (!event) notFound();

  const released = await ensurePresaleAutoRelease({
    id: event.id,
    organizationId: event.organizationId,
    status: event.status,
    presaleStartsAt: event.presaleStartsAt,
  });
  if (released.flipped) event.status = released.status;

  const displayStatus = effectiveEventStatus(event);
  const categoriesCreateLocked = !(await canCreateEventCategories(event.id));

  // Plain props only — never pass the raw Prisma graph into Client Components.
  const editEvent = {
    id: event.id,
    name: event.name,
    subtitle: event.subtitle,
    slug: event.slug,
    status: event.status,
    tourId: event.tourId,
    shortDescription: event.shortDescription,
    description: event.description,
    showRemainingAvailability: event.showRemainingAvailability,
    locationId: event.locationId,
    venuePlanId: event.venuePlanId,
    seatingBookingMode: event.seatingBookingMode,
    eventStartsAt: event.eventStartsAt,
    eventEndsAt: event.eventEndsAt,
    doorsOpenAt: event.doorsOpenAt,
    presaleStartsAt: event.presaleStartsAt,
    ticketTaxRateBasisPoints: event.ticketTaxRateBasisPoints,
    administrationFeeTaxMode: event.administrationFeeTaxMode,
    administrationFeeCustomTaxRateBasisPoints: event.administrationFeeCustomTaxRateBasisPoints,
    sepaMinDaysBeforeEvent: event.sepaMinDaysBeforeEvent,
    coverImageUrl: event.coverImageUrl,
    scheduleChangedAt: event.scheduleChangedAt,
    seatOptPreferContiguous: event.seatOptPreferContiguous,
    seatOptPreventNewSingletons: event.seatOptPreventNewSingletons,
    seatOptIntelligentRemnants: event.seatOptIntelligentRemnants,
    seatOptGapRelaxOccupancyPercent: event.seatOptGapRelaxOccupancyPercent,
  };

  const seatingCategoriesRows: EventCategoryRow[] = event.ticketCategories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    priceGrossCents: c.priceGrossCents,
    capacity: c.capacity,
    maxPerOrder: c.maxPerOrder,
    categoryKind: c.categoryKind,
    companionFree: c.companionFree,
    color: c.color,
    freeSeating: c.freeSeating,
    pools: c.pools.map((p) => ({
      channel: p.channel,
      soldQuantity: p.soldQuantity,
      heldQuantity: Math.max(0, p.heldQuantity),
      capacity: p.capacity,
    })),
  }));

  let report;
  let locations;
  let venuePlans;
  let tours;
  let orgArtists;
  try {
    [report, locations, venuePlans, tours, orgArtists] = await Promise.all([
      getEventSalesReport(event.id),
      prisma.location.findMany({
        where: { organizationId: membership.organizationId },
        select: { id: true, name: true, city: true },
        orderBy: { name: "asc" },
      }),
      prisma.venuePlan.findMany({
        where: { organizationId: membership.organizationId },
        select: {
          id: true,
          name: true,
          locationId: true,
          widthCm: true,
          depthCm: true,
          objects: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.tour.findMany({
        where: { organizationId: membership.organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.artist.findMany({
        where: { organizationId: membership.organizationId },
        select: {
          id: true,
          name: true,
          homepage: true,
          youtube: true,
          shortBio: true,
          profileImageUrl: true,
          headerImageUrl: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);
  } catch (err) {
    console.error("[admin/events/[id]] related data load failed", id, err);
    return (
      <EventLoadError message="Zusätzliche Eventdaten konnten nicht geladen werden. Bitte erneut versuchen." />
    );
  }

  const displayCover = resolveEventCoverUrl(event);
  const usesTourCover = eventUsesTourCover({
    coverImageUrl: event.coverImageUrl,
    tourCoverUrl: event.tour?.coverImageUrl,
  });
  const ownCover = Boolean(event.coverImageUrl?.trim()) && !usesTourCover;

  const planOptions = venuePlans.map((p) => ({
    id: p.id,
    name: p.name,
    locationId: p.locationId,
    seatCapacity: planSeatCapacity(parseVenuePlanObjects(p.objects)),
    sizeLabel: `${cmToMetersLabel(p.widthCm)} × ${cmToMetersLabel(p.depthCm)}`,
  }));

  const seatingEnabled =
    Boolean(event.venuePlanId) && event.seatingBookingMode !== "none";
  const seatingCategories = event.ticketCategories.filter((c) =>
    isPlanBackedTicketCategory({
      freeSeating: c.freeSeating,
      categoryKind: c.categoryKind,
      seatingEnabled: true,
    }),
  );
  let unassignedSeatCount = 0;
  if (seatingEnabled) {
    try {
      unassignedSeatCount = await prisma.eventSeat.count({
        where: { eventId: event.id, categoryId: null },
      });
    } catch (err) {
      console.error("[admin/events/[id]] seat count failed", event.id, err);
    }
  }
  const needsSeatAssignment = seatingEnabled && unassignedSeatCount > 0;

  const when = event.eventStartsAt
    ? formatDeDateTime(event.eventStartsAt, {
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  let ticketsSold = report.sold;
  try {
    ticketsSold = await prisma.ticket.count({ where: { eventId: event.id } });
  } catch (err) {
    console.error("[admin/events/[id]] ticket count failed", event.id, err);
  }

  return (
    <UnassignedSeatsProvider initialCount={seatingEnabled ? unassignedSeatCount : 0}>
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Events
        </Link>
        <div className="mt-3">
          <EventAdminHeaderActions
            canWrite={canWrite}
            ticketsSold={ticketsSold}
            statusLabel={eventStatusLabel(displayStatus)}
            event={{
              id: event.id,
              name: event.name,
              slug: event.slug,
              status: displayStatus,
              locationName: event.location?.name ?? null,
              locationCity: event.location?.city ?? null,
              whenLabel: when ?? "Termin offen",
              saleClosedEarly: Boolean(event.saleClosedEarly),
            }}
            meta={
              <div className="mt-1 space-y-0.5 text-sm text-[var(--tf-text-secondary)]">
                <p>{when ?? "Termin offen"}</p>
                {event.location ? (
                  <p>
                    {event.location.name}
                    {event.location.city ? `, ${event.location.city}` : ""}
                  </p>
                ) : null}
                {event.tour ? (
                  <p>
                    Tour:{" "}
                    <Link
                      href={`/admin/tours/${event.tour.id}`}
                      className="font-medium text-[var(--tf-navy)] underline"
                    >
                      {event.tour.name}
                    </Link>
                  </p>
                ) : null}
              </div>
            }
          />
        </div>
        {saved ? (
          <p className="mt-3 rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
            {needsSeatAssignment
              ? "Event gespeichert — als Nächstes Plätze den Ticketkategorien zuordnen."
              : "Änderungen gespeichert."}
          </p>
        ) : null}
        {seatingEnabled ? (
          <UnassignedSeatsBanner seatingCategoriesCount={seatingCategories.length} />
        ) : null}
      </div>

      {/* Cover preview + edit at top */}
      <section className="tf-card !p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Cover-Bild</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            {event.tour
              ? ownCover
                ? "Eigenes Termin-Cover (Tour-Plakat überschrieben)."
                : "Tour-Plakat aktiv — gilt für diesen Termin, bis du ein eigenes hochlädst."
              : "Links das aktuelle Cover — rechts kannst du ein neues Bild hochladen."}
          </p>
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr] lg:items-start">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
              Aktuell {ownCover ? "(Termin)" : event.tour?.coverImageUrl ? "(Tour-Plakat)" : ""}
            </p>
            <div className="relative aspect-square w-full max-w-[240px] overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.04)]">
              {displayCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayCover}
                  alt={`Cover ${event.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--tf-text-secondary)]">
                  Noch kein Cover hinterlegt
                </div>
              )}
            </div>
          </div>
          {canWrite ? (
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                Cover festlegen
              </p>
              <CoverImageField
                name="coverImageUrl"
                initialUrl={ownCover ? event.coverImageUrl : null}
                eventId={event.id}
                inheritUrl={event.tour?.coverImageUrl}
                inheritLabel="Tour-Plakat"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="tf-card !p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Tickets verkauft
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {report.sold}
            <span className="text-base font-normal text-[var(--tf-text-secondary)]">
              {" "}
              / {report.capacity}
            </span>
          </p>
          <div className="mt-3">
            <TicketProgressBar sold={report.sold} capacity={report.capacity} />
          </div>
        </div>
        <div className="tf-card !p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Umsatz
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {formatEuroFromCents(report.revenueCents)}
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">Tickets brutto</p>
        </div>
        <div className="tf-card !p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Online-Shop
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {report.onlineSold}
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">verkaufte Tickets</p>
        </div>
        <div className="tf-card !p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Tageskasse
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {report.boxOfficeSold}
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">verkaufte Tickets</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tf-card !p-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Verkaufsanteil</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Was vom Gesamtkontingent bereits verkauft bzw. noch frei ist.
          </p>
          <div className="mt-4">
            <SalesPieChart
              slices={report.pie}
              centerLabel={`${report.sold}`}
              centerSub={`von ${report.capacity}`}
            />
          </div>
        </section>
        <section className="tf-card relative z-10 !overflow-visible !p-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Verlauf seit Verkaufsstart</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Kumulierte Ticketverkäufe über die Zeit.
          </p>
          <div className="relative z-20 mt-4 overflow-visible">
            <SalesTimelineChart points={report.timeline} />
          </div>
        </section>
      </div>

      {/* Category table */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Verkauf nach Kategorie</h2>
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Kontingent, Shop, Tageskasse und Umsatz je Ticketkategorie.
          </p>
        </div>
        <CategorySalesTable rows={report.categories} />
      </section>

      {/* Event data / edit — before categories to create */}
      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Eventdaten</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Stammdaten bearbeiten — Speichern aktualisiert Website und Kasse.
        </p>

        {canWrite ? (
          <EventEditForm
            event={editEvent}
            locations={locations}
            planOptions={planOptions}
            venuePlan={event.venuePlan}
            tours={tours}
            ticketsSold={ticketsSold}
          />
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Status</dt>
              <dd className="font-medium">{eventStatusLabel(displayStatus)}</dd>
            </div>
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Link-Name</dt>
              <dd className="font-medium">{event.slug}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--tf-text-secondary)]">Kurzbeschreibung</dt>
              <dd className="font-medium">{event.shortDescription ?? "—"}</dd>
            </div>
          </dl>
        )}
      </section>

      <section id="lineup" className="tf-card !p-5 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Line-up / Künstler</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Wer tritt auf? Namen reichen — Profile ergänzt du hier oder unter Künstler.
        </p>
        {canWrite ? (
          <EventLineupForm
            eventId={event.id}
            library={orgArtists}
            initialLineup={event.artists.map((link) => ({
              key: link.id,
              id: link.artist.id,
              name: link.artist.name,
              homepage: link.artist.homepage ?? "",
              youtube: link.artist.youtube ?? "",
              bio: link.artist.shortBio ?? "",
              profileImageUrl: link.artist.profileImageUrl ?? "",
              headerImageUrl: link.artist.headerImageUrl ?? "",
              detailsOpen: false,
            }))}
          />
        ) : (
          <ul className="mt-4 space-y-1 text-sm">
            {event.artists.length === 0 ? (
              <li className="text-[var(--tf-text-secondary)]">Noch kein Line-up.</li>
            ) : (
              event.artists.map((link) => (
                <li key={link.id} className="font-medium text-[var(--tf-navy)]">
                  {link.artist.name}
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <EventSeatingSetup
        eventId={event.id}
        initialCategories={seatingCategoriesRows}
        canWrite={canWrite}
        categoriesCreateLocked={categoriesCreateLocked}
        seatingEnabled={seatingEnabled}
      />

      <EventDiscountsPanel eventId={event.id} canWrite={canWrite} />

      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Auf meine Website</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Ticketverkauf direkt auf deiner Seite — Code kopieren und einbinden.
        </p>
        <div className="mt-4">
          <EmbedCodeModalButton
            buttonLabel="Einbettungs-Code anzeigen"
            title="Auf meine Website einbinden"
            description="Nur Tickets für dieses Event. Code kopieren und auf der Event-Unterseite einbinden."
            slug={event.slug}
            eventTitle={event.name}
          />
        </div>
      </section>
    </div>
    </UnassignedSeatsProvider>
  );
}
