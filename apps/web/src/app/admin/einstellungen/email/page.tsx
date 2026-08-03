import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureEmailAccountsMigrated } from "@/lib/email/accounts";
import { EmailAccountsManager } from "@/components/admin/email-accounts-manager";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function EmailAccountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(session.user.id, membership.organizationId, "org:read");
  const canWrite = await userHasPermission(session.user.id, membership.organizationId, "org:write");
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  if (!canWrite) {
    return <p className="text-[var(--danger)]">Zum Verwalten der E-Mail-Konten fehlt org:write.</p>;
  }

  const prisma = getPrisma();
  await ensureEmailAccountsMigrated(membership.organizationId);
  const accounts = await prisma.organizationEmailAccount.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          E-Mail-Konten
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--tf-text-secondary)]">
          SMTP-Konten für Ticketversand und Systemmails. Anlegen, testen, als Standard setzen,
          bearbeiten oder löschen.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <EmailAccountsManager
        accounts={accounts.map((a) => ({
          id: a.id,
          label: a.label,
          host: a.host,
          port: a.port,
          secure: a.secure,
          username: a.username,
          fromEmail: a.fromEmail,
          fromName: a.fromName,
          isDefault: a.isDefault,
          passwordSet: Boolean(a.passwordEnc),
          lastTestedAt: a.lastTestedAt?.toISOString() ?? null,
          lastTestOk: a.lastTestOk,
          lastTestMessage: a.lastTestMessage,
        }))}
      />
    </div>
  );
}
