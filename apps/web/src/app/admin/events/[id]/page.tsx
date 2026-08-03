import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getEventSalesReport } from "@/lib/commerce/event-sales-report";
import { formatEuroFromCents } from "@/lib/money";
import { ADMIN_SUBNAV, eventStatusLabel } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  CategorySalesTable,
  TicketProgressBar,
} from "@/components/admin/category-sales-table";
import { SalesPieChart, SalesTimelineChart } from "@/components/admin/sales-charts";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { EventCategoriesPanel } from "@/components/admin/event-categories-panel";
import { EventSeatingAssignmentPanel } from "@/components/admin/event-seating-assignment-panel";
import { EventEditForm } from "@/components/admin/event-edit-form";
import { EmbedCodeModalButton } from "@/components/admin/embed-code-modal";
import { isEventSalesReleased } from "@/lib/commerce/event-sale";
import { cmToMetersLabel, parseVenuePlanObjects, planSeatCapacity } from "@/lib/saalplan/types";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { eventUsesTourCover } from "@/lib/commerce/tour-cover-sync";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: event?.name ? `${event.name} · Event` : "Event" };
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

  // Event include selects seatingLayoutConfig; seat count filters category_id.
  await ensureSeatingAssignmentSchema(prisma);

  const event = await prisma.event.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
      location: true,
      tour: { select: { id: true, name: true, coverImageUrl: true } },
      venuePlan: { select: { id: true, name: true, locationId: true } },
      ticketCategories: {
        orderBy: { sortOrder: "asc" },
        include: { pools: true },
      },
    },
  });
  if (!event) notFound();

  const [report, locations, venuePlans, templates, tours] = await Promise.all([
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
    typeof prisma.ticketCategoryTemplate?.findMany === "function"
      ? prisma.ticketCategoryTemplate.findMany({
          where: { organizationId: membership.organizationId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, priceGrossCents: true, capacity: true },
        })
      : Promise.resolve([]),
    prisma.tour.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
  const seatingCategories = event.ticketCategories.filter(
    (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
  );
  const unassignedSeatCount = seatingEnabled
    ? await prisma.eventSeat.count({
        where: { eventId: event.id, categoryId: null },
      })
    : 0;
  const needsSeatAssignment = seatingEnabled && unassignedSeatCount > 0;

  const when = event.eventStartsAt
    ? event.eventStartsAt.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Events
        </Link>
        <div className="mt-3 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
                {event.name}
              </h1>
              <span className="rounded-full bg-[rgba(15,39,71,0.06)] px-2.5 py-0.5 text-xs font-medium text-[var(--tf-navy)]">
                {eventStatusLabel(event.status)}
              </span>
            </div>
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
          </div>
          <AdminSubnav items={ADMIN_SUBNAV.tours} />
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/event/${event.slug}`}
              className="tf-btn tf-btn-secondary !min-h-10 text-sm"
              target="_blank"
            >
              Öffentliche Seite
            </Link>
            <EmbedCodeModalButton
              buttonLabel="Auf meine Website"
              title="Auf meine Website einbinden"
              description="Nur Tickets für dieses Event. Code kopieren und auf der Event-Unterseite einbinden."
              slug={event.slug}
              eventTitle={event.name}
            />
            <Link href="/admin/catalog" className="tf-btn tf-btn-secondary !min-h-10 text-sm">
              Kategorie-Vorlagen
            </Link>
            <Link
              href={`/kasse?eventId=${event.id}#verkaeufe`}
              className="tf-btn tf-btn-secondary !min-h-10 text-sm"
            >
              Tageskasse
            </Link>
          </div>
        </div>
        {saved ? (
          <p className="mt-3 rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
            {needsSeatAssignment
              ? "Event gespeichert — als Nächstes Plätze den Ticketkategorien zuordnen."
              : "Änderungen gespeichert."}
          </p>
        ) : null}
        {needsSeatAssignment ? (
          <div className="mt-3 rounded-xl border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.12)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--tf-navy)]">
              Nächster Schritt: Saalplan zuordnen
            </p>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              {unassignedSeatCount} Plätze ohne Kategorie — weiter unten unter „Saalplan-Zuordnung“
              {seatingCategories.length === 1
                ? `. Mit einer Kategorie wird der ganze Plan automatisch zugewiesen.`
                : ". Kategorie wählen und Block antippen."}
            </p>
            <a href="#zuordnung" className="tf-btn tf-btn-primary mt-3 inline-flex !min-h-10 text-sm">
              Jetzt zuordnen
            </a>
          </div>
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

      <EventCategoriesPanel
        eventId={event.id}
        categories={event.ticketCategories}
        templates={templates}
        canWrite={canWrite}
        salesReleased={isEventSalesReleased(event.status)}
      />

      <EventSeatingAssignmentPanel eventId={event.id} canWrite={canWrite} />

      {/* Event data / edit */}
      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Eventdaten</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Stammdaten bearbeiten — Speichern aktualisiert Website und Kasse.
        </p>

        {canWrite ? (
          <EventEditForm
            event={event}
            locations={locations}
            planOptions={planOptions}
            venuePlan={event.venuePlan}
            tours={tours}
          />
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Status</dt>
              <dd className="font-medium">{eventStatusLabel(event.status)}</dd>
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
  );
}
