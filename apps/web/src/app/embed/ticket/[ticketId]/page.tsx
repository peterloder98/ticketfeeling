import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TicketQrImage } from "@/components/ticket-qr-image";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  canUseTicketEntryWithGuestToken,
  isTicketParty,
  isTicketTransferred,
} from "@/lib/tickets/access";
import { verifyOrderAccessToken, withOrderAccessQuery } from "@/lib/commerce/order-access";
import { TicketWalletButtons } from "@/components/ticket-wallet-buttons";
import { getWalletUiFlags } from "@/lib/wallet/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

type Props = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ t?: string }>;
};

/**
 * Embed ticket view — guests use the checkout access token (`?t=`), no login required.
 */
export default async function EmbedTicketPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { ticketId } = await params;
  const sp = await searchParams;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true } },
      holder: true,
      qrTokens: { where: { status: "active" }, take: 1 },
      order: { include: { customer: true } },
    },
  });
  if (!ticket) notFound();

  let isStaff = false;
  if (session?.user) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership?.organizationId === ticket.organizationId) {
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "checkin:scan"));
    }
  }

  const hasAccessToken = verifyOrderAccessToken(ticket.orderId, sp.t);
  const isParty =
    Boolean(session?.user) &&
    isTicketParty({
      sessionUserId: session!.user!.id,
      sessionEmail: session!.user!.email,
      holder: ticket.holder,
      orderCustomer: ticket.order.customer,
    });

  if (!isStaff && !isParty && !hasAccessToken) {
    redirect("/embed/shop");
  }

  const accessToken = hasAccessToken ? sp.t! : null;
  const orderHref = withOrderAccessQuery(`/embed/bestellung/${ticket.orderId}`, accessToken);
  const pdfHref = withOrderAccessQuery(`/api/v1/tickets/${ticket.id}/pdf`, accessToken);
  const calendarHref = withOrderAccessQuery(
    `/api/v1/tickets/${ticket.id}/calendar`,
    accessToken,
  );

  const transferred = isTicketTransferred({
    holderCustomerId: ticket.holderCustomerId,
    orderCustomerId: ticket.order.customerId,
  });
  const canEntry = canUseTicketEntryWithGuestToken({
    sessionUserId: session?.user?.id,
    sessionEmail: session?.user?.email,
    holder: ticket.holder,
    isStaff,
    hasAccessToken,
    transferred,
  });

  const showQr = Boolean(ticket.qrTokens[0]?.token && canEntry);

  const token = ticket.qrTokens[0]?.token ?? "";
  const walletFlags = getWalletUiFlags();
  const when = ticket.event.eventStartsAt
    ? ticket.event.eventStartsAt.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const place = ticket.event.location
    ? [ticket.event.location.name, ticket.event.location.city].filter(Boolean).join(", ")
    : "—";
  const holder = `${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim();

  return (
    <div className="space-y-4 text-sm">
      <Link
        href={orderHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--tf-navy)] hover:text-[var(--tf-teal)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Zurück zur Bestellung
      </Link>

      <article className="overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white">
        <div className="bg-[var(--tf-navy)] px-4 py-3">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--tf-teal)]">TICKET</p>
          <h1 className="mt-1 text-base font-bold text-white">{ticket.eventNameSnapshot}</h1>
        </div>
        <div className="h-1 bg-[var(--tf-teal)]" />
        <div className="space-y-4 p-4">
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Kategorie</dt>
              <dd className="font-semibold text-[var(--tf-navy)]">{ticket.categorySnapshot}</dd>
            </div>
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Beginn</dt>
              <dd className="font-medium text-[var(--tf-navy)]">{when}</dd>
            </div>
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Location</dt>
              <dd className="font-medium text-[var(--tf-navy)]">{place}</dd>
            </div>
            {ticket.seatLabel ? (
              <div>
                <dt className="text-[var(--tf-text-secondary)]">Platz</dt>
                <dd className="font-semibold text-[var(--tf-teal-hover)]">{ticket.seatLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[var(--tf-text-secondary)]">Ticketnr.</dt>
              <dd className="font-medium text-[var(--tf-navy)]">{ticket.ticketNumber}</dd>
            </div>
            {holder ? (
              <div>
                <dt className="text-[var(--tf-text-secondary)]">Inhaber</dt>
                <dd className="font-medium text-[var(--tf-navy)]">{holder}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-col items-center rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-4">
            {showQr && token ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                  QR-Code zum Einlass
                </p>
                <div className="mt-2 rounded-xl bg-white p-2 shadow-sm">
                  <TicketQrImage token={token} size={180} />
                </div>
                <p className="mt-2 max-w-xs text-center text-[11px] text-[var(--tf-text-secondary)]">
                  Am Einlass vorzeigen. Screenshot oder Ausdruck reicht.
                </p>
              </>
            ) : (
              <p className="text-center text-xs text-[var(--tf-text-secondary)]">
                {transferred
                  ? `Ticket weitergeleitet${holder ? ` an ${holder}` : ""} — QR nur für Empfänger.`
                  : "QR-Code nicht verfügbar."}
              </p>
            )}
          </div>

          {showQr ? (
            <>
              <a href={pdfHref} className="tf-btn tf-btn-primary w-full !min-h-10 text-sm" target="_blank" rel="noreferrer">
                PDF speichern
              </a>
              {ticket.event.eventStartsAt ? (
                <a href={calendarHref} className="tf-btn tf-btn-secondary w-full !min-h-10 text-sm">
                  Zum Kalender
                </a>
              ) : null}
              <TicketWalletButtons
                ticketId={ticket.id}
                accessToken={accessToken}
                appleEnabled={walletFlags.apple}
                googleEnabled={walletFlags.google}
              />
            </>
          ) : null}
        </div>
      </article>
    </div>
  );
}
