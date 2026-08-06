import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { getSalesStats } from "@/lib/commerce/stats";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { channelLabel } from "@/lib/commerce/channels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

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
    { label: "Offen/fehlgeschlagen", value: String(stats.openOrFailedPayments) },
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
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tf-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Restkontingente</h2>
            <Link href="/admin/events" className="text-sm font-medium text-[var(--tf-teal-hover)]">
              Alle Events →
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {stats.inventory.map((row) => (
              <Link
                key={`${row.eventId}-${row.categoryName}`}
                href={`/admin/events/${row.eventId}`}
                className="flex justify-between gap-2 rounded-lg px-1 py-1 hover:bg-[var(--tf-overlay)]"
              >
                <span className="text-[var(--tf-text-secondary)]">
                  {row.eventName} · {row.categoryName}
                  <span className="mt-0.5 block text-xs">
                    Online {row.onlineSold} · Tageskasse {row.boxOfficeSold} verkauft
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-medium text-[var(--tf-navy)]">
                  {row.available}/{row.capacity}
                </span>
              </Link>
            ))}
            {stats.inventory.length === 0 ? (
              <p className="text-[var(--tf-text-secondary)]">Keine Kontingente.</p>
            ) : null}
          </div>
        </section>

        <section className="tf-card">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Letzte Bestellungen</h2>
          <div className="mt-3 space-y-2 text-sm">
            {stats.recentOrders.map((order) => (
              <Link
                key={order.id}
                href={
                  order.channel === "box_office"
                    ? `/kasse/beleg/${order.id}`
                    : `/konto/bestellung/${order.id}`
                }
                className="flex justify-between gap-2 hover:text-[var(--gold-soft)]"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span>{order.orderNumber}</span>
                  <ChannelBadge channel={order.channel} />
                </span>
                <span>
                  {order.tickets.length} T. · {formatEuroFromCents(order.grossCents)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

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
