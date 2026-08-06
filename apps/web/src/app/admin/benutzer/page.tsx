import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  STAFF_MANAGEABLE_ROLES,
  ensureStaffManageableRoles,
  staffRoleLabel,
} from "@/lib/admin/staff-access";
import { listStaffMemberships } from "@/lib/admin/staff-users";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { BenutzerPanel } from "@/components/admin/benutzer-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Benutzerverwaltung" };

export default async function AdminBenutzerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "users:write",
  );
  if (!allowed) {
    return <p className="text-[var(--danger)]">Keine Berechtigung für die Benutzerverwaltung.</p>;
  }

  await ensureStaffManageableRoles(membership.organizationId);

  const [members, invites, customerCount] = await Promise.all([
    listStaffMemberships(membership.organizationId),
    prisma.staffInvite.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { invitedAt: "desc" },
      take: 50,
    }),
    prisma.customer.count({ where: { organizationId: membership.organizationId } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          System
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Benutzerverwaltung
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          Interne Admins, Vorverkaufsstellen und Scanner anlegen und verwalten. Käufer-Konten
          bleiben bei den Kunden — Admins haben den Scanner automatisch mit dabei.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />
      <BenutzerPanel
        roles={[...STAFF_MANAGEABLE_ROLES]}
        currentUserId={session.user.id}
        customerCount={customerCount}
        initialMembers={members.map((m) => ({
          membershipId: m.id,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
          roles: m.roles.map((r) => ({
            key: r.role.key,
            name: staffRoleLabel(r.role.key),
          })),
        }))}
        initialInvites={invites.map((inv) => ({
          id: inv.id,
          email: inv.email,
          firstName: inv.firstName,
          lastName: inv.lastName,
          roleKey: inv.roleKey,
          roleName: staffRoleLabel(inv.roleKey),
          status: inv.status,
          invitedAt: inv.invitedAt.toISOString(),
          expiresAt: inv.expiresAt.toISOString(),
          acceptPath: inv.status === "pending" ? `/einladung/${inv.token}` : null,
        }))}
      />
    </div>
  );
}
