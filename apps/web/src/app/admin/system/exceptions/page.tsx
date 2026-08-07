import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ausnahmen · System" };

export default async function AdminExceptionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "audit:read"));
  if (!allowed) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const orgId = membership.organizationId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    needsReview,
    deadLetterJobs,
    needsAttentionJobs,
    failedWebhooks,
    pendingJobs,
    exceptionsToday,
    autoProcessedToday,
    recentDead,
    recentNeedsReview,
  ] = await Promise.all([
    prisma.order.count({
      where: { organizationId: orgId, paymentStatus: "needs_review" },
    }),
    prisma.backgroundJob.count({
      where: { organizationId: orgId, status: "dead_letter" },
    }),
    prisma.backgroundJob.count({
      where: { organizationId: orgId, status: "needs_attention" },
    }),
    prisma.webhookInbox.count({
      where: { organizationId: orgId, status: "failed" },
    }),
    prisma.backgroundJob.count({
      where: { organizationId: orgId, status: "pending" },
    }),
    prisma.auditLog.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: startOfDay },
        OR: [
          { action: { contains: "needs_attention" } },
          { action: { contains: "amount_mismatch" } },
          { action: "fulfillment.post_enqueue_failed" },
        ],
      },
    }),
    prisma.auditLog.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: startOfDay },
        action: { in: ["reconcile.commerce_run", "order.fulfilled"] },
      },
    }),
    prisma.backgroundJob.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["dead_letter", "needs_attention"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.order.findMany({
      where: { organizationId: orgId, paymentStatus: "needs_review" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        failedReasonCode: true,
        failedReasonMessage: true,
        updatedAt: true,
        customerTotalCents: true,
      },
    }),
  ]);

  const cards = [
    { label: "Needs review", value: needsReview },
    { label: "Dead letter", value: deadLetterJobs },
    { label: "Needs attention", value: needsAttentionJobs },
    { label: "Failed webhooks", value: failedWebhooks },
    { label: "Queue pending", value: pendingJobs },
    { label: "Ausnahmen heute", value: exceptionsToday },
    { label: "Auto verarbeitet heute", value: autoProcessedToday },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          System
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Ausnahmen
        </h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Nur echte Sonderfälle — der Rest heilt sich über Queue und Reconciliation selbst.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="tf-card">
            <p className="text-xs text-[var(--tf-text-secondary)]">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tf-navy)]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Bestellungen needs_review</h2>
        {recentNeedsReview.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Keine offenen Reviews.</p>
        ) : (
          <div className="space-y-2">
            {recentNeedsReview.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="tf-card block text-sm hover:ring-1 hover:ring-[var(--tf-teal)]"
              >
                <p className="font-semibold text-[var(--tf-navy)]">
                  {order.orderNumber}
                  {order.failedReasonCode ? ` · ${order.failedReasonCode}` : ""}
                </p>
                <p className="text-[var(--tf-text-secondary)]">
                  {order.failedReasonMessage ?? "Manuelle Prüfung nötig"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Dead letter / Needs attention</h2>
        {recentDead.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Queue ist sauber.</p>
        ) : (
          <div className="space-y-2">
            {recentDead.map((job) => (
              <div key={job.id} className="tf-card text-sm">
                <p className="font-semibold text-[var(--tf-navy)]">
                  {job.type} · {job.status}
                </p>
                <p className="text-[var(--tf-text-secondary)]">
                  Versuche {job.attemptCount}/{job.maxAttempts}
                  {job.lastErrorKind ? ` · ${job.lastErrorKind}` : ""}
                </p>
                {job.lastError ? (
                  <p className="mt-1 break-words text-xs text-[var(--danger)]">{job.lastError}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
