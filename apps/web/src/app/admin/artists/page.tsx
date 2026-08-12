import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { ARTIST_TYPES } from "@/lib/admin/artist-form";
import { createArtistAction } from "@/app/admin/artists/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Künstler" };

type Props = {
  searchParams: Promise<{ deleted?: string; unlinked?: string }>;
};

export default async function AdminArtistsPage({ searchParams }: Props) {
  const { deleted, unlinked } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "artists:read",
  );
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "artists:write",
  );

  const artists = await prisma.artist.findMany({
    where: { organizationId: membership.organizationId },
    include: { _count: { select: { eventLinks: true, tourLinks: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Künstler</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          Namen anlegen, Profile pflegen und später bei Events ins Line-up hängen. Du kannst auch nur
          den Namen speichern und Bio oder YouTube später nachziehen.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />

      {deleted ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Künstler gelöscht
          {unlinked && Number(unlinked) > 0
            ? ` — aus ${unlinked} Event-Line-up${Number(unlinked) === 1 ? "" : "s"} entfernt.`
            : "."}
        </p>
      ) : null}

      {canWrite ? (
        <form action={createArtistAction} className="tf-card space-y-4">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Schnell anlegen</h2>
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Nur der Name ist Pflicht — der Rest ist optional. Mehr Details kannst du danach unter
            Bearbeiten pflegen.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Name</span>
              <input
                name="name"
                required
                className="tf-input"
                placeholder="z. B. Anni Perka"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sichtbarkeit</span>
              <select name="visibility" className="tf-input" defaultValue="published">
                <option value="published">Veröffentlicht</option>
                <option value="draft">Entwurf</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Link-Name (optional)</span>
              <input name="slug" className="tf-input" placeholder="wird aus dem Namen erzeugt" />
            </label>
            <details className="sm:col-span-2 rounded-xl border border-[var(--tf-line)] p-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
                Details hinzufügen (optional)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--tf-text-secondary)]">Art</span>
                  <select name="artistType" className="tf-input" defaultValue="solo">
                    {ARTIST_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "solo"
                          ? "Solo"
                          : type === "band"
                            ? "Band"
                            : type === "duo"
                              ? "Duo"
                              : type === "ensemble"
                                ? "Ensemble"
                                : "Sonstiges"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--tf-text-secondary)]">Genre</span>
                  <input name="genre" className="tf-input" placeholder="z. B. Schlager" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--tf-text-secondary)]">Homepage</span>
                  <input
                    name="homepage"
                    className="tf-input"
                    placeholder="https://…"
                    inputMode="url"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--tf-text-secondary)]">YouTube-Link</span>
                  <input
                    name="youtube"
                    className="tf-input"
                    placeholder="https://youtube.com/watch?v=…"
                    inputMode="url"
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-[var(--tf-text-secondary)]">Bio</span>
                  <textarea
                    name="biography"
                    rows={3}
                    className="tf-input"
                    placeholder="Kurz vorstellen — darf auch später kommen."
                  />
                </label>
              </div>
            </details>
          </div>
          <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
            Künstler speichern
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        {artists.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Noch keine Künstler — leg den ersten oben an oder direkt im Event-Wizard.
          </p>
        ) : (
          artists.map((artist) => (
            <div key={artist.id} className="tf-card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--tf-navy)]">{artist.name}</p>
                <p className="text-sm text-[var(--tf-text-secondary)]">
                  {artist.visibility === "published" ? "Veröffentlicht" : "Entwurf"}
                  {" · "}
                  {(() => {
                    const n = artist._count.eventLinks + artist._count.tourLinks;
                    if (n === 0) return "nicht verknüpft";
                    const parts: string[] = [];
                    if (artist._count.eventLinks > 0) {
                      parts.push(
                        artist._count.eventLinks === 1
                          ? "1 Event"
                          : `${artist._count.eventLinks} Events`,
                      );
                    }
                    if (artist._count.tourLinks > 0) {
                      parts.push(
                        artist._count.tourLinks === 1
                          ? "1 Tour"
                          : `${artist._count.tourLinks} Touren`,
                      );
                    }
                    return parts.join(" · ");
                  })()}
                  {artist.homepage || artist.youtube || artist.shortBio
                    ? " · Profil mit Infos"
                    : " · nur Name"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canWrite ? (
                  <Link
                    href={`/admin/artists/${artist.id}`}
                    className="tf-btn tf-btn-primary !py-2 text-sm"
                  >
                    Bearbeiten
                  </Link>
                ) : null}
                {artist.visibility === "published" ? (
                  <Link
                    href={`/kuenstler/${artist.slug}`}
                    className="tf-btn tf-btn-secondary !py-2 text-sm"
                    target="_blank"
                  >
                    Öffentlich
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
