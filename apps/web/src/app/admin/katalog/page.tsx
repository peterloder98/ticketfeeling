import { ADMIN_SUBNAV, adminHubItems } from "@/lib/admin/nav";
import { AdminHubCards, AdminSubnav } from "@/components/admin/admin-subnav";

export const metadata = { title: "Katalog" };

export default function KatalogHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Katalog</h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Vorlagen, Künstler, Locations und Touren.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />
      <AdminHubCards items={adminHubItems("katalog")} />
    </div>
  );
}
