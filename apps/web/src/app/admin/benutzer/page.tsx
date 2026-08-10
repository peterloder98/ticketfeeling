import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import {
  STAFF_MANAGEABLE_ROLES,
  canManageStaffUsers,
  ensureStaffManageableRoles,
  staffRoleLabel,
} from "@/lib/admin/staff-access";
import { listOpenStaffInvites } from "@/lib/admin/staff-invite";
import { listStaffMemberships } from "@/lib/admin/staff-users";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { BenutzerPanel } from "@/components/admin/benutzer-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Benutzerverwaltung" };

export default async function AdminBenutzerPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  // Sync role permissions first so organizer_admin gains users:write if missing.
  // Fast-path + TTL inside ensure — fail soft so soft-nav is not aborted.
  try {
    await ensureStaffManageableRoles(membership.organizationId);
  } catch (err) {
    console.error(
      "[admin/benutzer] role sync failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  const allowed = await canManageStaffUsers(session.user.id, membership.organizationId);
  if (!allowed) {
    return <p className="text-[var(--danger)]">Keine Berechtigung für die Benutzerverwaltung.</p>;
  }

  let invites: Awaited<ReturnType<typeof listOpenStaffInvites>> = [];
  let members: Awaited<ReturnType<typeof listStaffMemberships>> = [];
  let customerCount = 0;
  let schemaHint: string | null = null;

  try {
    [members, invites, customerCount] = await Promise.all([
      listStaffMemberships(membership.organizationId),
      listOpenStaffInvites(membership.organizationId),
      prisma.customer.count({ where: { organizationId: membership.organizationId } }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/benutzer] load failed:", msg);
    if (/staff_invites|StaffInvite|does not exist|P2021/i.test(msg)) {
      schemaHint =
        "Datenbanktabelle für Einladungen fehlt noch. Bitte Seite nach dem Deploy neu laden.";
    } else {
      schemaHint = "Benutzerliste konnte nicht geladen werden. Bitte erneut versuchen.";
    }
  }

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
      {schemaHint ? <p className="text-sm text-[var(--danger)]">{schemaHint}</p> : null}
      <BenutzerPanel
        roles={[...STAFF_MANAGEABLE_ROLES]}
        currentUserId={session.user.id}
        customerCount={customerCount}
        initialMembers={members.map((m) => ({
          membershipId: m.id,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          // Plain fields only — Prisma Date on user crashes client soft-nav.
          user: {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            status: m.user.status,
          },
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
          acceptPath: `/einladung/${inv.token}`,
        }))}
      />
    </div>
  );
}
