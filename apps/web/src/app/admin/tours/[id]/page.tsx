import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV, eventStatusLabel } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { updateTourAction } from "@/app/admin/tours/actions";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { SmartDateInput } from "@/components/admin/smart-date-input";
import { TourLineupForm } from "@/components/admin/tour-lineup-form";
import { EventDiscountsPanel } from "@/components/admin/event-discounts-panel";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { eventInheritsTourArtists } from "@/lib/commerce/effective-event-artists";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; neu?: string; termin?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id }, select: { name: true } });
  return { title: tour?.name ? `${tour.name} · Tour` : "Tour" };
}

export default async function AdminTourDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved, neu, termin } = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead =
    (await userHasPermission(session.user.id, membership.organizationId, "tours:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read"));
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "tours:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));

  const tour = await prisma.tour.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
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
      events: {
        orderBy: { eventStartsAt: "asc" },
        include: {
          location: { select: { name: true, city: true } },
          ticketCategories: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, priceGrossCents: true },
          },
        },
      },
    },
  });
  if (!tour) notFound();

  const orgArtists = await prisma.artist.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      homepage: true,
      youtube: true,
      shortBio: true,
      profileImageUrl: true,
      headerImageUrl: true,
    },
  });

  const dateValue = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const hasCover = Boolean(tour.coverImageUrl?.trim());
  const tourLineup = tour.artists.map((link) => ({
    key: link.id,
    id: link.artist.id,
    name: link.artist.name,
    homepage: link.artist.homepage ?? "",
    youtube: link.artist.youtube ?? "",
    bio: link.artist.shortBio ?? "",
    profileImageUrl: link.artist.profileImageUrl ?? "",
    headerImageUrl: link.artist.headerImageUrl ?? "",
    detailsOpen: false,
  }));

  const primaryTourEvent =
    tour.events.find((e) => e.ticketCategories.length > 0) ?? tour.events[0] ?? null;
  const tourDiscountSiblings = primaryTourEvent
    ? tour.events
        .filter((e) => e.id !== primaryTourEvent.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          eventStartsAt: s.eventStartsAt?.toISOString() ?? null,
          locationName: s.location?.name ?? null,
          city: s.location?.city ?? null,
        }))
    : [];
  const tourDiscountCategories =
    primaryTourEvent?.ticketCategories.map((c) => ({
      id: c.id,
      name: c.name,
      priceGrossCents: c.priceGrossCents,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tours"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Touren
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          Tour-Projekt
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {tour.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Zentrale Daten & Tour-Plakat — darunter die Einzeltermine.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.tours} />

      {neu ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Tour angelegt. Als Nächstes Tour-Plakat setzen (falls noch nicht), dann Termine
          hinzufügen.
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Tour gespeichert — Tour-Plakat wurde auf alle Termine ohne eigenes Cover übernommen.
        </p>
      ) : null}
      {termin ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Termin angelegt — Cover ist das Tour-Plakat (außer du setzt ein eigenes).
        </p>
      ) : null}

      {!hasCover ? (
        <p className="rounded-xl border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.1)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Noch kein Tour-Plakat — ohne Cover bleibt die Startseite leer / mit Platzhalter.
        </p>
      ) : null}

      {canWrite ? (
        <form action={updateTourAction} className="tf-card space-y-4">
          <input type="hidden" name="tourId" value={tour.id} />
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">1. Tour-Stammdaten & Plakat</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Name</span>
              <input name="name" required className="tf-input" defaultValue={tour.name} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Link-Name</span>
              <input name="slug" required className="tf-input" defaultValue={tour.slug} />
              <span className="text-xs text-[var(--tf-text-secondary)]">
                Öffentlich: /tour/{tour.slug}
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sichtbarkeit</span>
              <select name="visibility" className="tf-input" defaultValue={tour.visibility}>
                <option value="draft">Entwurf</option>
                <option value="published">Veröffentlicht</option>
              </select>
            </label>
            <SmartDateInput
              name="startsOn"
              label="Tour-Start"
              defaultValue={dateValue(tour.startsOn)}
            />
            <SmartDateInput
              name="endsOn"
              label="Tour-Ende"
              defaultValue={dateValue(tour.endsOn)}
            />
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Kurzbeschreibung</span>
              <textarea
                name="shortDescription"
                rows={2}
                className="tf-input"
                defaultValue={tour.shortDescription ?? ""}
                placeholder="Kurzer Text für Eventseiten — Termine übernehmen ihn standardmäßig."
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Beschreibung</span>
              <textarea
                name="description"
                rows={4}
                className="tf-input"
                defaultValue={tour.description ?? ""}
                placeholder="Längerer Text — Termine übernehmen ihn standardmäßig."
              />
            </label>
          </div>

          <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[var(--tf-navy)]">Tour-Plakat (zentral)</p>
            <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
              Gilt für Startseite, Tour-Seite und alle Termine — solange ein Termin kein eigenes
              Cover hat.
            </p>
            <div className="mt-3">
              <CoverImageField
                name="coverImageUrl"
                initialUrl={tour.coverImageUrl}
                tourId={tour.id}
              />
            </div>
          </div>

          <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
            Tour speichern
          </button>
        </form>
      ) : null}

      <section className="tf-card space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">1b. Tour-Line-up</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Zentrale Künstler für alle Termine. Einzeltermine können bei Bedarf abweichen.
          </p>
        </div>
        {canWrite ? (
          <TourLineupForm
            tourId={tour.id}
            library={orgArtists}
            initialLineup={tourLineup}
          />
        ) : (
          <ul className="space-y-1 text-sm">
            {tour.artists.length === 0 ? (
              <li className="text-[var(--tf-text-secondary)]">Noch kein Line-up.</li>
            ) : (
              tour.artists.map((link) => (
                <li key={link.id} className="font-medium text-[var(--tf-navy)]">
                  {link.artist.name}
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">2. Einzeltermine</h2>
            <p className="text-sm text-[var(--tf-text-secondary)]">
              Jeder Termin = Ort + Datum. Cover und Line-up standardmäßig von der Tour.
              Sichtbarkeit und Verkauf steuerst du pro Termin über den Status (z. B. Entwurf
              bleibt privat, auch wenn die Tour schon öffentlich ist).
            </p>
          </div>
          {canWrite ? (
            <Link
              href={`/admin/events/neu?tourId=${tour.id}`}
              className="tf-btn tf-btn-primary !py-2 text-sm"
            >
              Termin hinzufügen
            </Link>
          ) : null}
        </div>

        {tour.events.map((event) => {
          const cover = resolveEventCoverUrl({
            coverImageUrl: event.coverImageUrl,
            tour,
          });
          const usesTour =
            Boolean(tour.coverImageUrl?.trim()) &&
            (!event.coverImageUrl?.trim() || event.coverImageUrl === tour.coverImageUrl);
          return (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="tf-card flex flex-wrap items-center gap-3 transition hover:border-[var(--tf-teal)]"
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--tf-navy)] text-[9px] font-semibold text-white/70">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--tf-navy)]">
                  {event.subtitle || event.name}
                </p>
                <p className="text-sm text-[var(--tf-text-secondary)]">
                  {event.eventStartsAt
                    ? event.eventStartsAt.toLocaleString("de-DE", {
                        timeZone: "Europe/Berlin",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Termin offen"}
                  {event.location
                    ? ` · ${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                  Cover: {usesTour ? "Tour-Plakat" : event.coverImageUrl ? "eigenes Termin-Cover" : "fehlt"}
                  {" · "}
                  Line-up:{" "}
                  {eventInheritsTourArtists(event) ? "Tour" : "eigenes Termin-Line-up"}
                </p>
              </div>
              <span className="text-xs text-[var(--tf-text-secondary)]">
                {eventStatusLabel(event.status)}
              </span>
            </Link>
          );
        })}
        {tour.events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--tf-line)] bg-white px-4 py-8 text-sm text-[var(--tf-text-secondary)]">
            Noch keine Termine. „Termin hinzufügen“ öffnet die Event-Anlage bereits verknüpft mit
            dieser Tour.
          </p>
        ) : null}
      </section>

      {primaryTourEvent ? (
        <EventDiscountsPanel
          eventId={primaryTourEvent.id}
          canWrite={canWrite}
          eventEndsAt={
            primaryTourEvent.eventEndsAt?.toISOString() ??
            primaryTourEvent.eventStartsAt?.toISOString() ??
            null
          }
          tourId={tour.id}
          initialCategories={tourDiscountCategories}
          initialTourSiblings={tourDiscountSiblings}
          defaultSelectAllTour
          heading="Preisaktionen für die Tour"
        />
      ) : null}
    </div>
  );
}
