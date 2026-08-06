import { ADMIN_SUBNAV, adminHubItems } from "@/lib/admin/nav";
import { AdminHubCards, AdminSubnav } from "@/components/admin/admin-subnav";

export const metadata = { title: "System" };

export default function SystemHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">System</h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Benutzer, Support und Audit-Protokoll.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />
      <AdminHubCards items={adminHubItems("system")} />
    </div>
  );
}
