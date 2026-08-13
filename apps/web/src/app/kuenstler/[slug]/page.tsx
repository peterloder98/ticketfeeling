import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ExternalLink, Globe } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";
import { ArtistYoutubeEmbed } from "@/components/artist-youtube-embed";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { formatEventTitleWithCity } from "@/lib/commerce/location-display";
import { formatDeDateTime } from "@/lib/datetime-de";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ event?: string }>;
};

/** Only allow simple public event slugs — no open redirects. */
function safeEventSlug(raw: string | undefined): string | null {
  if (!raw) return null;
  const slug = raw.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return null;
  return slug;
}

const UPCOMING_STATUSES = ["announcement", "published", "presale_active", "planned"];

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const artist = await prisma.artist.findFirst({ where: { slug } });
  return { title: artist?.name ?? "Künstler" };
}

export default async function ArtistPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const artist = await prisma.artist.findFirst({
    where: { slug, visibility: "published" },
    include: {
      eventLinks: {
        where: { cancelled: false },
        include: {
          event: {
            include: {
              location: { select: { city: true, name: true } },
              tour: { select: { coverImageUrl: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      tourLinks: {
        where: { cancelled: false },
        include: {
          tour: {
            include: {
              events: {
                where: { artistsUseTourDefaults: true },
                include: {
                  location: { select: { city: true, name: true } },
                  tour: { select: { coverImageUrl: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!artist) notFound();

  type LinkedEvent = (typeof artist.eventLinks)[number]["event"];
  const eventsById = new Map<string, LinkedEvent>();
  for (const link of artist.eventLinks) {
    eventsById.set(link.event.id, link.event);
  }
  for (const link of artist.tourLinks) {
    for (const event of link.tour.events) {
      if (!eventsById.has(event.id)) {
        eventsById.set(event.id, event);
      }
    }
  }

  const fromEventSlug = safeEventSlug(sp.event);
  const backEvent =
    fromEventSlug &&
    [...eventsById.values()].find((event) => event.slug === fromEventSlug);

  const homepage =
    artist.homepage && /^https?:\/\//i.test(artist.homepage) ? artist.homepage : null;
  const homepageLabel = homepage
    ? /instagram\.com/i.test(homepage)
      ? "Instagram"
      : /facebook\.com/i.test(homepage)
        ? "Facebook"
        : "Offizielle Website"
    : null;

  const upcoming = [...eventsById.values()]
    .filter((event) => UPCOMING_STATUSES.includes(event.status))
    .sort((a, b) => {
      const at = a.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--tf-navy)] text-white">
        {artist.headerImageUrl || artist.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.headerImageUrl || artist.profileImageUrl || ""}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        ) : null}
        <div className="tf-container relative grid gap-8 py-14 md:grid-cols-[200px_1fr] md:items-end md:py-16">
          <div className="overflow-hidden rounded-[20px] bg-white/10 shadow-[var(--tf-shadow)]">
            <ResponsiveImage
              src={artist.profileImageUrl}
              alt={artist.name}
              className="aspect-square h-full w-full"
              fallback="person"
              initials={artist.name}
            />
          </div>
          <div>
            {backEvent ? (
              <Link
                href={`/event/${backEvent.slug}`}
                className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:border-[var(--tf-teal)] hover:bg-white/15"
              >
                ← Zurück zum Event
                <span className="hidden text-white/70 sm:inline">· {backEvent.name}</span>
              </Link>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tf-teal)]">
              {artist.genre ?? artist.artistType}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">{artist.name}</h1>
            <p className="mt-3 max-w-2xl text-lg text-white/80">{artist.shortBio}</p>
            {homepage ? (
              <div className="mt-5">
                <a
                  href={homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="tf-btn tf-btn-primary !min-h-11 inline-flex"
                >
                  <Globe className="h-4 w-4" strokeWidth={2} />
                  {homepageLabel}
                  <ExternalLink className="h-4 w-4" strokeWidth={2} />
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="tf-container py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <div className="tf-card">
            <h2 className="tf-display text-2xl">Biografie</h2>
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-[var(--tf-text-secondary)]">
              {artist.biography}
            </p>
          </div>
          <ArtistYoutubeEmbed youtube={artist.youtube} artistName={artist.name} compact />
        </div>

        <section className="mt-12">
          <h2 className="tf-display text-2xl">Nächste Events</h2>
          {upcoming.length > 0 ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {upcoming.map((event) => {
                const coverUrl = resolveEventCoverUrl(event);
                return (
                  <li key={event.id}>
                    <Link
                      href={`/event/${event.slug}`}
                      className="tf-card tf-card-hover flex h-full overflow-hidden !p-0"
                    >
                      <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[var(--tf-navy)] sm:h-20 sm:w-20">
                          <ResponsiveImage
                            src={coverUrl}
                            alt=""
                            className="h-full w-full"
                            fallback="event"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--tf-navy)]">
                            {formatEventTitleWithCity(event.name, event.location)}
                          </p>
                          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                            {event.eventStartsAt
                              ? formatDeDateTime(event.eventStartsAt)
                              : "Termin folgt"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-[var(--tf-text-secondary)]">
              Aktuell keine Termine verknüpft.{" "}
              <Link href="/events" className="font-medium text-[var(--tf-teal-hover)] underline">
                Alle Events ansehen
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
