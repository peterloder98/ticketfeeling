import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { LEGAL_DOCUMENT_TYPES, LEGAL_TYPE_META } from "@/lib/legal/document-types";
import {
  setLegalDocumentEnabledAction,
  syncLegalCatalogAction,
} from "@/app/admin/einstellungen/recht/actions";
import { syncLegalCatalog } from "@/lib/legal/sync-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rechtstexte" };

export default async function AdminLegalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead =
    (await userHasPermission(session.user.id, membership.organizationId, "legal:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:read"));
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "legal:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));

  // First visit: ensure document rows + catalog v1 exist (idempotent).
  const existingCount = await prisma.legalDocument.count({
    where: { organizationId: membership.organizationId },
  });
  if (existingCount < 5 && canWrite) {
    await syncLegalCatalog(membership.organizationId);
  }

  const docs = await prisma.legalDocument.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      versions: {
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
      },
    },
  });
  const byType = new Map(docs.map((d) => [d.type, d]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
            Rechtstexte
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
            Versionierte AGB, Datenschutz und weitere Rechtstexte. Beim Checkout wird die jeweils
            veröffentlichte Fassung mit der Bestellung gespeichert. Entwürfe vor Produktivstart
            fachlich prüfen.
          </p>
        </div>
        {canWrite ? (
          <form action={syncLegalCatalogAction}>
            <button type="submit" className="tf-btn tf-btn-secondary !min-h-10 text-sm">
              Katalog v1 synchronisieren
            </button>
          </form>
        ) : null}
      </div>

      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="space-y-3">
        {LEGAL_DOCUMENT_TYPES.map((type) => {
          const meta = LEGAL_TYPE_META[type];
          const doc = byType.get(type);
          const published = doc?.versions.find((v) => v.status === "published");
          const draft = doc?.versions.find((v) => v.status === "draft");
          return (
            <div
              key={type}
              className="tf-card flex flex-wrap items-center justify-between gap-3 !p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[var(--tf-navy)]">{meta.label}</p>
                <p className="text-sm text-[var(--tf-text-secondary)]">{meta.description}</p>
                <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                  {published
                    ? `Veröffentlicht: v${published.version} · ${
                        published.publishedAt
                          ? published.publishedAt.toLocaleDateString("de-DE")
                          : "—"
                      }`
                    : "Noch keine veröffentlichte Version"}
                  {draft ? ` · Entwurf v${draft.version}` : ""}
                  {doc && !doc.enabled ? " · deaktiviert" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canWrite && doc ? (
                  <form action={setLegalDocumentEnabledAction}>
                    <input type="hidden" name="type" value={type} />
                    <input type="hidden" name="enabled" value={doc.enabled ? "false" : "true"} />
                    <button type="submit" className="tf-btn tf-btn-secondary !min-h-9 text-xs">
                      {doc.enabled ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/admin/einstellungen/recht/${type}`}
                  className="tf-btn tf-btn-primary !min-h-9 text-xs"
                >
                  Bearbeiten
                </Link>
                {published && doc?.enabled ? (
                  <Link
                    href={`/recht/${meta.slug}`}
                    target="_blank"
                    className="text-xs font-medium text-[var(--tf-teal)] underline"
                  >
                    Öffentlich
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
