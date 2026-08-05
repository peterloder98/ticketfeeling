import { NextResponse } from "next/server";
import { authorizeTicketWalletDownload } from "@/lib/wallet/access";
import { prisma } from "@/lib/db";
import { buildTicketIcs } from "@/lib/commerce/ticket-calendar";
import { getPublicAppUrl } from "@/lib/embed/public-url";

type Params = { params: Promise<{ ticketId: string }> };

/**
 * GET /api/v1/tickets/[ticketId]/calendar
 * Download .ics for the ticket event (same auth as wallet/PDF).
 */
export async function GET(request: Request, { params }: Params) {
  const { ticketId } = await params;
  const auth = await authorizeTicketWalletDownload(ticketId, request.url);
  if (!auth.ok) {
    return NextResponse.json({ error: { code: auth.code } }, { status: auth.status });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true } },
    },
  });
  if (!ticket?.event.eventStartsAt) {
    return NextResponse.json({ error: { code: "NO_EVENT_DATE" } }, { status: 400 });
  }

  const loc = ticket.event.location;
  const locationLabel = loc
    ? [
        loc.name,
        [loc.street, loc.houseNumber].filter(Boolean).join(" "),
        [loc.postalCode, loc.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const appBase = getPublicAppUrl();
  const accessToken = new URL(request.url).searchParams.get("t");
  const ticketUrl = accessToken
    ? `${appBase}/ticket/${ticket.id}?t=${encodeURIComponent(accessToken)}`
    : `${appBase}/ticket/${ticket.id}`;

  const doorsOpen = ticket.event.doorsOpenAt
    ? ticket.event.doorsOpenAt.toLocaleTimeString("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const descriptionParts = [
    `Ticket ${ticket.ticketNumber}${
      ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""
    } · ${ticket.categorySnapshot}`,
    doorsOpen ? `Einlass ab ${doorsOpen} Uhr` : null,
  ].filter(Boolean);

  const ics = buildTicketIcs({
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    eventName: ticket.eventNameSnapshot || ticket.event.name,
    startsAt: ticket.event.eventStartsAt,
    endsAt: ticket.event.eventEndsAt,
    locationLabel,
    description: descriptionParts.join("\n"),
    url: ticketUrl,
  });

  return new NextResponse(ics.body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ics.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
