import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { CustomerEditForm } from "@/components/admin/customer-edit-form";
import {
  channelLabel,
  isOrderCancelled,
  orderCancelledStrikeClass,
  orderStatusLabel,
  orderStatusToneClass,
} from "@/lib/commerce/channels";
import {
  customerDisplayEmail,
  isActiveTicketStatus,
  isOrderCountedInRevenue,
  isWalkInCustomerEmail,
} from "@/lib/commerce/customers";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return {
    title: customer ? `${customer.firstName} ${customer.lastName}` : "Kunde",
  };
}

export default async function AdminCustomerDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead =
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canEdit = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          // Include status so voided/cancelled tickets are not counted as "aktiv".
          tickets: { select: { id: true, status: true } },
          invoices: { take: 1, orderBy: { createdAt: "desc" } },
        },
      },
      user: { select: { id: true, email: true } },
    },
  });
  if (!customer) notFound();

  const email = customerDisplayEmail(customer.email);
  const walkIn = isWalkInCustomerEmail(customer.email);

  const cancelledOrders = customer.orders.filter((o) =>
    isOrderCancelled({ status: o.status, voidedAt: o.voidedAt }),
  );
  const revenueOrders = customer.orders.filter((o) => isOrderCountedInRevenue(o));
  const revenueCents = revenueOrders.reduce(
    (sum, o) => sum + (o.customerTotalCents || o.grossCents),
    0,
  );
  // Only this buyer's active tickets on paid/fulfilled orders (not voided/cancelled rows).
  const ticketCount = revenueOrders.reduce(
    (sum, o) => sum + o.tickets.filter((t) => isActiveTicketStatus(t.status)).length,
    0,
  );
  const eventNames = new Set(
    customer.orders.flatMap((o) => o.items.map((i) => i.eventNameSnapshot).filter(Boolean)),
  );
  const channels = new Set(customer.orders.map((o) => o.channel));
  const firstOrderAt =
    customer.orders.length > 0
      ? customer.orders.reduce(
          (earliest, o) => (o.createdAt < earliest ? o.createdAt : earliest),
          customer.orders[0]!.createdAt,
        )
      : null;
  const lastOrderAt =
    customer.orders.length > 0
      ? customer.orders.reduce(
          (latest, o) => (o.createdAt > latest ? o.createdAt : latest),
          customer.orders[0]!.createdAt,
        )
      : null;

  const berlin = (d: Date) =>
    d.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/kunden"
          className="text-sm text-[var(--muted)] underline underline-offset-2"
        >
          ← Alle Kunden
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          {customer.firstName} {customer.lastName}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {email ?? (walkIn ? "Walk-in ohne E-Mail" : "—")}
          {customer.user ? " · verknüpftes Konto" : null}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bestellungen" value={String(customer.orders.length)} />
        <StatCard
          label="Davon storniert"
          value={String(cancelledOrders.length)}
          accent={cancelledOrders.length > 0 ? "danger" : undefined}
        />
        <StatCard label="Umsatz (bezahlt)" value={formatEuroFromCents(revenueCents)} />
        <StatCard label="Tickets (aktiv)" value={String(ticketCount)} />
        <StatCard label="Events" value={String(eventNames.size)} />
        <StatCard
          label="Kanäle"
          value={
            channels.size
              ? [...channels].map((c) => channelLabel(c)).join(", ")
              : "—"
          }
        />
        <StatCard label="Erster Kauf" value={firstOrderAt ? berlin(firstOrderAt) : "—"} />
        <StatCard label="Letzter Kauf" value={lastOrderAt ? berlin(lastOrderAt) : "—"} />
      </section>

      <section className="tf-card">
        <h2 className="text-lg font-semibold text-[var(--gold-soft)]">Stammdaten</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          E-Mail ist die Kundenidentität und kann hier nicht geändert werden.
        </p>
        <div className="mt-4">
          <CustomerEditForm customer={customer} canEdit={canEdit} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--gold-soft)]">Bestellhistorie</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Alle Bestellungen inkl. Stornos — stornierte Vorgänge sind rot und durchgestrichen.
        </p>
        <div className="mt-4 space-y-2">
          {customer.orders.map((order) => {
            const cancelled = isOrderCancelled({
              status: order.status,
              voidedAt: order.voidedAt,
            });
            const strike = orderCancelledStrikeClass(cancelled);
            const detailHref = `/admin/orders/${order.id}`;
            const events = [...new Set(order.items.map((i) => i.eventNameSnapshot))].join(", ");
            const activeTicketCount = order.tickets.filter((t) =>
              isActiveTicketStatus(t.status),
            ).length;

            return (
              <div
                key={order.id}
                className={`tf-card text-sm ${cancelled ? "border-[var(--danger)]/40" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-semibold ${strike}`}>{order.orderNumber}</p>
                    <ChannelBadge channel={order.channel} />
                  </div>
                  <p className={orderStatusToneClass(cancelled)}>
                    {cancelled ? "Storniert" : orderStatusLabel(order.status)}
                  </p>
                </div>
                <p className={`mt-1 text-[var(--muted)] ${strike}`}>
                  {events || "—"} ·{" "}
                  {formatEuroFromCents(order.customerTotalCents || order.grossCents)} ·{" "}
                  {activeTicketCount} Tickets
                </p>
                <p className="text-xs text-[var(--muted)]">{berlin(order.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link href={detailHref} className="text-[var(--gold-soft)] underline">
                    Details
                  </Link>
                  {order.invoices[0] ? (
                    <a
                      href={`/api/v1/invoices/${order.invoices[0].id}/pdf`}
                      className="text-[var(--tf-teal-hover,#0D9488)] underline"
                    >
                      Rechnung {order.invoices[0].invoiceNumber}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
          {customer.orders.length === 0 ? (
            <p className="text-[var(--muted)]">Noch keine Bestellungen.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,0.03)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          accent === "danger" ? "text-[var(--danger)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
