import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  formatBytes,
  getStorageUsage,
  type StorageUsageSnapshot,
} from "@/lib/admin/storage-usage";
import { canAccessSystemStorage } from "@/lib/admin/system-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Speicher · System" };

function formatPercent(value: number) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Strip anything Flight can't serialize (BigInt leftovers, etc.). */
function toPlainSnapshot(snapshot: StorageUsageSnapshot): StorageUsageSnapshot {
  return JSON.parse(
    JSON.stringify(snapshot, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
  ) as StorageUsageSnapshot;
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

function StorageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tf-card h-24 animate-pulse bg-[rgba(15,39,71,0.04)]" />
        ))}
      </div>
      <div className="tf-card h-28 animate-pulse bg-[rgba(15,39,71,0.04)]" />
      <p className="text-sm text-[var(--tf-text-secondary)]">Speicherdaten werden geladen …</p>
    </div>
  );
}

function StorageOverview({ snapshot }: { snapshot: StorageUsageSnapshot }) {
  const warn = snapshot.warnLowStorage;
  const barColor = warn ? "var(--tf-warning)" : "var(--tf-teal)";
  const usedRatio = Math.min(100, Math.max(0, Number(snapshot.percentUsed) || 0));
  const freeLabel = formatPercent(Math.max(0, Number(snapshot.percentFree) || 0));

  return (
    <>
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
                <tr key={cat.id} className="border-t border-[var(--tf-line)] align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--tf-navy)]">{cat.label}</p>
                    <p className="mt-0.5 text-xs text-[var(--tf-text-secondary)]">{cat.description}</p>
                    {cat.id === "uploads" && snapshot.uploads.count > 0 ? (
                      <p className="mt-0.5 text-xs text-[var(--tf-text-secondary)]">
                        {snapshot.uploads.count.toLocaleString("de-DE")} Dateien
                      </p>
                    ) : null}
                    {cat.id === "other" && cat.breakdown && cat.breakdown.length > 0 ? (
                      <ul className="mt-3 space-y-2 border-t border-[var(--tf-line)] pt-3">
                        {cat.breakdown.map((item) => (
                          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[var(--tf-navy)]">{item.label}</p>
                              <p className="text-xs text-[var(--tf-text-secondary)]">{item.description}</p>
                            </div>
                            <p className="shrink-0 tabular-nums text-xs text-[var(--tf-navy)]">
                              {formatBytes(item.bytes)}
                            </p>
                          </li>
                        ))}
                      </ul>
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
          Gemessen über Postgres (Tabellen inkl. Indizes und TOAST). Daten:{" "}
          {formatBytes(snapshot.structure.heapBytes)} · Indizes:{" "}
          {formatBytes(snapshot.structure.indexBytes)}
          {snapshot.structure.toastBytes > 0
            ? ` · TOAST: ${formatBytes(snapshot.structure.toastBytes)}`
            : null}
          . Limit:{" "}
          {snapshot.limitSource === "STORAGE_LIMIT_BYTES"
            ? "STORAGE_LIMIT_BYTES"
            : snapshot.limitSource === "NEON_STORAGE_LIMIT_GB"
              ? "NEON_STORAGE_LIMIT_GB"
              : "Standard 0,5 GB (Neon Free)"}
          . Stand {new Date(snapshot.measuredAt).toLocaleString("de-DE")}.
        </p>
      </section>
    </>
  );
}

async function StorageBody() {
  let snapshot: StorageUsageSnapshot | null = null;
  let loadError: string | null = null;
  try {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const raw = await Promise.race([
      getStorageUsage(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("STORAGE_TIMEOUT")), 12_000);
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    snapshot = toPlainSnapshot(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/speicher] load failed:", msg);
    loadError =
      msg === "STORAGE_TIMEOUT"
        ? "Die Speicherabfrage dauert zu lange. Bitte Seite neu laden."
        : "Speicherdaten konnten gerade nicht geladen werden. Versuch es gleich nochmal.";
  }

  if (!snapshot) {
    return <p className="text-[var(--danger)]">{loadError}</p>;
  }

  return <StorageOverview snapshot={snapshot} />;
}

export default async function AdminStoragePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
  if (!canAccessSystemStorage(keys)) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  // Shell + subnav first so soft-nav is not blocked by Postgres size queries.
  return (
    <div className="space-y-6">
      <Header />
      <AdminSubnav items={ADMIN_SUBNAV.system} />
      <Suspense fallback={<StorageSkeleton />}>
        <StorageBody />
      </Suspense>
    </div>
  );
}
