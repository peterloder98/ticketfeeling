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
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id }, select: { name: true } });
  return { title: tour?.name ? `${tour.name} · Tour` : "Tour" };
}

export default async function AdminTourDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;

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
      events: {
        orderBy: { eventStartsAt: "asc" },
        include: { location: { select: { name: true, city: true } } },
      },
    },
  });
  if (!tour) notFound();

  const dateValue = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : "";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tours"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Touren
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {tour.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Tour-Plakat für alle Termine — optional pro Termin überschreiben.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />

      {saved ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Gespeichert.
        </p>
      ) : null}

      {canWrite ? (
        <form action={updateTourAction} className="tf-card space-y-4">
          <input type="hidden" name="tourId" value={tour.id} />
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Tour bearbeiten</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Name</span>
              <input name="name" required className="tf-input" defaultValue={tour.name} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Link-Name</span>
              <input name="slug" required className="tf-input" defaultValue={tour.slug} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sichtbarkeit</span>
              <select name="visibility" className="tf-input" defaultValue={tour.visibility}>
                <option value="draft">Entwurf</option>
                <option value="published">Veröffentlicht</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Tour-Start</span>
              <input
                type="date"
                name="startsOn"
                className="tf-input"
                defaultValue={dateValue(tour.startsOn)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Tour-Ende</span>
              <input
                type="date"
                name="endsOn"
                className="tf-input"
                defaultValue={dateValue(tour.endsOn)}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Beschreibung</span>
              <textarea
                name="description"
                rows={3}
                className="tf-input"
                defaultValue={tour.description ?? ""}
              />
            </label>
          </div>
          <CoverImageField
            name="coverImageUrl"
            initialUrl={tour.coverImageUrl}
            tourId={tour.id}
          />
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Termine ohne eigenes Cover zeigen dieses Tour-Plakat.
          </p>
          <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
            Speichern
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Termine</h2>
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
          const ownCover = Boolean(event.coverImageUrl?.trim());
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
                <div className="h-14 w-14 rounded-xl bg-[var(--tf-navy)]" />
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
                  Cover: {ownCover ? "eigenes Termin-Cover" : "Tour-Plakat"}
                </p>
              </div>
              <span className="text-xs text-[var(--tf-text-secondary)]">
                {eventStatusLabel(event.status)}
              </span>
            </Link>
          );
        })}
        {tour.events.length === 0 ? (
          <p className="rounded-2xl border border-[var(--tf-line)] bg-white px-4 py-8 text-sm text-[var(--tf-text-secondary)]">
            Noch keine Termine — „Termin hinzufügen“ öffnet die Event-Anlage mit dieser Tour.
          </p>
        ) : null}
      </section>
    </div>
  );
}
