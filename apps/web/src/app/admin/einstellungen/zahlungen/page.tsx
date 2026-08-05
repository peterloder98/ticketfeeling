import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  DEFAULT_PAYMENT_METHOD_ORDER,
  PAYMENT_METHOD_META,
  estimatePaymentFeeCents,
  parsePaymentFeeConfig,
  parsePaymentUiConfig,
  type PaymentMethodKey,
} from "@/lib/commerce/payment-fees";
import { SEPA_MIN_DAYS_PRESETS } from "@/lib/commerce/sepa-availability";
import { getPaymentFeeStats } from "@/lib/commerce/payment-stats";
import { formatEuroFromCents } from "@/lib/money";
import {
  releaseSepaReservationAction,
  resetPaymentFeeConfigAction,
  updatePaymentFeeConfigAction,
} from "./actions";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { SmartDateInput } from "@/components/admin/smart-date-input";
import { getPaymentProvider } from "@/lib/payments";

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
  const config = parsePaymentFeeConfig(settings?.paymentFeeConfig);
  const ui = parsePaymentUiConfig(settings?.paymentUiConfig);
  const stats = await getPaymentFeeStats({
    organizationId: membership.organizationId,
    from,
    to,
  });

  const sepaReservations = await prisma.order.findMany({
    where: {
      organizationId: membership.organizationId,
      paymentMethod: { in: ["sepa_debit", "stripe_sepa"] },
      reservationStatus: "held",
      paymentStatus: { in: ["pending", "processing"] },
    },
    include: {
      items: { take: 2 },
      customer: { select: { email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const exampleTotal = 5900;
  const keys = (ui.methodOrder?.length ? ui.methodOrder : DEFAULT_PAYMENT_METHOD_ORDER).filter(
    (k): k is PaymentMethodKey => k in PAYMENT_METHOD_META,
  );
  const providerKey = getPaymentProvider().key;
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY,
  );
  const testModeLive =
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Zahlungen → Stripe
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--tf-text-secondary)]">
          Ausschließlich Stripe. Kundenpreis = Tickets + Verwaltungsgebühr — unabhängig von der
          Zahlungsart. PayPal und andere Anbieter sind nicht verfügbar.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${
          testModeLive || providerKey === "dev"
            ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.1)] text-[#92400e]"
            : "border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] text-[var(--tf-navy)]"
        }`}
      >
        <strong>Stripe-Status:</strong>{" "}
        {providerKey === "dev"
          ? "Dev-Provider aktiv (keine Live-Zahlungen)."
          : stripeConfigured
            ? testModeLive
              ? "Testmodus (sk_test / pk_test)."
              : "Live-Schlüssel konfiguriert."
            : "Stripe-Schlüssel fehlen."}{" "}
        Verwaltungsgebühr unter{" "}
        <a href="/admin/einstellungen/preise" className="font-semibold underline">
          Preise und Gebühren
        </a>
        .
      </div>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Zahlungsarten & SEPA-Regeln</h2>
        {canWrite ? (
          <form action={updatePaymentFeeConfigAction} className="space-y-6">
            <div className="grid gap-3 rounded-2xl border border-[var(--tf-line)] p-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-[var(--tf-navy)]">Tickets bei SEPA versenden</span>
                <select
                  name="sepaTicketReleaseMode"
                  className="tf-input max-w-xl"
                  defaultValue={settings?.sepaTicketReleaseMode ?? "after_confirmed"}
                >
                  <option value="after_confirmed">Erst nach bestätigter Zahlung (empfohlen)</option>
                  <option value="after_submission">
                    Bereits nach erfolgreicher Einreichung der Lastschrift
                  </option>
                </select>
                <span className="text-xs text-[var(--tf-text-secondary)]">
                  Produktiv: immer „nach bestätigter Zahlung“. Frühere Freigabe erhöht das Risiko bei
                  Rücklastschriften.
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                <span>SEPA vor Veranstaltungsbeginn deaktivieren</span>
                <select
                  name="sepaMinDaysBeforeEvent"
                  className="tf-input"
                  defaultValue={String(settings?.sepaMinDaysBeforeEvent ?? 7)}
                >
                  {SEPA_MIN_DAYS_PRESETS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? "0 Tage (bis Eventbeginn)" : `${d} Tage`}
                    </option>
                  ))}
                  {[1, 2, 4, 6, 8, 9, 11, 12, 13, 21, 30]
                    .filter((d) => !(SEPA_MIN_DAYS_PRESETS as readonly number[]).includes(d))
                    .map((d) => (
                      <option key={d} value={d}>
                        {d} Tage (individuell)
                      </option>
                    ))}
                </select>
                <span className="text-xs text-[var(--tf-text-secondary)]">
                  Standard 7 Tage. Pro Event überschreibbar.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-1">
                <input
                  type="checkbox"
                  name="sepaRecommended"
                  defaultChecked={ui.sepaRecommended}
                />
                <span>SEPA als empfohlen kennzeichnen</span>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Text des Empfehlungs-Badges</span>
                <input
                  name="recommendedBadgeText"
                  className="tf-input max-w-xs"
                  defaultValue={ui.recommendedBadgeText}
                />
              </label>
              <input type="hidden" name="methodOrder" value={keys.join(",")} />
              <p className="text-xs text-[var(--tf-text-secondary)] sm:col-span-2">
                Reihenfolge im Checkout: {keys.map((k) => PAYMENT_METHOD_META[k].title).join(" → ")}
              </p>
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
          Reservierte SEPA-Bestellungen
        </h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          Plätze bleiben reserviert, solange die Lastschrift bei Stripe verarbeitet wird. Manuelle
          Freigabe nur mit Bedacht — wird im Audit-Log gespeichert.
        </p>
        {sepaReservations.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Keine offenen SEPA-Reservierungen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--tf-line)] text-[var(--tf-text-secondary)]">
                  <th className="py-2 pr-3 font-medium">Bestellung</th>
                  <th className="py-2 pr-3 font-medium">Event / Plätze</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Alter</th>
                  <th className="py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {sepaReservations.map((order) => {
                  const ageHours = Math.max(
                    0,
                    Math.round((Date.now() - order.createdAt.getTime()) / (60 * 60 * 1000)),
                  );
                  return (
                    <tr key={order.id} className="border-b border-[var(--tf-line)]">
                      <td className="py-2 pr-3">
                        <a
                          href={`/admin/verkauf?q=${encodeURIComponent(order.orderNumber)}`}
                          className="font-medium text-[var(--tf-teal)] underline"
                        >
                          {order.orderNumber}
                        </a>
                        <p className="text-xs text-[var(--tf-text-secondary)]">
                          {order.customer.firstName} {order.customer.lastName}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {order.items[0]?.eventNameSnapshot ?? "—"}
                        <p className="text-xs text-[var(--tf-text-secondary)]">
                          {order.items.reduce((n, i) => n + i.quantity, 0)} Tickets
                        </p>
                      </td>
                      <td className="py-2 pr-3">{order.paymentStatus ?? "—"}</td>
                      <td className="py-2 pr-3">{ageHours} Std.</td>
                      <td className="py-2">
                        {canWrite ? (
                          <form action={releaseSepaReservationAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <button
                              type="submit"
                              className="text-xs font-semibold text-[#b91c1c] underline"
                            >
                              Manuell freigeben
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
            <div className="min-w-[11rem] text-xs [&_span]:text-xs">
              <SmartDateInput name="from" label="Von" defaultValue={sp.from ?? ""} />
            </div>
            <div className="min-w-[11rem] text-xs [&_span]:text-xs">
              <SmartDateInput name="to" label="Bis" defaultValue={sp.to ?? ""} />
            </div>
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
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--tf-line)] text-[var(--tf-text-secondary)]">
                <th className="py-2 pr-3 font-medium">Zahlungsart</th>
                <th className="py-2 pr-3 font-medium">Bestellungen</th>
                <th className="py-2 pr-3 font-medium">Umsatz</th>
                <th className="py-2 pr-3 font-medium">Anteil</th>
                <th className="py-2 pr-3 font-medium">Stripe-Gebühren</th>
                <th className="py-2 pr-3 font-medium">Ø Stripe-Gebühr</th>
                <th className="py-2 pr-3 font-medium">Abweichung (geschätzt)</th>
                <th className="py-2 font-medium">Netto-Auszahlung</th>
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
                    {row.sharePercent.toFixed(1).replace(".", ",")}&nbsp;%
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.actualFeeCents)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatEuroFromCents(row.avgFeeCents)}
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
                  <td colSpan={8} className="py-6 text-[var(--tf-text-secondary)]">
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
                  <td className="py-3 pr-3 tabular-nums">100&nbsp;%</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.totals.actualFeeCents)}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatEuroFromCents(stats.avgFeeCents)}
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
