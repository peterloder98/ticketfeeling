import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  cmToMetersLabel,
  parseVenuePlanObjects,
  planSeatCapacity,
} from "@/lib/saalplan/types";
import { deleteVenuePlanAction } from "@/app/admin/saalplan/actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminLocationDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "locations:read",
  );
  if (!canRead) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "locations:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));

  const location = await prisma.location.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
      rooms: true,
      venuePlans: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!location) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/locations"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Locations
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {location.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          {[location.street, location.houseNumber].filter(Boolean).join(" ")}
          {location.city ? `, ${location.postalCode ?? ""} ${location.city}` : ""}
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />

      <section className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalpläne</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--tf-text-secondary)]">
              So einfach: 1) Saalgröße in Metern · 2) Bühne platzieren · 3) Sitzblöcke mit Reihen ×
              Sitze · 4) Speichern — danach beim Event auswählen.
            </p>
          </div>
          {canWrite ? (
            <Link
              href={`/admin/locations/${location.id}/saalplan/neu`}
              className="tf-btn tf-btn-primary !min-h-10 text-sm"
            >
              Neuen Saalplan erstellen
            </Link>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          {location.venuePlans.map((plan) => {
            const seats = planSeatCapacity(parseVenuePlanObjects(plan.objects));
            return (
              <div
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--tf-line)] px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-[var(--tf-navy)]">{plan.name}</p>
                  <p className="text-xs text-[var(--tf-text-secondary)]">
                    {cmToMetersLabel(plan.widthCm)} × {cmToMetersLabel(plan.depthCm)}
                    {" · "}
                    {seats > 0 ? `${seats} Sitze` : "noch keine Sitzblöcke"}
                    {" · Version "}
                    {plan.version}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/saalplan/${plan.id}`}
                    className="tf-btn tf-btn-secondary !min-h-9 text-sm"
                  >
                    Bearbeiten
                  </Link>
                  {canWrite ? (
                    <form action={deleteVenuePlanAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <button type="submit" className="tf-btn !min-h-9 text-sm text-[var(--danger)]">
                        Löschen
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
          {location.venuePlans.length === 0 ? (
            <p className="rounded-xl bg-[#f8fafc] px-4 py-6 text-sm text-[var(--tf-text-secondary)]">
              Noch kein Saalplan. Klicke auf „Neuen Saalplan erstellen“ und gib zuerst die exakte
              Saalgröße ein — der Plan wird darauf skaliert.
            </p>
          ) : null}
        </div>
      </section>

      {location.rooms.length > 0 ? (
        <section className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Räume</h2>
          <ul className="mt-3 space-y-1 text-sm text-[var(--tf-text-secondary)]">
            {location.rooms.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
