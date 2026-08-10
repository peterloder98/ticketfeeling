import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { formatBytes, getStorageUsage } from "@/lib/admin/storage-usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Speicher · System" };

function formatPercent(value: number) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

export default async function AdminStoragePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:read"));
  if (!allowed) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  let snapshot;
  let loadError: string | null = null;
  try {
    snapshot = await getStorageUsage();
  } catch {
    loadError = "Speicherdaten konnten gerade nicht geladen werden. Versuch es gleich nochmal.";
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <Header />
        <AdminSubnav items={ADMIN_SUBNAV.system} />
        <p className="text-[var(--danger)]">{loadError}</p>
      </div>
    );
  }

  const warn = snapshot.warnLowStorage;
  const barColor = warn ? "var(--tf-warning)" : "var(--tf-teal)";
  const usedRatio = Math.min(100, Math.max(0, snapshot.percentUsed));
  const freeLabel = formatPercent(Math.max(0, snapshot.percentFree));

  return (
    <div className="space-y-6">
      <Header />
      <AdminSubnav items={ADMIN_SUBNAV.system} />

      {warn ? (
        <div
          className="tf-card border border-[color-mix(in_srgb,var(--tf-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--tf-warning)_10%,transparent)]"
          role="status"
        >
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            Speicher wird knapp — noch {freeLabel}&nbsp;% frei.
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Bilder und Stripe-Originale belegen am meisten. Alte Uploads aufräumen oder das Limit
            anheben, bevor der Speicher voll ist.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tf-card">
          <p className="text-xs text-[var(--tf-text-secondary)]">Belegt</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {formatBytes(snapshot.usedBytes)}
          </p>
        </div>
        <div className="tf-card">
          <p className="text-xs text-[var(--tf-text-secondary)]">Limit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
            {formatBytes(snapshot.limitBytes)}
          </p>
        </div>
        <div className="tf-card">
          <p className="text-xs text-[var(--tf-text-secondary)]">Noch frei</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{ color: warn ? "var(--tf-warning)" : "var(--tf-navy)" }}
          >
            {formatBytes(snapshot.freeBytes)}
          </p>
          <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">{freeLabel}&nbsp;% vom Limit</p>
        </div>
      </div>

      <div className="tf-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Auslastung</h2>
          {warn ? (
            <span
              className="tf-badge"
              style={{
                background: "color-mix(in srgb, var(--tf-warning) 18%, transparent)",
                color: "var(--tf-navy)",
              }}
            >
              Wenig frei
            </span>
          ) : (
            <span className="tf-badge-teal">Alles im grünen Bereich</span>
          )}
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-[rgba(15,39,71,0.08)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usedRatio)}
          aria-label="Speicherauslastung"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${usedRatio}%`, background: barColor }}
          />
        </div>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          {formatBytes(snapshot.usedBytes)} von {formatBytes(snapshot.limitBytes)} belegt (
          {formatPercent(usedRatio)}&nbsp;%).
          {snapshot.uploads.count > 0 ? (
            <>
              {" "}
              {snapshot.uploads.count.toLocaleString("de-DE")} Uploads
              {snapshot.uploads.avgBytes != null
                ? ` · Ø ${formatBytes(snapshot.uploads.avgBytes)}`
                : null}
              .
            </>
          ) : null}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Was den Speicher belegt</h2>
        <div className="overflow-x-auto rounded-[var(--tf-radius-card)] border border-[var(--tf-line)]">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-[rgba(15,39,71,0.03)] text-xs uppercase tracking-wide text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Bereich</th>
                <th className="px-4 py-3 font-semibold">Größe</th>
                <th className="px-4 py-3 font-semibold">Anteil</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.categories.map((cat) => (
                <tr key={cat.id} className="border-t border-[var(--tf-line)]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--tf-navy)]">{cat.label}</p>
                    {cat.id === "uploads" && snapshot.uploads.count > 0 ? (
                      <p className="mt-0.5 text-xs text-[var(--tf-text-secondary)]">
                        {snapshot.uploads.count.toLocaleString("de-DE")} Dateien
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--tf-navy)]">
                    {formatBytes(cat.bytes)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--tf-text-secondary)]">
                    {formatPercent(cat.percentOfUsed)}&nbsp;%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--tf-text-secondary)]">
          Gemessen über Postgres (Tabellengrößen). Limit:{" "}
          {snapshot.limitSource === "STORAGE_LIMIT_BYTES"
            ? "STORAGE_LIMIT_BYTES"
            : snapshot.limitSource === "NEON_STORAGE_LIMIT_GB"
              ? "NEON_STORAGE_LIMIT_GB"
              : "Standard 0,5 GB (Neon Free)"}
          . Stand {new Date(snapshot.measuredAt).toLocaleString("de-DE")}.
        </p>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
        System
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Speicher</h1>
      <p className="mt-2 text-[var(--tf-text-secondary)]">
        Wie voll die Datenbank ist — und was den Platz belegt.
      </p>
    </div>
  );
}
