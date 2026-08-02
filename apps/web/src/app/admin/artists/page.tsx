import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function AdminArtistsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;
  const allowed = await userHasPermission(session.user.id, membership.organizationId, "artists:read");
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const artists = await prisma.artist.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          Künstler
        </h1>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />
      <div className="space-y-3">
        {artists.map((artist) => (
          <div key={artist.id} className="tf-card flex justify-between gap-3">
            <div>
              <p className="font-semibold">{artist.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {artist.artistType} · {artist.visibility}
              </p>
            </div>
            <Link href={`/kuenstler/${artist.slug}`} className="tf-btn tf-btn-secondary !py-2 text-sm">
              Öffentlich
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
