import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import {
  deleteCategoryTemplateAction,
  upsertCategoryTemplateAction,
} from "@/app/admin/events/category-actions";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kategorie-Vorlagen" };

export default async function CategoryTemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:read",
  );
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:write",
  );

  const templates = await prisma.ticketCategoryTemplate.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Kategorie-Vorlagen
        </h1>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Vorlagen für typische Tickets (z. B. Kat. 1, VIP). Die echten Kategorien und Kontingente
          legst du immer am jeweiligen Event an — hier nur wiederverwendbare Defaults.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.katalog} />

      {canWrite ? (
        <form action={upsertCategoryTemplateAction} className="tf-card grid gap-3 text-sm md:grid-cols-2">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)] md:col-span-2">
            Neue Vorlage
          </h2>
          <label className="grid gap-1 md:col-span-2">
            <span className="font-medium">Name</span>
            <input name="name" className="tf-input" required placeholder="z. B. VIP" />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Preis (€ brutto)</span>
            <input name="priceEuro" type="number" step="0.01" min="0" className="tf-input" defaultValue="45" required />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Kontingent</span>
            <input name="capacity" type="number" min="1" className="tf-input" defaultValue="100" required />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Max. / Bestellung</span>
            <input name="maxPerOrder" type="number" min="1" className="tf-input" defaultValue="10" required />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="font-medium">Beschreibung</span>
            <input name="description" className="tf-input" placeholder="optional" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="tf-btn tf-btn-primary">
              Vorlage speichern
            </button>
          </div>
        </form>
      ) : null}

      <div className="space-y-3">
        {templates.map((tpl) => (
          <div key={tpl.id} className="tf-card !p-4">
            {canWrite ? (
              <form action={upsertCategoryTemplateAction} className="grid gap-3 text-sm md:grid-cols-4">
                <input type="hidden" name="id" value={tpl.id} />
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Name</span>
                  <input name="name" className="tf-input" defaultValue={tpl.name} required />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Preis €</span>
                  <input
                    name="priceEuro"
                    type="number"
                    step="0.01"
                    className="tf-input"
                    defaultValue={(tpl.priceGrossCents / 100).toFixed(2)}
                    required
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Kontingent</span>
                  <input name="capacity" type="number" className="tf-input" defaultValue={tpl.capacity} required />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Max./Best.</span>
                  <input name="maxPerOrder" type="number" className="tf-input" defaultValue={tpl.maxPerOrder} required />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Beschreibung</span>
                  <input name="description" className="tf-input" defaultValue={tpl.description ?? ""} />
                </label>
                <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                  <button type="submit" className="tf-btn tf-btn-primary !min-h-10 text-sm">
                    Speichern
                  </button>
                  <button
                    formAction={deleteCategoryTemplateAction}
                    type="submit"
                    className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                  >
                    Löschen
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <p className="font-semibold text-[var(--tf-navy)]">{tpl.name}</p>
                <p className="text-sm text-[var(--tf-text-secondary)]">
                  {formatEuroFromCents(tpl.priceGrossCents)} · {tpl.capacity} Plätze · max.{" "}
                  {tpl.maxPerOrder}/Bestellung
                </p>
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Noch keine Vorlagen — z. B. „Kat. 3“, „Kat. 2“, „Kat. 1“, „VIP“ anlegen.
          </p>
        ) : null}
      </div>
    </div>
  );
}
