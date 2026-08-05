import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureVorverkaufRole } from "@/lib/commerce/box-office-access";
import { PartnerInvitePanel } from "@/components/admin/partner-invite-panel";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vorverkaufs-Partner" };

export default async function AdminPartnersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  // Keep Rolle „Vorverkaufsstelle“ (key: box_office) synced — Tageskasse only.
  await ensureVorverkaufRole(membership.organizationId);

  const [events, invites, grants] = await Promise.all([
    prisma.event.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { notIn: ["cancelled", "draft"] },
      },
      select: { id: true, name: true },
      orderBy: { eventStartsAt: "desc" },
      take: 120,
    }),
    prisma.boxOfficeInvite.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        events: { include: { event: { select: { id: true, name: true } } } },
        invitedBy: { select: { email: true, name: true } },
      },
      orderBy: { invitedAt: "desc" },
      take: 100,
    }),
    prisma.boxOfficeSellerGrant.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        event: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Vorverkaufsstellen
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          Vorverkaufsstellen per E-Mail einladen. Nach Annahme erhalten sie die Rolle
          „Vorverkaufsstelle“ und landen in der Tageskasse — ohne Admin (keine Events, Finanzen
          oder Einstellungen). Sie sehen nur freigegebene Events und eigene Verkäufe; Storno
          eigener Verkäufe ist möglich, solange Tickets weder gedruckt noch versendet wurden.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.verkauf} />
      <PartnerInvitePanel
        events={events}
        initialInvites={invites.map((inv) => ({
          ...inv,
          invitedAt: inv.invitedAt.toISOString(),
          expiresAt: inv.expiresAt.toISOString(),
          token: inv.status === "pending" ? inv.token : undefined,
        }))}
        initialGrants={grants.map((g) => ({
          ...g,
          createdAt: g.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
