import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { readQrToken } from "@/lib/crypto-token";
import { formatDeDateTime } from "@/lib/datetime-de";

export type WalletTicketPayload = {
  ticketId: string;
  ticketNumber: string;
  status: string;
  categorySnapshot: string;
  eventNameSnapshot: string;
  seatLabel: string | null;
  seatRow: string | null;
  seatNumber: string | null;
  blockLabel: string | null;
  qrToken: string | null;
  holderName: string;
  organizationId: string;
  orderId: string;
  orderNumber: string;
  event: {
    id: string;
    name: string;
    startsAt: Date | null;
    endsAt: Date | null;
    doorsOpenAt: Date | null;
    locationName: string | null;
    locationCity: string | null;
    locationAddress: string | null;
  };
};

export async function loadWalletTicketPayload(
  ticketId: string,
  opts?: { includeRevokedQr?: boolean },
): Promise<WalletTicketPayload | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      holder: true,
      order: true,
      qrTokens: {
        where: opts?.includeRevokedQr ? undefined : { status: "active" },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      event: { include: { location: true } },
    },
  });
  if (!ticket) return null;

  const loc = ticket.event.location;
  const holderName = `${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim();

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    categorySnapshot: ticket.categorySnapshot,
    eventNameSnapshot: ticket.eventNameSnapshot,
    seatLabel: ticket.seatLabel,
    seatRow: ticket.seatRow,
    seatNumber: ticket.seatNumber,
    blockLabel: ticket.blockLabel,
    qrToken: readQrToken(ticket.qrTokens[0]?.token),
    holderName,
    organizationId: ticket.organizationId,
    orderId: ticket.orderId,
    orderNumber: ticket.order.orderNumber,
    event: {
      id: ticket.event.id,
      name: ticket.event.name,
      startsAt: ticket.event.eventStartsAt,
      endsAt: ticket.event.eventEndsAt,
      doorsOpenAt: ticket.event.doorsOpenAt,
      locationName: loc?.name ?? null,
      locationCity: loc?.city ?? null,
      locationAddress: [loc?.street, loc?.houseNumber, loc?.postalCode, loc?.city]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    },
  };
}

export function newAppleAuthToken() {
  return randomBytes(32).toString("hex");
}

export function newUpdateTag() {
  return createHash("sha256").update(`${Date.now()}.${randomBytes(8).toString("hex")}`).digest("hex").slice(0, 32);
}

export function formatBerlinDate(date: Date | null | undefined) {
  if (!date) return null;
  return formatDeDateTime(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isTicketWalletEligible(status: string) {
  return status === "active";
}
