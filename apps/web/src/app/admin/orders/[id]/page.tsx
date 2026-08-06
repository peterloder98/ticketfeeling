import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { BoxOfficeTicketVoidPanel } from "@/components/box-office-ticket-void";
import {
  channelShortHint,
  isOrderCancelled,
  orderCancelledStrikeClass,
  orderStatusLabel,
  orderStatusToneClass,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { formatDeDateTime } from "@/lib/datetime-de";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function berlinDateTime(d: Date) {
  return formatDeDateTime(d, {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { orderNumber: true },
  });
  return { title: order?.orderNumber ? `${order.orderNumber} · Bestellung` : "Bestellung" };
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canVoidTickets =
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, organizationId: membership.organizationId },
    include: {
      customer: true,
      tickets: true,
      items: {
        orderBy: { id: "asc" },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              eventStartsAt: true,
              location: { select: { name: true, city: true } },
            },
          },
        },
      },
      invoices: { take: 1, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) notFound();

  const cancelled = isOrderCancelled({
    status: order.status,
    voidedAt: order.voidedAt,
  });
  const strike = orderCancelledStrikeClass(cancelled);
  const payment = order.payments[0];
  const kaufdatum = berlinDateTime(order.paidAt ?? order.createdAt);

  const primary = order.items[0];
  const eventName = primary?.eventNameSnapshot ?? primary?.event.name ?? "—";
  const terminDate = primary?.eventStartsAtSnapshot ?? primary?.event.eventStartsAt ?? null;
  const termin = terminDate ? berlinDateTime(terminDate) : "Termin offen";
  const locationName =
    primary?.event.location?.name ??
    (primary?.locationSnapshot?.split(",")[0]?.trim() || null);
  const ort =
    primary?.event.location?.city ??
    (primary?.locationSnapshot?.includes(",")
      ? primary.locationSnapshot.split(",").slice(1).join(",").trim() || null
      : null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← Alle Bestellungen
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className={`text-3xl font-semibold tracking-tight text-[var(--tf-navy)] ${strike}`}>
            {order.orderNumber}
          </h1>
          <ChannelBadge channel={order.channel} />
          <span className={orderStatusToneClass(cancelled)}>
            {cancelled ? "Storniert" : orderStatusLabel(order.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          {channelShortHint(order.channel)} · {formatEuroFromCents(order.grossCents)} ·{" "}
          {order.tickets.length} Tickets
        </p>
      </div>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Event</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Event
            </dt>
            <dd className={`mt-1 text-sm font-medium text-[var(--tf-navy)] ${strike}`}>
              {eventName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Termin
            </dt>
            <dd className={`mt-1 text-sm text-[var(--tf-text)] ${strike}`}>{termin}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Location
            </dt>
            <dd className={`mt-1 text-sm text-[var(--tf-text)] ${strike}`}>
              {locationName ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Ort
            </dt>
            <dd className={`mt-1 text-sm text-[var(--tf-text)] ${strike}`}>{ort ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Bestellung</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Kaufdatum
            </dt>
            <dd className={`mt-1 text-sm text-[var(--tf-text)] ${strike}`}>{kaufdatum}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Zahlung
            </dt>
            <dd className="mt-1 text-sm text-[var(--tf-text)]">
              {paymentMethodLabel(payment?.method)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="tf-card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Kunde</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Vorname
            </dt>
            <dd className="mt-1 text-sm text-[var(--tf-text)]">{order.customer.firstName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              Nachname
            </dt>
            <dd className="mt-1 text-sm text-[var(--tf-text)]">{order.customer.lastName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
              E-Mail
            </dt>
            <dd className="mt-1 text-sm text-[var(--tf-text)]">
              <a
                href={`mailto:${order.customer.email}`}
                className="text-[var(--tf-teal)] underline"
              >
                {order.customer.email}
              </a>
            </dd>
          </div>
        </dl>
        <Link
          href={`/admin/kunden/${order.customer.id}`}
          className="inline-block text-sm font-medium text-[var(--tf-navy)] underline"
        >
          Kundenprofil öffnen
        </Link>
      </section>

      {order.items.length > 0 ? (
        <section className="tf-card space-y-3">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Positionen</h2>
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--tf-line)] pb-2 text-sm last:border-0 last:pb-0 ${strike}`}
              >
                <span>
                  {item.quantity}× {item.categorySnapshot}
                  <span className="text-[var(--tf-text-secondary)]">
                    {" "}
                    · {item.eventNameSnapshot}
                  </span>
                </span>
                <span className="font-medium text-[var(--tf-navy)]">
                  {formatEuroFromCents(item.grossCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.tickets.length > 0 ? (
        <section className="tf-card space-y-3">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Tickets</h2>
          <ul className="space-y-2 text-sm">
            {order.tickets.map((t) => (
              <li
                key={t.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 ${
                  t.status === "voided" ? "text-[var(--tf-text-secondary)] line-through" : ""
                }`}
              >
                <span className="font-mono">{t.ticketNumber}</span>
                <span>
                  {t.categorySnapshot}
                  {t.seatLabel ? ` · ${t.seatLabel}` : ""}
                  {t.status === "voided" ? " · storniert" : ""}
                  {t.presence === "in" ? " · eingecheckt" : ""}
                </span>
              </li>
            ))}
          </ul>
          {canVoidTickets && order.channel === "box_office" && !cancelled ? (
            <div className="border-t border-[var(--tf-line)] pt-4">
              <BoxOfficeTicketVoidPanel
                orderId={order.id}
                voided={Boolean(order.voidedAt)}
                compact
                tickets={order.tickets.map((t) => ({
                  id: t.id,
                  ticketNumber: t.ticketNumber,
                  categorySnapshot: t.categorySnapshot,
                  status: t.status,
                  presence: t.presence,
                  seatLabel: t.seatLabel,
                }))}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {order.channel === "box_office" ? (
          <Link href={`/kasse/beleg/${order.id}`} className="tf-btn tf-btn-secondary !min-h-10 text-sm">
            Kassenbeleg
          </Link>
        ) : (
          <Link
            href={`/konto/bestellung/${order.id}`}
            className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          >
            Kundenansicht
          </Link>
        )}
        {order.invoices[0] ? (
          <a
            href={`/api/v1/invoices/${order.invoices[0].id}/pdf`}
            className="tf-btn tf-btn-primary !min-h-10 text-sm"
          >
            Rechnung {order.invoices[0].invoiceNumber}
          </a>
        ) : null}
      </div>
    </div>
  );
}
