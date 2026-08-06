import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto-token";
import { writeAudit } from "@/lib/audit";
import { channelLabel } from "@/lib/commerce/channels";

function ticketPayload(ticket: {
  ticketNumber: string;
  categorySnapshot: string;
  presence: string;
  status: string;
  eventNameSnapshot: string;
  holder?: { firstName: string; lastName: string } | null;
}) {
  const holderName = ticket.holder
    ? `${ticket.holder.firstName} ${ticket.holder.lastName}`.trim()
    : null;
  return {
    ticketNumber: ticket.ticketNumber,
    categorySnapshot: ticket.categorySnapshot,
    presence: ticket.presence,
    status: ticket.status,
    eventNameSnapshot: ticket.eventNameSnapshot,
    holderName,
  };
}

export async function scanTicket(input: {
  eventId: string;
  token: string;
  action?: "in" | "out" | "info";
  actorUserId?: string;
  deviceLabel?: string;
}) {
  const action = input.action ?? "in";
  const tokenHash = hashToken(input.token);

  const qr = await prisma.ticketQrToken.findUnique({
    where: { tokenHash },
    include: {
      ticket: {
        include: { event: true, category: true, order: true, holder: true },
      },
    },
  });

  if (!qr || qr.status !== "active") {
    return {
      color: "red" as const,
      message: "Ungültiger QR-Code",
      ticket: null,
      salesChannel: null as string | null,
      salesChannelLabel: null as string | null,
    };
  }

  const ticket = qr.ticket;
  const salesChannel = ticket.order?.channel ?? "online";
  const salesChannelLabel = channelLabel(salesChannel);
  const payload = () => ticketPayload(ticket);

  if (ticket.eventId !== input.eventId) {
    await prisma.checkinEvent.create({
      data: {
        eventId: input.eventId,
        ticketId: ticket.id,
        action: "lookup",
        result: "orange",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: "wrong_event",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "orange" as const,
      message: "Falsches Event",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
    };
  }

  if (!["active"].includes(ticket.status)) {
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: action === "info" ? "lookup" : action,
        result: "red",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: `status_${ticket.status}`,
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "red" as const,
      message: `Ticket ungültig (${ticket.status})`,
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
    };
  }

  // Infomodus: nur anzeigen, Status unverändert
  if (action === "info") {
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: "lookup",
        result: "blue",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: "info",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "blue" as const,
      message: "Ticket-Info",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

  if (action === "in" && ticket.presence === "in") {
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: "in",
        result: "red",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: "already_in",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "red" as const,
      message: "Bereits eingecheckt",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

  if (action === "out" && ticket.presence === "out") {
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: "out",
        result: "red",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: "already_out",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "red" as const,
      message: "Bereits ausgecheckt",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

  const previous = ticket.presence;
  const nextPresence = action === "in" ? "in" : "out";

  if (action === "out" && ticket.presence === "not_arrived") {
    return {
      color: "orange" as const,
      message: "Noch nicht eingecheckt",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

  // Atomic presence flip so Im-Haus counts never lag the scan response
  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: { presence: nextPresence },
    }),
    prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action,
        result: "green",
        previousPresence: previous,
        newPresence: nextPresence,
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    }),
  ]);

  await writeAudit({
    organizationId: ticket.organizationId,
    actorUserId: input.actorUserId,
    action: `checkin.${action}`,
    entityType: "ticket",
    entityId: ticket.id,
    after: { previous, nextPresence },
  });

  const stats = await getEventCheckinStats(ticket.eventId);
  const isVip = /vip/i.test(ticket.categorySnapshot);
  return {
    color: isVip ? ("blue" as const) : ("green" as const),
    message: action === "in" ? "Einlass OK" : "Ausgecheckt",
    ticket: ticketPayload({ ...ticket, presence: nextPresence }),
    salesChannel,
    salesChannelLabel,
    stats,
  };
}

export async function getEventCheckinStats(eventId: string) {
  const activeWhere = { eventId, status: "active" as const };
  const [sold, soldOnline, soldBoxOffice, currentlyIn, currentlyOut, notArrived, firstCheckedIn] =
    await Promise.all([
      prisma.ticket.count({ where: activeWhere }),
      prisma.ticket.count({
        where: { ...activeWhere, order: { channel: "online" } },
      }),
      prisma.ticket.count({
        where: { ...activeWhere, order: { channel: "box_office" } },
      }),
      prisma.ticket.count({ where: { ...activeWhere, presence: "in" } }),
      prisma.ticket.count({ where: { ...activeWhere, presence: "out" } }),
      prisma.ticket.count({ where: { ...activeWhere, presence: "not_arrived" } }),
      prisma.ticket.count({
        where: { ...activeWhere, presence: { in: ["in", "out"] } },
      }),
    ]);

  return {
    sold,
    active: sold,
    soldOnline,
    soldBoxOffice,
    currentlyIn,
    currentlyOut,
    notArrived,
    firstCheckedIn,
  };
}
