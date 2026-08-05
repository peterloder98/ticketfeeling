import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { formatEuroFromCents } from "@/lib/money";
import {
  finalizeDocumentsAction,
  mapOrderAction,
  markLexofficeAction,
  previewDocumentsAction,
  saveAdminNoteAction,
  syncPayoutAction,
  uploadStripeOriginalAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function StripePayoutDetailPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) redirect("/admin");

  const prisma = getPrisma();
  const payout = await prisma.stripePayout.findUnique({
    where: { id: payoutId },
    include: {
      balanceTransactions: { orderBy: { createdAtStripe: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!payout) notFound();

  const canFinalize =
    payout.transactionReconciliationStatus === "reconciled" &&
    (payout.reconciliationDifferenceCents ?? 0) === 0 &&
    payout.status !== "failed" &&
    payout.status !== "canceled" &&
    payout.documentStatus !== "finalized";

  const summary = (payout.summaryJson ?? {}) as Record<string, number>;

  return (
    <div className="space-y-8">
      <AdminSubnav items={ADMIN_SUBNAV.finanzen} />
      <div>
        <Link href="/admin/finanzen/stripe" className="text-sm text-[var(--tf-teal-hover)] underline">
          ← Alle Auszahlungen
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--tf-navy)]">
          Auszahlung {payout.stripePayoutId}
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-muted)]">
          {payout.automatic
            ? "Automatische Stripe-Auszahlung"
            : "Manuelle Auszahlung – automatische Transaktionszuordnung nicht vollständig unterstützt"}
        </p>
      </div>

      <section className="tf-card grid gap-3 p-5 md:grid-cols-3">
        <div>
          <div className="text-xs text-[var(--tf-muted)]">Betrag</div>
          <div className="text-lg font-semibold text-[var(--tf-navy)]">
            {formatEuroFromCents(payout.amountCents)} {payout.currency.toUpperCase()}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--tf-muted)]">Abgleich</div>
          <div className="font-medium">{payout.transactionReconciliationStatus}</div>
          <div className="text-xs text-[var(--tf-muted)]">
            Diff:{" "}
            {payout.reconciliationDifferenceCents == null
              ? "—"
              : formatEuroFromCents(payout.reconciliationDifferenceCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--tf-muted)]">Transaktionen / Bestellungen</div>
          <div className="font-medium">
            {payout.balanceTransactionCount} / {summary.orderCount ?? "—"}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <form action={syncPayoutAction}>
          <input type="hidden" name="payoutId" value={payout.id} />
          <button type="submit" className="tf-btn tf-btn-secondary">
            Jetzt mit Stripe synchronisieren
          </button>
        </form>
        <form action={previewDocumentsAction}>
          <input type="hidden" name="payoutId" value={payout.id} />
          <button type="submit" className="tf-btn tf-btn-secondary">
            Buchhaltungsunterlagen als Vorschau
          </button>
        </form>
        <form action={finalizeDocumentsAction}>
          <input type="hidden" name="payoutId" value={payout.id} />
          <button type="submit" className="tf-btn tf-btn-primary" disabled={!canFinalize}>
            Buchhaltungsunterlagen verbindlich erzeugen
          </button>
        </form>
      </section>

      {!payout.automatic ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Manuelle Auszahlung – automatische Transaktionszuordnung nicht vollständig unterstützt.
        </p>
      ) : null}

      <section className="tf-card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Kontrollrechnung</h2>
        <ul className="text-sm text-[var(--tf-muted)] space-y-1">
          <li>Erlöse (BT amount payments): {formatEuroFromCents(summary.paymentNetCents ?? 0)}</li>
          <li>Stripe-Gebühren: {formatEuroFromCents(summary.feeCents ?? 0)}</li>
          <li>Erstattungen: {formatEuroFromCents(summary.refundCents ?? 0)}</li>
          <li>Disputes: {formatEuroFromCents(summary.disputeCents ?? 0)}</li>
          <li>Unbekannt: {summary.unknownCount ?? 0}</li>
          <li>Nicht zugeordnet: {summary.unmappedCount ?? 0}</li>
        </ul>
      </section>

      <section className="tf-card overflow-x-auto p-0">
        <h2 className="border-b border-[var(--tf-border)] px-5 py-3 text-lg font-semibold text-[var(--tf-navy)]">
          Balance Transactions
        </h2>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--tf-bg-muted)] text-[var(--tf-muted)]">
            <tr>
              <th className="px-4 py-2">BT</th>
              <th className="px-4 py-2">Typ</th>
              <th className="px-4 py-2">Klasse</th>
              <th className="px-4 py-2">Net</th>
              <th className="px-4 py-2">Zuordnung</th>
              <th className="px-4 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {payout.balanceTransactions.map((bt) => (
              <tr key={bt.id} className="border-t border-[var(--tf-border)]">
                <td className="px-4 py-2 font-mono text-xs">{bt.stripeBalanceTransactionId}</td>
                <td className="px-4 py-2">{bt.type}</td>
                <td className="px-4 py-2">{bt.classification}</td>
                <td className="px-4 py-2">{formatEuroFromCents(bt.netCents)}</td>
                <td className="px-4 py-2">
                  {bt.mappingStatus}
                  {bt.ticketfeelingOrderId ? (
                    <div className="text-xs text-[var(--tf-muted)]">{bt.ticketfeelingOrderId}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  {bt.mappingStatus === "unmapped" ? (
                    <form action={mapOrderAction} className="flex flex-col gap-1">
                      <input type="hidden" name="balanceTransactionId" value={bt.id} />
                      <input
                        name="orderId"
                        className="tf-input text-xs"
                        placeholder="Bestell-UUID"
                        required
                      />
                      <button type="submit" className="tf-btn tf-btn-secondary text-xs">
                        Manuell zuordnen
                      </button>
                    </form>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tf-card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Dokumente</h2>
        <ul className="space-y-2 text-sm">
          {payout.documents.length === 0 ? (
            <li className="text-[var(--tf-muted)]">Noch keine Dokumente.</li>
          ) : (
            payout.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3">
                <span>
                  {d.documentType} · {d.status}
                  {d.documentNumber ? ` · ${d.documentNumber}` : ""}
                </span>
                <a
                  className="text-[var(--tf-teal-hover)] underline"
                  href={`/api/v1/admin/stripe-payouts/documents/${d.id}`}
                >
                  PDF
                </a>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="tf-card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Stripe-Originalunterlagen</h2>
        <p className="text-sm text-[var(--tf-muted)]">
          Offizieller Stripe-Gebührenbeleg muss aus dem Stripe-Dashboard ergänzt werden, falls keine
          API verfügbar ist.
        </p>
        <form action={uploadStripeOriginalAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="payoutId" value={payout.id} />
          <label className="text-sm">
            Datei
            <input type="file" name="file" className="tf-input mt-1 block" required />
          </label>
          <label className="text-sm">
            Art
            <select name="kind" className="tf-input mt-1 block">
              <option value="fee_invoice">Gebührenbeleg</option>
              <option value="reconciliation_report">Reconciliation Report</option>
              <option value="other">Sonstiges</option>
            </select>
          </label>
          <button type="submit" className="tf-btn tf-btn-secondary">
            Hochladen
          </button>
        </form>
      </section>

      <section className="tf-card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Lexoffice</h2>
        <form action={markLexofficeAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <input
            name="lexofficeReference"
            className="tf-input"
            placeholder="Lexoffice-Referenz / Belegnr."
            defaultValue={payout.lexofficeReference ?? ""}
          />
          <button type="submit" className="tf-btn tf-btn-secondary">
            Als in Lexoffice zugeordnet markieren
          </button>
        </form>
      </section>

      <section className="tf-card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Notiz</h2>
        <form action={saveAdminNoteAction} className="space-y-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <textarea
            name="adminNote"
            className="tf-input min-h-24 w-full"
            defaultValue={payout.adminNote ?? ""}
          />
          <button type="submit" className="tf-btn tf-btn-secondary">
            Speichern
          </button>
        </form>
      </section>

      <section className="tf-card space-y-2 p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Audit Log</h2>
        <ul className="space-y-1 text-xs text-[var(--tf-muted)]">
          {payout.auditLogs.map((a) => (
            <li key={a.id}>
              {a.createdAt.toISOString()} · {a.action} · {a.actorType}
              {a.actorId ? ` · ${a.actorId}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
