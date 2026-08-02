import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function AdminLocationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;
  const allowed = await userHasPermission(session.user.id, membership.organizationId, "locations:read");
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const locations = await prisma.location.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      rooms: true,
      _count: { select: { venuePlans: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Locations</h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Locations verwalten und Saalpläne anlegen.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />
      <div className="space-y-3">
        {locations.map((location) => (
          <Link
            key={location.id}
            href={`/admin/locations/${location.id}`}
            className="tf-card block transition hover:border-[var(--tf-teal)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--tf-navy)]">{location.name}</p>
                <p className="text-sm text-[var(--tf-text-secondary)]">
                  {[location.street, location.houseNumber].filter(Boolean).join(" ")}
                  {location.city ? `, ${location.postalCode ?? ""} ${location.city}` : ""}
                </p>
                <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
                  Räume: {location.rooms.map((r) => r.name).join(", ") || "—"}
                </p>
              </div>
              <span className="rounded-full bg-[rgba(20,184,166,0.12)] px-3 py-1 text-xs font-medium text-[var(--tf-navy)]">
                {location._count.venuePlans === 0
                  ? "Kein Saalplan"
                  : `${location._count.venuePlans} Saalplan${location._count.venuePlans === 1 ? "" : "e"}`}
              </span>
            </div>
          </Link>
        ))}
        {locations.length === 0 ? (
          <p className="rounded-2xl border border-[var(--tf-line)] bg-white px-4 py-8 text-sm text-[var(--tf-text-secondary)]">
            Noch keine Locations angelegt.
          </p>
        ) : null}
      </div>
    </div>
  );
}
