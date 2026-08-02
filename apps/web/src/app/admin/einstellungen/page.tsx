import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureEmailAccountsMigrated } from "@/lib/email/accounts";
import { DefaultSmtpTestPanel } from "@/components/admin/default-smtp-test-panel";
import { ADMIN_SUBNAV, adminHubItems } from "@/lib/admin/nav";
import { AdminHubCards, AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(session.user.id, membership.organizationId, "org:read");
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const prisma = getPrisma();
  await ensureEmailAccountsMigrated(membership.organizationId);
  const defaultAccount = await prisma.organizationEmailAccount.findFirst({
    where: { organizationId: membership.organizationId, isDefault: true },
  });
  const accountCount = await prisma.organizationEmailAccount.count({
    where: { organizationId: membership.organizationId },
  });

  const hubs = adminHubItems("einstellungen").map((item) => {
    if (item.href === "/admin/einstellungen/email") {
      return {
        ...item,
        description:
          accountCount === 0
            ? "Noch kein SMTP-Konto — Tickets können nicht per Mail raus."
            : `${accountCount} Konto${accountCount === 1 ? "" : "s"} · Standard: ${
                defaultAccount?.label ?? "—"
              }`,
      };
    }
    return item;
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Einstellungen
        </h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Unternehmen, Website, Versand, Preise und Zahlungen.
        </p>
      </div>

      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />
      <AdminHubCards items={hubs} />

      <DefaultSmtpTestPanel
        defaultLabel={defaultAccount?.label ?? null}
        defaultFrom={defaultAccount?.fromEmail ?? null}
      />
    </div>
  );
}
