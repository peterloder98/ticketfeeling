import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { createTourAction } from "@/app/admin/tours/actions";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { slugify } from "@/lib/admin/event-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Touren" };

export default async function AdminToursPage() {
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

  const tours = await prisma.tour.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      _count: { select: { events: true } },
      events: {
        select: { eventStartsAt: true },
        orderBy: { eventStartsAt: "asc" },
        take: 1,
      },
    },
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Touren</h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Zuerst die Tour anlegen (inkl. Tour-Plakat), danach einzelne Termine verknüpfen.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />

      {canWrite ? (
        <form action={createTourAction} className="tf-card space-y-4">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Neue Tour</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Name</span>
              <input
                name="name"
                required
                className="tf-input"
                placeholder="z. B. SCHLAGERfeeling Weihnachtstraum"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Link-Name (Slug)</span>
              <input
                name="slug"
                className="tf-input"
                placeholder={slugify("schlagerfeeling-weihnachtstraum")}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Sichtbarkeit</span>
              <select name="visibility" className="tf-input" defaultValue="published">
                <option value="draft">Entwurf</option>
                <option value="published">Veröffentlicht</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Tour-Start</span>
              <input type="date" name="startsOn" className="tf-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--tf-text-secondary)]">Tour-Ende</span>
              <input type="date" name="endsOn" className="tf-input" />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Beschreibung</span>
              <textarea name="description" rows={3} className="tf-input" />
            </label>
          </div>
          <CoverImageField name="coverImageUrl" refreshOnUpload={false} />
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Das Tour-Plakat gilt für alle Termine, sofern ein Termin kein eigenes Cover hat.
          </p>
          <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
            Tour anlegen
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        {tours.map((tour) => (
          <Link
            key={tour.id}
            href={`/admin/tours/${tour.id}`}
            className="tf-card block transition hover:border-[var(--tf-teal)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                {tour.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tour.coverImageUrl}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--tf-navy)] text-[10px] font-semibold tracking-wide text-white/70">
                    TOUR
                  </div>
                )}
                <div>
                  <p className="font-semibold text-[var(--tf-navy)]">{tour.name}</p>
                  <p className="text-sm text-[var(--tf-text-secondary)]">
                    {tour._count.events} Termin{tour._count.events === 1 ? "" : "e"}
                    {tour.startsOn
                      ? ` · ab ${tour.startsOn.toLocaleDateString("de-DE", {
                          timeZone: "Europe/Berlin",
                        })}`
                      : ""}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[rgba(20,184,166,0.12)] px-3 py-1 text-xs font-medium text-[var(--tf-navy)]">
                {tour.visibility === "published" ? "Veröffentlicht" : "Entwurf"}
              </span>
            </div>
          </Link>
        ))}
        {tours.length === 0 ? (
          <p className="rounded-2xl border border-[var(--tf-line)] bg-white px-4 py-8 text-sm text-[var(--tf-text-secondary)]">
            Noch keine Touren — zuerst eine Tour anlegen, dann Termine hinzufügen.
          </p>
        ) : null}
      </div>
    </div>
  );
}
