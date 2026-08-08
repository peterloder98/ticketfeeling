import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { getSalesStats } from "@/lib/commerce/stats";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import {
  channelLabel,
  isOrderCancelled,
  orderCancelledStrikeClass,
  orderStatusLabel,
  orderStatusToneClass,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { formatDeDateTime } from "@/lib/datetime-de";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

function purchaseAt(order: { paidAt: Date | null; createdAt: Date }) {
  return order.paidAt ?? order.createdAt;
}

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  const membership = session?.user
    ? await getDefaultOrganizationForUser(session.user.id)
    : null;

  if (!membership) {
    return <p className="text-[var(--muted)]">Keine Organisation zugeordnet.</p>;
  }

  const [stats, permissions] = await Promise.all([
    getSalesStats(membership.organizationId),
    getUserPermissionKeys(session!.user.id, membership.organizationId),
  ]);

  const cards = [
    { label: "Umsatz heute", value: formatEuroFromCents(stats.today.grossCents) },
    { label: "Tickets heute", value: String(stats.today.tickets) },
    { label: "Bestellungen heute", value: String(stats.today.orders) },
    { label: "Umsatz Monat", value: formatEuroFromCents(stats.month.grossCents) },
    { label: "Umsatz gesamt", value: formatEuroFromCents(stats.all.grossCents) },
    { label: "Ø Bestellwert", value: formatEuroFromCents(stats.all.avgOrderCents) },
    {
      label: "Zahlung offen oder fehlgeschlagen",
      value: String(stats.openOrFailedPayments),
      hint: "Bestellungen mit ausstehender oder fehlgeschlagener Zahlung",
    },
    {
      label: "Gestern",
      value: `${stats.yesterday.orders} / ${formatEuroFromCents(stats.yesterday.grossCents)}`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          {membership.organization.name} · Live-Kennzahlen aus Ticketfeeling
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/events" className="tf-btn tf-btn-primary !py-2 text-sm">
            Events
          </Link>
          <Link href="/kasse" className="tf-btn tf-btn-secondary !py-2 text-sm">
            Tageskasse
          </Link>
          <Link href="/admin/orders" className="tf-btn tf-btn-secondary !py-2 text-sm">
            Bestellungen
          </Link>
          <Link href="/scanner" className="tf-btn tf-btn-secondary !py-2 text-sm">
            Einlass-Scanner
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="tf-card">
            <p className="text-sm text-[var(--muted)]">{card.label}</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">{card.value}</p>
            {"hint" in card && card.hint ? (
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Letzte Bestellungen</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-[var(--tf-teal-hover)]">
            Alle Bestellungen →
          </Link>
        </div>

        {stats.recentOrders.map((order) => {
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
                {formatEuroFromCents(order.grossCents)}
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

        {stats.recentOrders.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Noch keine Bestellungen.</p>
        ) : null}
      </section>

      <div className="tf-card">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Kanäle</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {Object.entries(stats.byChannel).map(([channel, row]) => (
            <Link
              key={channel}
              href={`/admin/orders?channel=${channel}`}
              className="rounded-md border border-[var(--line)] px-3 py-1 hover:border-[var(--gold)]/40"
            >
              {channelLabel(channel)}: {row.orders} · {formatEuroFromCents(row.grossCents)}
            </Link>
          ))}
        </div>
      </div>

      <div className="tf-card">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Zugang</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Deine Rollenrechte in dieser Organisation.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...permissions].sort().map((key) => (
            <span
              key={key}
              className="rounded-full bg-[rgba(15,39,71,0.06)] px-2.5 py-1 text-xs text-[var(--tf-navy)]"
            >
              {key}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
