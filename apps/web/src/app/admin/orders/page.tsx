import Link from "next/link";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { BuyerHeatmap } from "@/components/admin/buyer-heatmap";
import { loadBuyerHeatmapPoints } from "@/lib/admin/load-buyer-heatmap";
import {
  channelLabel,
  channelShortHint,
  isOrderCancelled,
  orderCancelledStrikeClass,
  orderStatusLabel,
  orderStatusToneClass,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { formatDeDateTime } from "@/lib/datetime-de";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    channel?: string;
    q?: string;
    hmPeriod?: string;
    hmFrom?: string;
    hmTo?: string;
  }>;
};

function purchaseAt(order: { paidAt: Date | null; createdAt: Date }) {
  return order.paidAt ?? order.createdAt;
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const sp = await searchParams;
  const channel =
    sp.channel === "box_office" || sp.channel === "online" || sp.channel === "internal"
      ? sp.channel
      : null;
  const q = String(sp.q ?? "").trim();

  const where: Prisma.OrderWhereInput = {
    organizationId: membership.organizationId,
    ...(channel ? { channel } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customer: { firstName: { contains: q, mode: "insensitive" } } },
            { customer: { lastName: { contains: q, mode: "insensitive" } } },
            { customer: { email: { contains: q, mode: "insensitive" } } },
            { customer: { emailNormalized: { contains: q.toLowerCase() } } },
            {
              items: {
                some: { eventNameSnapshot: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [orders, heatmap] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 80,
      include: {
        customer: true,
        tickets: true,
        items: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    loadBuyerHeatmapPoints({
      organizationId: membership.organizationId,
      period: sp.hmPeriod,
      from: sp.hmFrom,
      to: sp.hmTo,
    }),
  ]);

  // Prefer newest purchase (paidAt) — null paidAt falls back via secondary createdAt
  orders.sort((a, b) => purchaseAt(b).getTime() - purchaseAt(a).getTime());

  const filters = [
    { href: q ? `/admin/orders?q=${encodeURIComponent(q)}` : "/admin/orders", label: "Alle", active: !channel },
    {
      href: `/admin/orders?channel=online${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      label: "Online",
      active: channel === "online",
    },
    {
      href: `/admin/orders?channel=box_office${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      label: "Tageskasse",
      active: channel === "box_office",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
            Bestellungen
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {channel
              ? `${channelLabel(channel)} — ${channelShortHint(channel)}`
              : "Online-Selbstkauf und Tageskasse getrennt gekennzeichnet."}
          </p>
        </div>
        <Link href="/kasse#verkaeufe" className="tf-btn tf-btn-secondary !py-2 text-sm">
          Tageskasse
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {channel ? <input type="hidden" name="channel" value={channel} /> : null}
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="tf-label">Suche</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Bestellnr., Name, E-Mail, Event…"
            className="tf-input mt-1 w-full"
          />
        </label>
        <button type="submit" className="tf-btn tf-btn-primary !min-h-10 text-sm">
          Suchen
        </button>
        {q ? (
          <Link
            href={channel ? `/admin/orders?channel=${channel}` : "/admin/orders"}
            className="tf-admin-link text-sm"
          >
            Zurücksetzen
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filter.active
                ? "border-[var(--gold)] bg-[rgba(212,175,55,0.12)] text-[var(--gold-soft)]"
                : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Suspense fallback={null}>
        <BuyerHeatmap
          title="Käufer-Heatmap (alle Events)"
          points={heatmap.points}
          orderCount={heatmap.orderCount}
          withGeo={heatmap.withGeo}
          periodKey={heatmap.periodKey}
          periodLabel={heatmap.periodLabel}
          paramPrefix="hm"
        />
      </Suspense>

      <div className="space-y-3">
        {orders.map((order) => {
          const payment = order.payments[0];
          const cancelled = isOrderCancelled({
            status: order.status,
            voidedAt: order.voidedAt,
          });
          const strike = orderCancelledStrikeClass(cancelled);
          const item = order.items[0];
          const when = purchaseAt(order);
          const kaufdatum = formatDeDateTime(when, {
            dateStyle: "medium",
            timeStyle: "short",
          });

          return (
            <div
              key={order.id}
              className={`tf-card !p-5 ${cancelled ? "border-[var(--danger)]/40" : ""}`}
            >
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
                Kaufdatum
              </p>
              <p className={`mt-0.5 text-base font-semibold text-[var(--tf-navy)] ${strike}`}>
                {kaufdatum}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-medium text-[var(--tf-navy)] ${strike}`}>
                    {order.orderNumber}
                  </p>
                  <ChannelBadge channel={order.channel} />
                </div>
                <p className={orderStatusToneClass(cancelled)}>
                  {cancelled ? "Storniert" : orderStatusLabel(order.status)}
                </p>
              </div>

              <p className={`mt-2 text-sm text-[var(--tf-text)] ${strike}`}>
                {item?.eventNameSnapshot ?? "—"}
              </p>
              <p className={`mt-1 text-sm text-[var(--tf-text-secondary)] ${strike}`}>
                {order.customer.firstName} {order.customer.lastName}
                <span className="text-[var(--tf-text-secondary)]"> · </span>
                {order.customer.email}
              </p>
              <p className={`mt-1 text-sm text-[var(--tf-navy)] ${strike}`}>
                {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
                <span className="font-normal text-[var(--tf-text-secondary)]">
                  {" "}
                  · {order.tickets.length}{" "}
                  {order.tickets.length === 1 ? "Ticket" : "Tickets"}
                  {order.channel === "box_office"
                    ? ` · ${paymentMethodLabel(payment?.method)}`
                    : ""}
                </span>
              </p>

              <div className="mt-4">
                <Link href={`/admin/orders/${order.id}`} className="tf-admin-link text-sm">
                  Details
                </Link>
              </div>
            </div>
          );
        })}
        {orders.length === 0 ? (
          <p className="text-[var(--muted)]">
            Keine Bestellungen
            {channel ? ` für ${channelLabel(channel)}` : ""}
            {q ? ` zu „${q}“` : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
