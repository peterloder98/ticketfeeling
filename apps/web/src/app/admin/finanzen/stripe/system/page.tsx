import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { runDailyReconcileAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function StripePayoutSystemPage() {
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
  const [lastRun, lastWebhook, openPayouts, failedPayouts, unmapped, diffs] = await Promise.all([
    prisma.stripePayoutReconcileRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.stripeWebhookEvent.findFirst({
      where: { eventType: { startsWith: "payout." }, processingStatus: "processed" },
      orderBy: { processedAt: "desc" },
    }),
    prisma.stripePayout.count({
      where: {
        transactionReconciliationStatus: {
          in: ["announced", "importing", "in_progress", "awaiting_stripe_data"],
        },
      },
    }),
    prisma.stripePayout.count({
      where: { transactionReconciliationStatus: { in: ["payout_failed", "unreconciled"] } },
    }),
    prisma.stripeBalanceTransaction.count({ where: { mappingStatus: "unmapped" } }),
    prisma.stripePayout.count({
      where: {
        reconciliationDifferenceCents: { not: 0 },
        transactionReconciliationStatus: { not: "announced" },
      },
    }),
  ]);

  const failedWebhooks = await prisma.stripeWebhookEvent.count({
    where: { processingStatus: "failed" },
  });

  return (
    <div className="space-y-6">
      <AdminSubnav items={ADMIN_SUBNAV.finanzen} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--tf-navy)]">
            Stripe-Abgleich – Systemzustand
          </h1>
          <p className="mt-1 text-sm text-[var(--tf-muted)]">
            Täglicher Cron ca. 06:00 Europe/Berlin (Vercel UTC 04:00), monatlicher Tiefenabgleich.
          </p>
        </div>
        <form action={runDailyReconcileAction}>
          <button type="submit" className="tf-btn tf-btn-primary">
            Abgleich jetzt starten
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="tf-card p-5">
          <div className="text-xs text-[var(--tf-muted)]">Letzter Cron-/Sync-Lauf</div>
          <div className="mt-1 font-medium text-[var(--tf-navy)]">
            {lastRun
              ? `${lastRun.kind} · ${lastRun.status} · ${lastRun.startedAt.toISOString()}`
              : "Noch keiner"}
          </div>
          {lastRun?.errorMessage ? (
            <p className="mt-2 text-sm text-red-700">{lastRun.errorMessage}</p>
          ) : null}
        </div>
        <div className="tf-card p-5">
          <div className="text-xs text-[var(--tf-muted)]">Letzter erfolgreicher Payout-Webhook</div>
          <div className="mt-1 font-medium text-[var(--tf-navy)]">
            {lastWebhook?.processedAt?.toISOString() ?? "—"}
          </div>
          <div className="text-sm text-[var(--tf-muted)]">
            Fehlgeschlagene Webhook-Events: {failedWebhooks}
          </div>
        </div>
        <div className="tf-card p-5">
          <div className="text-xs text-[var(--tf-muted)]">Offene / fehlerhafte Payouts</div>
          <div className="mt-1 text-lg font-semibold text-[var(--tf-navy)]">
            {openPayouts} offen · {failedPayouts} problematisch
          </div>
        </div>
        <div className="tf-card p-5">
          <div className="text-xs text-[var(--tf-muted)]">Zuordnung & Differenzen</div>
          <div className="mt-1 text-lg font-semibold text-[var(--tf-navy)]">
            {unmapped} unzugeordnet · {diffs} mit Diff ≠ 0
          </div>
        </div>
      </div>

      <p className="text-sm text-[var(--tf-muted)]">
        <Link href="/admin/finanzen/stripe" className="text-[var(--tf-teal-hover)] underline">
          Zur Auszahlungsliste
        </Link>
        . Live-Pilot und Steuerberater-Freigabe: siehe{" "}
        <code className="text-xs">docs/stripe-payout-reconciliation.md</code>.
      </p>
    </div>
  );
}
