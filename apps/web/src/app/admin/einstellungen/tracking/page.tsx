import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { mapToMeta } from "@/lib/tracking/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracking-Debug" };

const FUNNEL_STAGES = [
  { name: "event_page_view", label: "Landing / Event ViewContent" },
  { name: "ticket_shop_view", label: "Ticketshop ViewContent" },
  { name: "add_to_cart", label: "AddToCart" },
  { name: "begin_checkout", label: "InitiateCheckout" },
  { name: "add_payment_info", label: "AddPaymentInfo" },
  { name: "payment_started", label: "Payment gestartet" },
  { name: "purchase", label: "Purchase" },
] as const;

function Check({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        ok
          ? "bg-[rgba(20,184,166,0.15)] text-[var(--tf-teal)]"
          : "bg-[#f1f5f9] text-[var(--tf-text-secondary)]"
      }`}
      aria-label={ok ? "vorhanden" : "fehlt"}
    >
      {ok ? "✓" : "–"}
    </span>
  );
}

export default async function TrackingDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:read",
  );
  if (!canRead) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const sp = await searchParams;
  const orderId = sp.orderId?.trim() || null;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentEvents = await prisma.trackingEvent.findMany({
    where: {
      organizationId: membership.organizationId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      deliveries: { select: { channel: true, status: true, sentAt: true } },
    },
  });

  const counts = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [
      s.name,
      recentEvents.filter((e) => e.name === s.name).length,
    ]),
  ) as Record<string, number>;

  let orderFunnel: Array<{
    stage: string;
    label: string;
    internal: boolean;
    metaCapi: boolean;
    metaName: string | null;
  }> = [];

  if (orderId) {
    const orderEvents = await prisma.trackingEvent.findMany({
      where: {
        organizationId: membership.organizationId,
        OR: [{ orderId }, { eventId: orderId.toLowerCase() }],
      },
      include: { deliveries: true },
      orderBy: { createdAt: "asc" },
    });
    // Also pull session funnel around purchase
    const purchase = orderEvents.find((e) => e.name === "purchase");
    const sessionEvents = purchase?.trackingSessionId
      ? await prisma.trackingEvent.findMany({
          where: { trackingSessionId: purchase.trackingSessionId },
          include: { deliveries: true },
          orderBy: { createdAt: "asc" },
        })
      : orderEvents;

    orderFunnel = FUNNEL_STAGES.map((stage) => {
      const hit = sessionEvents.find((e) => e.name === stage.name) ||
        orderEvents.find((e) => e.name === stage.name);
      const metaOk = Boolean(
        hit?.deliveries.some((d) => d.channel === "meta_capi" && d.status === "sent"),
      );
      return {
        stage: stage.name,
        label: stage.label,
        internal: Boolean(hit),
        metaCapi: metaOk,
        metaName: mapToMeta(stage.name)?.name ?? null,
      };
    });
  }

  const recentDeliveries = await prisma.trackingDelivery.findMany({
    where: {
      organizationId: membership.organizationId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      trackingEvent: { select: { name: true, eventId: true, transactionId: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
          Einstellungen
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Tracking-Debug
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          Interner Funnel und Meta-CAPI-Deliveries der letzten 7 Tage. Ideal für Testkäufe und
          iframe-Attribution (schlagerfeeling.de).
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
        <h2 className="font-semibold text-[var(--tf-navy)]">Funnel-Stufen (7 Tage)</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {FUNNEL_STAGES.map((stage) => (
            <li
              key={stage.name}
              className="flex items-center justify-between rounded-xl border border-[var(--tf-line)] px-3 py-2 text-sm"
            >
              <span>
                {stage.label}
                {mapToMeta(stage.name) ? (
                  <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                    Meta: {mapToMeta(stage.name)!.name}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold text-[var(--tf-navy)]">{counts[stage.name] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
        <h2 className="font-semibold text-[var(--tf-navy)]">Testkauf prüfen</h2>
        <form className="mt-3 flex flex-wrap gap-2" method="get">
          <input
            name="orderId"
            defaultValue={orderId ?? ""}
            placeholder="Order-UUID"
            className="tf-input max-w-md flex-1"
          />
          <button type="submit" className="tf-btn tf-btn-primary !min-h-10 text-sm">
            Anzeigen
          </button>
        </form>
        {orderFunnel.length > 0 ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--tf-text-secondary)]">
                <th className="py-2">Stufe</th>
                <th>Intern</th>
                <th>Meta CAPI</th>
              </tr>
            </thead>
            <tbody>
              {orderFunnel.map((row) => (
                <tr key={row.stage} className="border-t border-[var(--tf-line)]">
                  <td className="py-2">
                    {row.label}
                    {row.metaName ? (
                      <span className="block text-xs text-[var(--tf-text-secondary)]">
                        {row.metaName}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Check ok={row.internal} />
                  </td>
                  <td>
                    <Check ok={row.metaCapi} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
        <h2 className="font-semibold text-[var(--tf-navy)]">Letzte Deliveries</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--tf-text-secondary)]">
                <th className="py-2">Zeit</th>
                <th>Kanal</th>
                <th>Event</th>
                <th>Status</th>
                <th>event_id</th>
              </tr>
            </thead>
            <tbody>
              {recentDeliveries.map((d) => (
                <tr key={d.id} className="border-t border-[var(--tf-line)]">
                  <td className="py-2 whitespace-nowrap">
                    {d.createdAt.toLocaleString("de-DE")}
                  </td>
                  <td>{d.channel}</td>
                  <td>{d.trackingEvent.name}</td>
                  <td>{d.status}</td>
                  <td className="font-mono text-xs">{d.trackingEvent.eventId.slice(0, 8)}…</td>
                </tr>
              ))}
              {recentDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--tf-text-secondary)]">
                    Noch keine Deliveries — Testkauf mit Marketing-Consent durchspielen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--tf-text-secondary)]">
          Meta Events Manager +{" "}
          <Link href="/admin/einstellungen/embed" className="underline">
            Embed-Loader
          </Link>{" "}
          nutzen. Spec: <code>docs/tracking-specification.md</code>
        </p>
      </div>
    </div>
  );
}
