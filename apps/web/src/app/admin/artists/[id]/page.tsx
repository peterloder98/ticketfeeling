import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { ARTIST_TYPES } from "@/lib/admin/artist-form";
import { deleteArtistAction, updateArtistAction } from "@/app/admin/artists/actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    neu?: string;
    deleteError?: string;
    count?: string;
  }>;
};

const ARTIST_TYPE_LABELS: Record<(typeof ARTIST_TYPES)[number], string> = {
  solo: "Solo",
  band: "Band",
  duo: "Duo",
  ensemble: "Ensemble",
  other: "Sonstiges",
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const artist = await prisma.artist.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: artist?.name ? `${artist.name} · Künstler` : "Künstler" };
}

export default async function AdminArtistDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved, neu, deleteError, count } = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "artists:read",
  );
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "artists:write",
  );

  const artist = await prisma.artist.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
      eventLinks: {
        include: { event: { select: { id: true, name: true, slug: true, eventStartsAt: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!artist) notFound();

  const linkedCount = artist.eventLinks.length;
  const deleteErrorMessage =
    deleteError === "name"
      ? "Bitte den exakten Künstlernamen zur Bestätigung eingeben."
      : deleteError === "in_use"
        ? `Dieser Künstler hängt noch an ${count ?? linkedCount} Event${
            Number(count ?? linkedCount) === 1 ? "" : "s"
          }. Hake unten die Bestätigung an, dann wird er aus den Line-ups entfernt und gelöscht.`
        : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/artists"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Künstler
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {artist.name}
        </h1>
        <AdminSubnav items={ADMIN_SUBNAV.katalog} />
        {neu || saved ? (
          <p className="mt-3 rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
            {neu ? "Geschafft — Künstler ist angelegt." : "Änderungen gespeichert."}
          </p>
        ) : null}
        {deleteErrorMessage ? (
          <p className="mt-3 rounded-xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-sm text-[var(--danger)]">
            {deleteErrorMessage}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <form action={updateArtistAction} className="tf-card space-y-5">
          <input type="hidden" name="artistId" value={artist.id} />
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Profil bearbeiten</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Name</span>
              <input name="name" required className="tf-input" defaultValue={artist.name} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Rechtlicher Name</span>
              <input
                name="legalName"
                className="tf-input"
                defaultValue={artist.legalName ?? ""}
                placeholder="optional"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Art</span>
              <select name="artistType" className="tf-input" defaultValue={artist.artistType}>
                {ARTIST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ARTIST_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Genre</span>
              <input
                name="genre"
                className="tf-input"
                defaultValue={artist.genre ?? ""}
                placeholder="z. B. Schlager"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Herkunft</span>
              <input
                name="origin"
                className="tf-input"
                defaultValue={artist.origin ?? ""}
                placeholder="z. B. München"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sichtbarkeit</span>
              <select name="visibility" className="tf-input" defaultValue={artist.visibility}>
                <option value="published">Veröffentlicht</option>
                <option value="draft">Entwurf</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Link-Name</span>
              <input name="slug" className="tf-input" defaultValue={artist.slug} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sortierung</span>
              <input
                name="sortOrder"
                type="number"
                min={0}
                step={1}
                className="tf-input"
                defaultValue={artist.sortOrder}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Kurzbio</span>
              <input
                name="shortBio"
                className="tf-input"
                defaultValue={artist.shortBio ?? ""}
                placeholder="Eine Zeile für Karten & Listen"
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Bio</span>
              <textarea
                name="biography"
                rows={5}
                className="tf-input"
                defaultValue={artist.biography ?? ""}
              />
            </label>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--tf-navy)]">Bilder</h3>
            <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
              Öffentliche Bild-URLs (https://…). Upload folgt später.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Profilbild-URL</span>
                <input
                  name="profileImageUrl"
                  className="tf-input"
                  defaultValue={artist.profileImageUrl ?? ""}
                  placeholder="https://…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Headerbild-URL</span>
                <input
                  name="headerImageUrl"
                  className="tf-input"
                  defaultValue={artist.headerImageUrl ?? ""}
                  placeholder="https://…"
                  inputMode="url"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--tf-navy)]">Links</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Homepage</span>
                <input
                  name="homepage"
                  className="tf-input"
                  defaultValue={artist.homepage ?? ""}
                  placeholder="https://…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">YouTube</span>
                <input
                  name="youtube"
                  className="tf-input"
                  defaultValue={artist.youtube ?? ""}
                  placeholder="https://youtube.com/watch?v=…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Instagram</span>
                <input
                  name="instagram"
                  className="tf-input"
                  defaultValue={artist.instagram ?? ""}
                  placeholder="https://instagram.com/…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Facebook</span>
                <input
                  name="facebook"
                  className="tf-input"
                  defaultValue={artist.facebook ?? ""}
                  placeholder="https://facebook.com/…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">TikTok</span>
                <input
                  name="tiktok"
                  className="tf-input"
                  defaultValue={artist.tiktok ?? ""}
                  placeholder="https://tiktok.com/@…"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">Spotify</span>
                <input
                  name="spotify"
                  className="tf-input"
                  defaultValue={artist.spotify ?? ""}
                  placeholder="https://open.spotify.com/…"
                  inputMode="url"
                />
              </label>
            </div>
          </div>

          <details className="rounded-xl border border-[var(--tf-line)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
              SEO (optional)
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">SEO-Titel</span>
                <input
                  name="seoTitle"
                  className="tf-input"
                  defaultValue={artist.seoTitle ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--tf-text-secondary)]">SEO-Beschreibung</span>
                <textarea
                  name="seoDescription"
                  rows={2}
                  className="tf-input"
                  defaultValue={artist.seoDescription ?? ""}
                />
              </label>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
              Speichern
            </button>
            {artist.visibility === "published" ? (
              <Link
                href={`/kuenstler/${artist.slug}`}
                className="tf-btn tf-btn-secondary !py-2 text-sm"
                target="_blank"
              >
                Öffentliche Seite
              </Link>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="tf-card text-sm text-[var(--tf-text-secondary)]">
          Nur Leserecht — zum Bearbeiten brauchst du artists:write.
        </div>
      )}

      <section className="tf-card space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Events</h2>
        {artist.eventLinks.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Noch keinem Event zugeordnet — im Event unter Line-up hinzufügen.
          </p>
        ) : (
          <ul className="space-y-2">
            {artist.eventLinks.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <Link
                    href={`/admin/events/${link.event.id}`}
                    className="font-medium text-[var(--tf-navy)] underline-offset-2 hover:underline"
                  >
                    {link.event.name}
                  </Link>
                  <p className="text-[var(--tf-text-secondary)]">
                    {link.event.eventStartsAt
                      ? link.event.eventStartsAt.toLocaleString("de-DE", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Termin offen"}
                  </p>
                </div>
                <Link
                  href={`/admin/events/${link.event.id}#lineup`}
                  className="tf-btn tf-btn-ghost !min-h-8 text-xs"
                >
                  Line-up
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite ? (
        <section className="tf-card space-y-4 border-[rgba(220,38,38,0.25)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--danger)]">Künstler löschen</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              {linkedCount === 0
                ? "Löscht das Profil endgültig. Das lässt sich nicht rückgängig machen."
                : `Dieser Künstler ist in ${linkedCount} Event${
                    linkedCount === 1 ? "" : "s"
                  } im Line-up. Beim Löschen wird er dort entfernt — die Events bleiben.`}
            </p>
          </div>
          <form action={deleteArtistAction} className="space-y-3">
            <input type="hidden" name="artistId" value={artist.id} />
            {linkedCount > 0 ? (
              <label className="flex items-start gap-2 text-sm text-[var(--tf-navy)]">
                <input
                  type="checkbox"
                  name="forceUnlink"
                  value="1"
                  className="mt-1"
                  required
                />
                <span>
                  Ja, aus allen Event-Line-ups entfernen und diesen Künstler löschen.
                </span>
              </label>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">
                Zur Bestätigung „{artist.name}“ eingeben
              </span>
              <input
                name="confirmName"
                required
                className="tf-input"
                autoComplete="off"
                placeholder={artist.name}
              />
            </label>
            <button
              type="submit"
              className="tf-btn !py-2 text-sm text-[var(--danger)] border-[rgba(220,38,38,0.35)]"
            >
              Endgültig löschen
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
