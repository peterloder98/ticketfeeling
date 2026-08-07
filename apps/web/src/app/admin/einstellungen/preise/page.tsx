import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  computePlatformFeeGrossCents,
  feePercentLabel,
  parsePlatformFeeConfig,
} from "@/lib/commerce/platform-fee";
import { formatEuroFromCents } from "@/lib/money";
import { updatePlatformFeeConfigAction } from "./actions";
import { SmartDateTimeField } from "@/components/admin/smart-datetime-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preise und Gebühren" };

const PREVIEW_TICKETS = [4900, 5900, 7900, 11900, 15900];

export default async function PreiseEinstellungenPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(session.user.id, membership.organizationId, "org:read");
  const canWrite = await userHasPermission(session.user.id, membership.organizationId, "org:write");
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });
  const config = parsePlatformFeeConfig(settings?.platformFeeConfig);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Preise und Gebühren
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--tf-text-secondary)]">
          Zentrale Verwaltungsgebühr für alle Online-Bestellungen (nicht die alte
          Vorverkaufsgebühr). Änderungen gelten nur für neue Bestellungen.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-[var(--tf-navy)]">
        Die neue Einstellung gilt nur für neue Bestellungen. Bereits abgeschlossene Bestellungen
        behalten den bei Kauf geltenden Prozentsatz.
      </div>

      {canWrite ? (
        <form action={updatePlatformFeeConfigAction} className="tf-card space-y-5 text-sm">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Verwaltungsgebühr</h2>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={config.enabled} />
            <span>Verwaltungsgebühr aktiv</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span>Prozentsatz (%)</span>
              <input
                name="percentage"
                type="number"
                min="0"
                step="0.01"
                className="tf-input"
                defaultValue={(config.percentageBasisPoints / 100).toFixed(2)}
                required
              />
            </label>
            <label className="grid gap-1">
              <span>Anzeigename</span>
              <input
                name="displayName"
                className="tf-input"
                defaultValue={config.displayName}
                required
              />
            </label>
            <label className="grid gap-1">
              <span>Berechnungsbasis</span>
              <select
                name="calculationBase"
                className="tf-input"
                defaultValue={config.calculationBase}
              >
                <option value="ticket_subtotal_after_discounts">
                  Ticket-Zwischensumme nach Rabatt
                </option>
                <option value="ticket_subtotal_before_discounts">
                  Ticket-Zwischensumme vor Rabatt
                </option>
              </select>
            </label>
            <label className="grid gap-1">
              <span>Umsatzsteuerbehandlung</span>
              <select name="taxMode" className="tf-input" defaultValue={config.taxMode}>
                <option value="inherit_ticket_tax_rate">Steuersatz des Tickets übernehmen</option>
                <option value="custom">Eigener Steuersatz</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span>Eigener Steuersatz (%) — nur bei „Eigener Steuersatz“</span>
              <input
                name="customTaxPercent"
                type="number"
                min="0"
                step="0.01"
                className="tf-input"
                defaultValue={((config.customTaxRateBasisPoints ?? 700) / 100).toFixed(2)}
              />
            </label>
            <SmartDateTimeField
              name="activeFrom"
              label="Aktiv ab (optional)"
              defaultValue={
                config.activeFrom
                  ? new Date(config.activeFrom).toISOString().slice(0, 16)
                  : ""
              }
            />
          </div>

          <label className="grid gap-1">
            <span>Beschreibung für Kunden</span>
            <textarea
              name="customerDescription"
              className="tf-input min-h-[100px]"
              defaultValue={config.customerDescription}
            />
          </label>

          <label className="grid gap-1">
            <span>Änderungsgrund (optional, Audit)</span>
            <input name="changeReason" className="tf-input" placeholder="z. B. Anpassung Q3" />
          </label>

          <button type="submit" className="tf-btn tf-btn-primary">
            Speichern
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--tf-text-secondary)]">Nur Leserecht.</p>
      )}

      <section className="tf-card space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Vorschau</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          Aktuell: {config.enabled ? feePercentLabel(config.percentageBasisPoints) : "deaktiviert"} ·{" "}
          {config.displayName}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--tf-line)] text-[var(--tf-text-secondary)]">
                <th className="py-2 pr-3 font-medium">Ticket</th>
                <th className="py-2 pr-3 font-medium">Gebühr</th>
                <th className="py-2 font-medium">Gesamtpreis Kunde</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_TICKETS.map((ticket) => {
                const fee = config.enabled
                  ? computePlatformFeeGrossCents(ticket, config.percentageBasisPoints)
                  : 0;
                return (
                  <tr key={ticket} className="border-b border-[var(--tf-line)]/60">
                    <td className="py-2 pr-3 tabular-nums">{formatEuroFromCents(ticket)}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatEuroFromCents(fee)}</td>
                    <td className="py-2 font-semibold tabular-nums text-[var(--tf-navy)]">
                      {formatEuroFromCents(ticket + fee)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
