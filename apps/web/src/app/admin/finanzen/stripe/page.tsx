import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { formatEuroFromCents } from "@/lib/money";
import { ensureStripePayoutSchema } from "@/lib/stripe-payout/ensure-schema";
import { runDailyReconcileAction } from "./actions";

export const dynamic = "force-dynamic";

function statusClass(status: string) {
  switch (status) {
    case "reconciled":
      return "bg-teal-50 text-teal-900";
    case "review_required":
    case "unreconciled":
    case "partially_mapped":
      return "bg-amber-50 text-amber-900";
    case "payout_failed":
      return "bg-red-50 text-red-900";
    case "unsupported_manual_payout":
      return "bg-slate-100 text-slate-700";
    case "importing":
    case "in_progress":
      return "bg-sky-50 text-sky-900";
    default:
      return "bg-slate-50 text-slate-700";
  }
}

export default async function StripePayoutsPage() {
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
  await ensureStripePayoutSchema(prisma);
  const payouts = await prisma.stripePayout.findMany({
    orderBy: [{ arrivalDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-6">
      <AdminSubnav items={ADMIN_SUBNAV.finanzen} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--tf-navy)]">Stripe-Auszahlungen</h1>
          <p className="mt-1 text-sm text-[var(--tf-muted)]">
            Automatischer Abgleich über Stripe-Payout-ID — ohne Datumsraten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/finanzen/stripe/system" className="tf-btn tf-btn-secondary">
            Systemzustand
          </Link>
          <form action={runDailyReconcileAction}>
            <button type="submit" className="tf-btn tf-btn-primary">
              Jetzt mit Stripe synchronisieren
            </button>
          </form>
        </div>
      </div>

      <div className="tf-card overflow-x-auto p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--tf-border)] bg-[var(--tf-bg-muted)] text-[var(--tf-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Payout</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
              <th className="px-4 py-3 font-medium">Stripe</th>
              <th className="px-4 py-3 font-medium">Abgleich</th>
              <th className="px-4 py-3 font-medium">Diff</th>
              <th className="px-4 py-3 font-medium">Belege</th>
              <th className="px-4 py-3 font-medium">Lexoffice</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--tf-muted)]">
                  Noch keine Auszahlungen importiert. Sync starten oder auf Webhooks warten.
                </td>
              </tr>
            ) : (
              payouts.map((p) => (
                <tr key={p.id} className="border-b border-[var(--tf-border)]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/finanzen/stripe/${p.id}`}
                      className="font-medium text-[var(--tf-teal-hover)] underline"
                    >
                      {p.stripePayoutId}
                    </Link>
                    {!p.automatic ? (
                      <div className="text-xs text-amber-800">Manuell</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.arrivalDate ? p.arrivalDate.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatEuroFromCents(p.amountCents)} {p.currency.toUpperCase()}
                  </td>
                  <td className="px-4 py-3">{p.status}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(p.transactionReconciliationStatus)}`}
                    >
                      {p.transactionReconciliationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.reconciliationDifferenceCents == null
                      ? "—"
                      : formatEuroFromCents(p.reconciliationDifferenceCents)}
                  </td>
                  <td className="px-4 py-3">{p.documentStatus}</td>
                  <td className="px-4 py-3">{p.lexofficeStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
