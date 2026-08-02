import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;
  const allowed = await userHasPermission(session.user.id, membership.organizationId, "audit:read");
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung (audit:read).</p>;

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          Audit-Log
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Append-only — kein Löschen über die App.</p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="tf-card text-sm">
            <p className="font-semibold">
              {log.action} · {log.entityType}
            </p>
            <p className="text-[var(--muted)]">
              {log.createdAt.toLocaleString("de-DE")} · {log.actor?.email ?? "system"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
