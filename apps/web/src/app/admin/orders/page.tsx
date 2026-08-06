import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
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

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ channel?: string }> };

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

  const orders = await prisma.order.findMany({
    where: {
      organizationId: membership.organizationId,
      ...(channel ? { channel } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      customer: true,
      tickets: true,
      items: true,
      invoices: { take: 1, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const filters = [
    { href: "/admin/orders", label: "Alle", active: !channel },
    {
      href: "/admin/orders?channel=online",
      label: "Online",
      active: channel === "online",
    },
    {
      href: "/admin/orders?channel=box_office",
      label: "Tageskasse",
      active: channel === "box_office",
    },
  ];

  return (
    <div>
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

      <div className="mt-4 flex flex-wrap gap-2">
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

      <div className="mt-6 space-y-2">
        {orders.map((order) => {
          const payment = order.payments[0];
          const cancelled = isOrderCancelled({
            status: order.status,
            voidedAt: order.voidedAt,
          });
          const strike = orderCancelledStrikeClass(cancelled);
          const item = order.items[0];
          const termin = item?.eventStartsAtSnapshot
            ? formatDeDateTime(item.eventStartsAtSnapshot, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : null;
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
                {item?.eventNameSnapshot ?? "—"}
                {termin ? ` · ${termin}` : ""}
                {item?.locationSnapshot ? ` · ${item.locationSnapshot}` : ""}
              </p>
              <p className={`text-[var(--muted)] ${strike}`}>
                {order.customer.firstName} {order.customer.lastName} · {order.customer.email} ·{" "}
                {formatEuroFromCents(order.grossCents)} · {order.tickets.length} Tickets
                {order.channel === "box_office"
                  ? ` · ${paymentMethodLabel(payment?.method)}`
                  : ""}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Kaufdatum:{" "}
                {(order.paidAt ?? order.createdAt).toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                })}
                {order.channel === "box_office" ? " · vor Ort" : " · Online-Selbstkauf"}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href={`/admin/orders/${order.id}`} className="text-[var(--gold-soft)] underline">
                  Details
                </Link>
                <Link
                  href={`/admin/kunden/${order.customer.id}`}
                  className="text-[var(--muted)] underline"
                >
                  Kunde
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
        {orders.length === 0 ? (
          <p className="text-[var(--muted)]">
            Keine Bestellungen{channel ? ` für ${channelLabel(channel)}` : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
