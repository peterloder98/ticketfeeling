import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
import { loadTicketFaceEmbed } from "@/lib/commerce/ticket-document";
import { ensureTicketHeroImageColumn } from "@/lib/commerce/ensure-ticket-hero";
import { ensureTicketSponsorLogoColumns } from "@/lib/commerce/ensure-ticket-sponsor-logos";
import { TicketFace } from "@/components/ticket-face";
import { TicketPdfSaveLink } from "@/components/ticket-pdf-save-link";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function TicketViewPage({ params, searchParams }: Props) {
  await Promise.all([ensureTicketHeroImageColumn(), ensureTicketSponsorLogoColumns()]);
  const session = await getServerSession(authOptions);
  const { ticketId } = await params;
  const sp = await searchParams;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true } },
      holder: true,
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

  const holderHint = [ticket.holder?.firstName, ticket.holder?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const transferredMessage = !canEntry
    ? holderHint
      ? `Dieses Ticket gehört jetzt ${holderHint}. QR-Code und PDF sind nur noch für die Empfängerin / den Empfänger verfügbar.`
      : "QR-Code und PDF sind nach der Weiterleitung nur noch für die Empfängerin / den Empfänger verfügbar."
    : null;

  const face = await loadTicketFaceEmbed(ticket.id, {
    showQr: canEntry,
    qrUnavailableMessage: transferredMessage,
  });
  const data = face.data;
  const showQr = Boolean(data.qrToken && canEntry);
  const walletFlags = getWalletUiFlags();
  const holder = data.holderName;

  const placeFull = data.locationLines.join(", ");

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

        <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:items-start lg:gap-5">
          <TicketFace face={face} />

          <aside className="mx-auto w-full max-w-sm space-y-2 lg:mx-0 lg:max-w-none lg:sticky lg:top-6">
            {canEntry ? (
              <TicketPdfSaveLink
                href={pdfHref}
                className="tf-btn tf-btn-primary flex w-full !min-h-10 justify-center text-sm"
                filename={`${data.ticketNumber}.pdf`}
              />
            ) : (
              <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5 text-sm text-[var(--tf-text-secondary)]">
                PDF gesperrt — Ticket wurde weitergeleitet
                {holder ? ` an ${holder}` : ""}.
              </p>
            )}

            {canEntry && ticket.event.eventStartsAt ? (
              <TicketCalendarMenu
                icsHref={calendarHref}
                fullWidth
                buttonLabel="Kalender"
                event={{
                  title: data.eventName || ticket.event.name,
                  startsAtIso: ticket.event.eventStartsAt.toISOString(),
                  endsAtIso: ticket.event.eventEndsAt?.toISOString() ?? null,
                  locationLabel: placeFull || null,
                  description: [
                    `Ticket ${data.ticketNumber} · ${data.placeLabel} · ${data.categoryName}`,
                    data.doors.headline
                      ? `${data.doors.headline}${data.doors.timeLabel ? " Uhr" : ""}`
                      : null,
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
                size="sm"
                className="justify-center gap-x-3 pt-0.5"
              />
            ) : null}

            <p className="text-center text-xs text-[var(--tf-text-secondary)] lg:text-left">
              Bestellung {data.orderNumber}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
