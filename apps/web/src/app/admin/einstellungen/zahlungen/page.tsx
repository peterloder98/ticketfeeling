import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  DEFAULT_PAYMENT_FEE_CONFIG,
  PAYMENT_METHOD_META,
  estimatePaymentFeeCents,
  parsePaymentFeeConfig,
  type PaymentMethodKey,
} from "@/lib/commerce/payment-fees";
import { getPaymentFeeStats } from "@/lib/commerce/payment-stats";
import { formatEuroFromCents } from "@/lib/money";
import {
  resetPaymentFeeConfigAction,
  updatePaymentFeeConfigAction,
} from "./actions";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export default async function ZahlungenEinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(session.user.id, membership.organizationId, "org:read");
  const canWrite = await userHasPermission(session.user.id, membership.organizationId, "org:write");
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const sp = await searchParams;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to, true);

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });
  const config = parsePaymentFeeConfig(settings?.paymentFeeConfig ?? DEFAULT_PAYMENT_FEE_CONFIG);
  const stats = await getPaymentFeeStats({
    organizationId: membership.organizationId,
    from,
    to,
  });

  const exampleTotal = 5900;
  const keys = Object.keys(PAYMENT_METHOD_META) as PaymentMethodKey[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Zahlungen (Stripe)
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--tf-text-secondary)]">
          Interne Stripe-Kosten und SEPA-Regeln. Der Kundenpreis enthält die Verwaltungsgebühr und
          ändert sich nicht durch die Zahlungsart. PayPal ist nicht verfügbar.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="rounded-2xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-4 py-3 text-sm text-[var(--tf-navy)]">
        <strong>Hinweis:</strong> Kundenaufschläge je Zahlungsart sind deaktiviert. Die
        Verwaltungsgebühr pflegst du unter{" "}
        <a href="/admin/einstellungen/preise" className="font-semibold underline">
          Preise und Gebühren
        </a>
        .
      </div>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Zahlungsarten & Stripe-Kosten</h2>
        {canWrite ? (
          <form action={updatePaymentFeeConfigAction} className="space-y-6">
            <div className="grid gap-3 rounded-2xl border border-[var(--tf-line)] p-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>Tickets bei SEPA versenden</span>
                <select
                  name="sepaTicketReleaseMode"
                  className="tf-input"
                  defaultValue={settings?.sepaTicketReleaseMode ?? "after_confirmed"}
                >
                  <option value="after_confirmed">Erst nach Zahlungsbestätigung</option>
                  <option value="after_submitted">Bereits nach Lastschrift-Einreichung</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>SEPA ausblenden ab (Tage vor Event)</span>
                <input
                  name="sepaMinDaysBeforeEvent"
                  type="number"
                  min="0"
                  className="tf-input"
                  defaultValue={settings?.sepaMinDaysBeforeEvent ?? 7}
                />
              </label>
            </div>
            {keys.map((key) => {
              const row = config[key];
              const meta = PAYMENT_METHOD_META[key];
              const exampleFee = estimatePaymentFeeCents(key, exampleTotal, config);
              return (
                <div
                  key={key}
                  className="rounded-2xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.02)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--tf-navy)]">{meta.title}</h3>
                      <p className="text-sm text-[var(--tf-text-secondary)]">{meta.description}</p>
                    </div>
                    <p className="text-xs text-[var(--tf-text-secondary)]">
                      Beispiel 59,00 € → intern {formatEuroFromCents(exampleFee)}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={`${key}_active`} defaultChecked={row.active} />
                      <span>Live aktiv</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`${key}_testMode`}
                        defaultChecked={row.testMode}
                      />
                      <span>Testmodus sichtbar</span>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>% Gebühr (intern)</span>
                      <input
                        name={`${key}_percentage`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="tf-input"
                        defaultValue={(row.percentageBps / 100).toFixed(2)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Fix (€, intern)</span>
                      <input
                        name={`${key}_fixed`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="tf-input"
                        defaultValue={(row.fixedFeeCents / 100).toFixed(2)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="tf-btn tf-btn-primary">
                Konditionen speichern
              </button>
              <button
                type="submit"
                formAction={resetPaymentFeeConfigAction}
                className="tf-btn tf-btn-secondary"
              >
                Auf Defaults zurücksetzen
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--danger)]">Zum Bearbeiten fehlt org:write.</p>
        )}
      </section>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
          Verwaltungsgebühr vs. Stripe-Kosten
        </h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          Kundenumsatz enthält die Verwaltungsgebühr. Stripe-Gebühren sind Aufwand und mindern den
          Umsatz nicht.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--tf-line)] p-3">
            <p className="text-xs text-[var(--tf-text-secondary)]">Kundenumsatz</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--tf-navy)]">
              {formatEuroFromCents(stats.platform.customerRevenueCents)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--tf-line)] p-3">
            <p className="text-xs text-[var(--tf-text-secondary)]">Verwaltungsgebühr</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--tf-navy)]">
              {formatEuroFromCents(stats.platform.administrationFeeGrossCents)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--tf-line)] p-3">
            <p className="text-xs text-[var(--tf-text-secondary)]">Stripe-Kosten (tatsächlich)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--tf-navy)]">
              {formatEuroFromCents(stats.platform.stripeFeeActualCents)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--tf-line)] p-3">
            <p className="text-xs text-[var(--tf-text-secondary)]">Deckungsbeitrag Gebühr − Stripe</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--tf-navy)]">
              {formatEuroFromCents(stats.platform.feeCoverageCents)}
            </p>
          </div>
        </div>
      </section>

      <section className="tf-card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Payment-Kosten</h2>
            <p className="text-sm text-[var(--tf-text-secondary)]">
              Aus bezahlten Online-Bestellungen · Ø Gebühr{" "}
              {formatEuroFromCents(stats.avgFeeCents)} / Bestellung
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              <span>Von</span>
              <input
                type="date"
                name="from"
                defaultValue={sp.from ?? ""}
                className="tf-input !min-h-10"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span>Bis</span>
              <input
                type="date"
                name="to"
                defaultValue={sp.to ?? ""}
                className="tf-input !min-h-10"
              />
            </label>
            <button type="submit" className="tf-btn tf-btn-secondary !min-h-10 text-sm">
              Filtern
            </button>
            <a
              href={`/api/v1/admin/payments/export?from=${encodeURIComponent(sp.from ?? "")}&to=${encodeURIComponent(sp.to ?? "")}`}
              className="tf-btn tf-btn-secondary !min-h-10 text-sm"
            >
              CSV exportieren
            </a>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--tf-line)] text-[var(--tf-text-secondary)]">
                <th className="py-2 pr-3 font-medium">Zahlungsart</th>
                <th className="py-2 pr-3 font-medium">Bestellungen</th>
                <th className="py-2 pr-3 font-medium">Umsatz</th>
                <th className="py-2 pr-3 font-medium">Gebühren (geschätzt)</th>
                <th className="py-2 pr-3 font-medium">Gebühren (tatsächlich)</th>
                <th className="py-2 pr-3 font-medium">Abweichung</th>
                <th className="py-2 font-medium">Netto</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((row) => (
                <tr key={row.method} className="border-b border-[var(--tf-line)]">
                  <td className="py-2.5 pr-3 font-medium text-[var(--tf-navy)]">{row.label}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{row.orderCount}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.revenueCents)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.estimatedFeeCents)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.actualFeeCents)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.feeVarianceCents)}
                  </td>
                  <td className="py-2.5 tabular-nums font-medium">
                    {formatEuroFromCents(row.netPayoutCents)}
                  </td>
                </tr>
              ))}
              {stats.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-[var(--tf-text-secondary)]">
                    Noch keine bezahlten Online-Bestellungen im Zeitraum.
                  </td>
                </tr>
              ) : (
                <tr className="font-semibold text-[var(--tf-navy)]">
                  <td className="py-3 pr-3">Summe</td>
                  <td className="py-3 pr-3 tabular-nums">{stats.totals.orderCount}</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.revenueCents)}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.estimatedFeeCents)}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.actualFeeCents)}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.feeVarianceCents)}
                  </td>
                  <td className="py-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.netPayoutCents)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
