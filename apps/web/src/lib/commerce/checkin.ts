import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto-token";
import { writeAudit } from "@/lib/audit";
import { channelLabel } from "@/lib/commerce/channels";
import {
  checkinLockedMessage,
  isProductionCheckinOpen,
} from "@/lib/commerce/checkin-gate";
import { resolveTicketDoors } from "@/lib/commerce/ticket-doors";

/** Stable machine codes for scanner clients (German messages stay human-facing). */
export type ScanResultCode =
  | "VALID"
  | "ALREADY_CHECKED_IN"
  | "ALREADY_CHECKED_OUT"
  | "INVALID"
  | "WRONG_EVENT"
  | "DOORS_LOCKED"
  | "INFO"
  | "NOT_ARRIVED"
  | "TECHNICAL_ERROR";

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

export function technicalScanErrorResult() {
  return {
    color: "orange" as const,
    code: "TECHNICAL_ERROR" as const satisfies ScanResultCode,
    message: "Ticket konnte momentan nicht geprüft werden.",
    ticket: null,
    salesChannel: null as string | null,
    salesChannelLabel: null as string | null,
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
      code: "INVALID" as const,
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
  const doors = resolveTicketDoors(ticket.event, ticket.category);
  const gateEvent = {
    doorsOpenAt: doors.doorsOpenAt,
    saleClosedEarly: ticket.event.saleClosedEarly,
  };
  const doorsPayload = {
    doorsOpenAt: doors.doorsOpenAt?.toISOString() ?? null,
    doorsHeadline: doors.headline,
    doorsNote: doors.doorsNote,
    doorsIsCategoryOverride: doors.isCategoryOverride,
    eventDoorsOpenAt: ticket.event.doorsOpenAt?.toISOString() ?? null,
  };

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
      code: "WRONG_EVENT" as const,
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
      code: "INVALID" as const,
      message: `Ticket ungültig (${ticket.status})`,
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
    };
  }

  // Infomodus / Testmodus: nur anzeigen, Status unverändert
  if (action === "info") {
    const checkinOpen = isProductionCheckinOpen(gateEvent);
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: "lookup",
        result: "blue",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: checkinOpen ? "info" : "test_mode",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "blue" as const,
      code: "INFO" as const,
      message: checkinOpen ? "Ticket-Info" : "Testmodus — Ticket-Info",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
      ...doorsPayload,
    };
  }

  // Real check-in/out only after effective doors open or early sale end
  if (!isProductionCheckinOpen(gateEvent)) {
    const lockedMsg = checkinLockedMessage(gateEvent);
    await prisma.checkinEvent.create({
      data: {
        eventId: ticket.eventId,
        ticketId: ticket.id,
        action: "lookup",
        result: "orange",
        previousPresence: ticket.presence,
        newPresence: ticket.presence,
        reason: "doors_not_open",
        actorUserId: input.actorUserId,
        deviceLabel: input.deviceLabel,
      },
    });
    return {
      color: "orange" as const,
      code: "DOORS_LOCKED" as const,
      message: lockedMsg,
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
      checkinLocked: true as const,
      saleClosedEarly: Boolean(ticket.event.saleClosedEarly),
      ...doorsPayload,
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
      code: "ALREADY_CHECKED_IN" as const,
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
      code: "ALREADY_CHECKED_OUT" as const,
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
      code: "NOT_ARRIVED" as const,
      message: "Noch nicht eingecheckt",
      ticket: payload(),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

  // Conditional update so concurrent double-scans cannot both succeed as first check-in.
  const race = await prisma.$transaction(async (tx) => {
    const flipped = await tx.ticket.updateMany({
      where: { id: ticket.id, presence: previous },
      data: { presence: nextPresence },
    });
    if (flipped.count === 0) {
      const fresh = await tx.ticket.findUnique({
        where: { id: ticket.id },
        select: { presence: true },
      });
      const current = fresh?.presence ?? ticket.presence;
      const reason =
        action === "in" && current === "in"
          ? "already_in"
          : action === "out" && current === "out"
            ? "already_out"
            : "presence_race";
      await tx.checkinEvent.create({
        data: {
          eventId: ticket.eventId,
          ticketId: ticket.id,
          action,
          result: "red",
          previousPresence: current,
          newPresence: current,
          reason,
          actorUserId: input.actorUserId,
          deviceLabel: input.deviceLabel,
        },
      });
      return { ok: false as const, reason, presence: current };
    }

    await tx.checkinEvent.create({
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
    });
    return { ok: true as const };
  });

  if (!race.ok) {
    return {
      color: "red" as const,
      code:
        race.reason === "already_out"
          ? ("ALREADY_CHECKED_OUT" as const)
          : ("ALREADY_CHECKED_IN" as const),
      message:
        race.reason === "already_out"
          ? "Bereits ausgecheckt"
          : "Bereits eingecheckt",
      ticket: ticketPayload({ ...ticket, presence: race.presence }),
      salesChannel,
      salesChannelLabel,
      stats: await getEventCheckinStats(ticket.eventId),
    };
  }

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
    code: "VALID" as const,
    message: action === "in" ? "Einlass OK" : "Ausgecheckt",
    ticket: ticketPayload({ ...ticket, presence: nextPresence }),
    salesChannel,
    salesChannelLabel,
    stats,
    ...doorsPayload,
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
