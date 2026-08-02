import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { TicketQrImage } from "@/components/ticket-qr-image";
import { BoxOfficeDeliveryActions } from "@/components/box-office-delivery-actions";
import {
  boxOfficeSaleStatusLabel,
  channelShortHint,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { canSellAllBoxOfficeEvents } from "@/lib/commerce/box-office-access";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

export default async function BoxOfficeReceiptPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");

  const canView =
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
  if (!canView) {
    return <p className="tf-container py-8 text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const { orderId } = await params;
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId: membership.organizationId,
      channel: "box_office",
    },
    include: {
      customer: true,
      items: true,
      tickets: {
        include: {
          qrTokens: { where: { status: "active" }, take: 1 },
        },
      },
      invoices: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      fiscalTransactions: { orderBy: { createdAt: "desc" }, take: 1 },
      soldByUser: { select: { name: true, email: true } },
    },
  });
  if (!order) notFound();

  const fullAccess = await canSellAllBoxOfficeEvents(
    session.user.id,
    membership.organizationId,
  );
  if (!fullAccess && order.soldByUserId !== session.user.id) {
    return <p className="tf-container py-8 text-[var(--danger)]">Kein Zugriff auf diesen Beleg.</p>;
  }

  const payment = order.payments[0];
  const fiscal = order.fiscalTransactions[0];
  const voided = Boolean(order.voidedAt);
  const contract =
    order.contractSnapshot && typeof order.contractSnapshot === "object"
      ? (order.contractSnapshot as {
          cashTenderedCents?: number | null;
          changeCents?: number | null;
        })
      : null;
  const eventIdForList = order.items[0]?.eventId ?? null;

  function fiscalStatusText() {
    if (!fiscal) {
      return "Kein TSE-Eintrag — Vorgang ohne FiscalTransaction erfasst.";
    }
    const parts = [`TSE ${fiscal.provider}`, `Status ${fiscal.status}`];
    if (fiscal.signatureCounter != null) {
      parts.push(`Zähler ${fiscal.signatureCounter}`);
    }
    if (fiscal.tssId) parts.push(`TSS ${fiscal.tssId}`);
    if (fiscal.errorMessage) parts.push(fiscal.errorMessage);
    else if (typeof fiscal.raw === "object" && fiscal.raw && "note" in fiscal.raw) {
      parts.push(String((fiscal.raw as { note?: string }).note));
    }
    return parts.filter(Boolean).join(" · ");
  }

  return (
    <div className={`tf-container max-w-2xl space-y-6 py-8 ${voided ? "opacity-70" : ""}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={order.channel} />
          <span
            className={`text-xs ${voided ? "line-through text-[var(--danger)]" : "text-[var(--tf-text-secondary)]"}`}
          >
            {boxOfficeSaleStatusLabel({
              voided,
              deliveryStatus: order.deliveryStatus,
              orderStatus: order.status,
            })}
          </span>
        </div>
        <h1
          className={`mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl ${
            voided ? "line-through" : ""
          }`}
        >
          {voided ? "Storniert" : "Vorgang abgeschlossen"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Beleg {order.orderNumber} · {channelShortHint("box_office")}
        </p>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          {order.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Zahlung:{" "}
          {paymentMethodLabel(payment?.method)}
          {order.soldByUser
            ? ` · Verkäufer: ${order.soldByUser.name ?? order.soldByUser.email}`
            : ""}
        </p>
      </div>

      <div id="ausgabe">
        <BoxOfficeDeliveryActions
          orderId={order.id}
          deliveryStatus={order.deliveryStatus}
          customerEmail={order.customer.email}
          ticketIds={order.tickets.map((t) => t.id)}
          voided={voided}
        />
      </div>

      <div
        className={`rounded-2xl border border-[var(--tf-line)] bg-white p-5 space-y-3 ${voided ? "line-through" : ""}`}
      >
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-4 text-sm">
            <div>
              <p className="font-semibold text-[var(--tf-navy)]">
                {item.quantity}× {item.categorySnapshot}
              </p>
              <p className="text-[var(--tf-text-secondary)]">{item.eventNameSnapshot}</p>
              {item.locationSnapshot ? (
                <p className="text-xs text-[var(--tf-text-secondary)]">{item.locationSnapshot}</p>
              ) : null}
            </div>
            <p className="tabular-nums">{formatEuroFromCents(item.grossCents)}</p>
          </div>
        ))}
        {(order.feeGrossCents ?? 0) > 0 ? (
          <div className="flex justify-between gap-4 text-sm text-[var(--tf-text-secondary)]">
            <span>Verwaltungsgebühr</span>
            <span className="tabular-nums">{formatEuroFromCents(order.feeGrossCents)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-[var(--tf-line)] pt-3 text-lg font-semibold text-[var(--tf-navy)]">
          <span>Gesamt</span>
          <span className="tabular-nums">
            {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
          </span>
        </div>
        {contract?.cashTenderedCents != null ? (
          <div className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
            Gegeben: {formatEuroFromCents(contract.cashTenderedCents)}
            {contract.changeCents != null
              ? ` · Wechselgeld: ${formatEuroFromCents(contract.changeCents)}`
              : ""}
          </div>
        ) : null}
        <p className="text-xs text-[var(--tf-text-secondary)]">
          Gast: {order.customer.firstName} {order.customer.lastName}
          {order.customer.email.includes("@ticketfeeling.local")
            ? " (ohne Kunden-E-Mail)"
            : ` · ${order.customer.email}`}
          {order.customer.street && order.customer.street !== "vor Ort"
            ? ` · ${order.customer.street} ${order.customer.houseNumber ?? ""}, ${order.customer.postalCode ?? ""} ${order.customer.city ?? ""}`
            : ""}
        </p>
      </div>

      {!voided ? (
        <div className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--gold-soft)]">
            Tickets mit QR
          </h2>
          {order.tickets.map((ticket) => (
            <div key={ticket.id} className="tf-card space-y-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-mono">{ticket.ticketNumber}</span>
                <span className="text-[var(--muted)]">
                  {ticket.categorySnapshot} · {ticket.presence}
                </span>
              </div>
              <TicketQrImage
                key={ticket.qrTokens[0]?.token ?? ticket.id}
                token={ticket.qrTokens[0]?.token ?? ""}
                size={200}
              />
              <Link href={`/ticket/${ticket.id}`} className="text-sm text-[var(--gold-soft)] underline">
                Ticketansicht öffnen
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--danger)]">
          Tickets entwertet — QR-Codes widerrufen, kein Einlass möglich.
        </p>
      )}

      <div className="rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--muted)]">
        <p className="font-semibold text-[var(--ink)]">TSE / Fiscal</p>
        <p className="mt-1">{fiscalStatusText()}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/kasse" className="tf-btn tf-btn-primary">
          Nächster Verkauf
        </Link>
        <Link
          href={
            eventIdForList
              ? `/kasse?eventId=${eventIdForList}#verkaeufe`
              : "/kasse#verkaeufe"
          }
          className="tf-btn tf-btn-secondary"
        >
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
