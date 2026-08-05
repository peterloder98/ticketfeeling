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
import { TicketCalendarMenu } from "@/components/ticket-calendar-menu";
import { getWalletUiFlags } from "@/lib/wallet/config";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function TicketViewPage({ params, searchParams }: Props) {
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
    redirect("/login");
  }

  const accessToken = hasAccessToken ? sp.t! : null;
  const orderHref = withOrderAccessQuery(`/konto/bestellung/${ticket.orderId}`, accessToken);
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

  const token = ticket.qrTokens[0]?.token ?? "";
  const showQr = Boolean(token && canEntry);
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
  const doorsOpenLabel = ticket.event.doorsOpenAt
    ? ticket.event.doorsOpenAt.toLocaleTimeString("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const place = ticket.event.location
    ? [ticket.event.location.name, ticket.event.location.city].filter(Boolean).join(", ")
    : "—";
  const holder = `${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim();
  const placeFull = ticket.event.location
    ? [
        ticket.event.location.name,
        [ticket.event.location.street, ticket.event.location.houseNumber]
          .filter(Boolean)
          .join(" "),
        [ticket.event.location.postalCode, ticket.event.location.city]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.9)]">
      <div className="tf-container py-8 md:py-12">
        <Link
          href={orderHref}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--tf-navy)] transition hover:text-[var(--tf-teal-hover)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Zurück zur Bestellung
        </Link>

        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start">
          <article className="overflow-hidden rounded-[24px] border border-[var(--tf-line)] bg-white shadow-[0_12px_40px_rgba(15,39,71,0.08)]">
            <div className="bg-[var(--tf-navy)] px-6 py-5 md:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold tracking-[0.16em] text-[var(--tf-teal)]">
                  TICKETFEELING
                </p>
                <span className="rounded-full bg-[rgba(20,184,166,0.2)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--tf-teal)]">
                  {transferred && !canEntry ? "Weitergeleitet" : "Einlassticket"}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-white md:text-3xl">
                {ticket.eventNameSnapshot}
              </h1>
            </div>
            <div className="h-1 bg-[var(--tf-teal)]" />

            <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                    Kategorie
                  </dt>
                  <dd className="mt-0.5 font-semibold text-[var(--tf-navy)]">
                    {ticket.categorySnapshot}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                    Beginn
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--tf-navy)]">{when}</dd>
                </div>
                {doorsOpenLabel ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                      Einlasszeit
                    </dt>
                    <dd className="mt-0.5 font-medium text-[var(--tf-navy)]">
                      ab {doorsOpenLabel} Uhr
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                    Location
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--tf-navy)]">{place}</dd>
                </div>
                {ticket.seatLabel ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                      Platz
                    </dt>
                    <dd className="mt-0.5 font-semibold text-[var(--tf-teal-hover)]">
                      {ticket.seatLabel}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                    Ticketnr.
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--tf-navy)]">{ticket.ticketNumber}</dd>
                </div>
                {holder ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--tf-text-secondary)]">
                      Inhaber
                    </dt>
                    <dd className="mt-0.5 font-medium text-[var(--tf-navy)]">{holder}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-5">
                {showQr ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                      QR-Code zum Einlass
                    </p>
                    <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
                      <TicketQrImage token={token} size={220} />
                    </div>
                    <p className="mt-3 max-w-xs text-center text-xs text-[var(--tf-text-secondary)]">
                      Am Einlass vorzeigen. Screenshot oder Ausdruck reicht.
                    </p>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[var(--tf-navy)]">
                      Ticket weitergeleitet
                    </p>
                    <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
                      {holder
                        ? `Dieses Ticket gehört jetzt ${holder}. QR-Code und PDF sind nur noch für die Empfängerin / den Empfänger verfügbar.`
                        : "QR-Code und PDF sind nach der Weiterleitung nur noch für die Empfängerin / den Empfänger verfügbar."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </article>

          <aside className="space-y-3 lg:sticky lg:top-28">
            {canEntry ? (
              <a
                href={pdfHref}
                className="tf-btn tf-btn-primary flex w-full !min-h-12 justify-center"
                target="_blank"
                rel="noreferrer"
              >
                PDF speichern
              </a>
            ) : (
              <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-3 text-sm text-[var(--tf-text-secondary)]">
                PDF gesperrt — Ticket wurde weitergeleitet
                {holder ? ` an ${holder}` : ""}.
              </p>
            )}
            {canEntry && ticket.event.eventStartsAt ? (
              <TicketCalendarMenu
                icsHref={calendarHref}
                fullWidth
                event={{
                  title: ticket.eventNameSnapshot || ticket.event.name,
                  startsAtIso: ticket.event.eventStartsAt.toISOString(),
                  endsAtIso: ticket.event.eventEndsAt?.toISOString() ?? null,
                  locationLabel: placeFull,
                  description: [
                    `Ticket ${ticket.ticketNumber}${
                      ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""
                    } · ${ticket.categorySnapshot}`,
                    doorsOpenLabel ? `Einlass ab ${doorsOpenLabel} Uhr` : null,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                }}
              />
            ) : null}
            {showQr ? (
              <TicketWalletButtons
                ticketId={ticket.id}
                accessToken={accessToken}
                appleEnabled={walletFlags.apple}
                googleEnabled={walletFlags.google}
                size="md"
              />
            ) : null}
            <Link
              href={orderHref}
              className="tf-btn tf-btn-secondary flex w-full !min-h-12 justify-center"
            >
              Zur Bestellung
            </Link>
            <p className="text-center text-xs text-[var(--tf-text-secondary)] lg:text-left">
              Bestellung {ticket.order.orderNumber}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
