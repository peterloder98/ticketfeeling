import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { PurgeTestCommerceForm } from "@/components/admin/purge-test-commerce-form";
import { PURGE_ORG_SLUG } from "@/lib/admin/purge-test-commerce";
import { canAccessSystemStorage } from "@/lib/admin/system-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "Aufräumen · System" };

export default async function AdminPurgePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  // Same gate as Speicher — nav/hub already list Aufräumen for staff; page must match.
  const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
  if (!canAccessSystemStorage(keys)) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  // Plain string only — never pass Prisma org/Date trees to client children.
  const orgSlug = String(membership.organization.slug ?? "");
  const orgOk = orgSlug === PURGE_ORG_SLUG;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          System
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Aufräumen
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--tf-text-secondary)]">
          Testdaten in der Produktions-Datenbank bereinigen — ohne Neon-Zugang, direkt über Vercel.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />

      {orgOk ? (
        <PurgeTestCommerceForm />
      ) : (
        <div className="tf-card border-[rgba(220,38,38,0.25)]">
          <p className="text-sm text-[var(--danger)]">
            Aufräumen ist nur für die Organisation „{PURGE_ORG_SLUG}“ verfügbar. Aktuelle Org:{" "}
            {orgSlug || "(unbekannt)"}.
          </p>
        </div>
      )}
    </div>
  );
}
