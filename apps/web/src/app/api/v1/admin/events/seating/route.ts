import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { ensureEventSeatsIfNeeded } from "@/lib/seating/materialize";
import {
  parseSeatingLayoutConfig,
  type SeatingLayoutConfig,
} from "@/lib/seating/layout-config";
import { syncPlanBackedCategoryCapacities } from "@/lib/seating/sync-category-capacity";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  eventId: z.string().uuid(),
  /** Assign category to seats / clear with null */
  categoryId: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
  /** Target seats explicitly */
  seatIds: z.array(z.string().uuid()).max(2000).optional(),
  /** Or whole block */
  blockObjectId: z.string().min(1).optional(),
  /** Or one row inside a block */
  rowIndex: z.number().int().min(1).optional(),
});

async function requireWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  const allowed = await userHasPermission(session.user.id, membership.organizationId, "events:write");
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

export async function GET(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { membership } = auth as { membership: { organizationId: string } };

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: { code: "EVENT_ID_REQUIRED" } }, { status: 400 });
  }

  await ensureSeatingAssignmentSchema(prisma);
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    include: {
      venuePlan: true,
      ticketCategories: {
        where: { status: "active" },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          freeSeating: true,
          categoryKind: true,
        },
      },
    },
  });
  if (!event) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!event.venuePlanId || event.seatingBookingMode === "none") {
    return NextResponse.json({
      ok: true,
      enabled: false,
      seats: [],
      categories: [],
      layoutConfig: { blocks: {} },
    });
  }

  // Hot path: only materialize when empty — full sync runs on plan save.
  await ensureEventSeatsIfNeeded(event.id);
  const seats = await prisma.eventSeat.findMany({
    where: { eventId: event.id },
    orderBy: [{ blockLabel: "asc" }, { rowIndex: "asc" }, { seatIndex: "asc" }],
    select: {
      id: true,
      seatKey: true,
      blockObjectId: true,
      blockLabel: true,
      rowIndex: true,
      seatIndex: true,
      rowLabel: true,
      seatNumber: true,
      status: true,
      categoryId: true,
      locked: true,
    },
  });

  // Heal Kontingent drift on admin load (assigned + not locked).
  const capacities = await syncPlanBackedCategoryCapacities(prisma, event.id);

  return NextResponse.json({
    ok: true,
    enabled: true,
    seatingBookingMode: event.seatingBookingMode,
    venuePlan: event.venuePlan,
    layoutConfig: parseSeatingLayoutConfig(event.seatingLayoutConfig),
    categories: event.ticketCategories,
    seats,
    capacities,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  try {
    await ensureSeatingAssignmentSchema(prisma);
    const body = patchSchema.parse(await request.json());
    if (body.categoryId === undefined && body.locked === undefined) {
      return NextResponse.json({ error: { code: "NO_CHANGES" } }, { status: 400 });
    }

    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
    });
    if (!event) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

    if (body.categoryId) {
      const cat = await prisma.eventTicketCategory.findFirst({
        where: { id: body.categoryId, eventId: event.id },
      });
      if (!cat) return NextResponse.json({ error: { code: "CATEGORY_NOT_FOUND" } }, { status: 404 });
    }

    const where: {
      eventId: string;
      id?: { in: string[] };
      blockObjectId?: string;
      rowIndex?: number;
      status?: { in: string[] };
    } = { eventId: event.id };

    if (body.seatIds?.length) {
      where.id = { in: body.seatIds };
    } else if (body.blockObjectId) {
      where.blockObjectId = body.blockObjectId;
      if (body.rowIndex) where.rowIndex = body.rowIndex;
    } else {
      return NextResponse.json({ error: { code: "TARGET_REQUIRED" } }, { status: 400 });
    }

    // Category: available seats only (held/sold keep their assignment).
    // Lock: available only — never touch held/sold (gradual release).
    // Unlock: available + held locked seats; never unlock sold.
    const data: { categoryId?: string | null; locked?: boolean } = {};
    if (body.categoryId !== undefined) data.categoryId = body.categoryId;
    if (body.locked !== undefined) data.locked = body.locked;

    let statusFilter: { in: string[] } | undefined;
    if (body.locked === true) {
      statusFilter = { in: ["available"] };
    } else if (body.locked === false) {
      statusFilter = { in: ["available", "held"] };
    } else if (body.categoryId !== undefined) {
      statusFilter = { in: ["available"] };
    }

    const result = await prisma.eventSeat.updateMany({
      where: {
        ...where,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      data,
    });

    // Keep layout config in sync for rematerialize defaults
    const layout = parseSeatingLayoutConfig(event.seatingLayoutConfig);
    const blocks = { ...(layout.blocks ?? {}) };
    if (body.blockObjectId && !body.seatIds?.length) {
      const prev = blocks[body.blockObjectId] ?? {};
      if (body.rowIndex) {
        const lockedRows = new Set(prev.lockedRowIndexes ?? []);
        if (body.locked === true) lockedRows.add(body.rowIndex);
        if (body.locked === false) lockedRows.delete(body.rowIndex);
        blocks[body.blockObjectId] = {
          ...prev,
          categoryId: body.categoryId !== undefined ? body.categoryId : prev.categoryId,
          lockedRowIndexes: [...lockedRows].sort((a, b) => a - b),
        };
      } else {
        blocks[body.blockObjectId] = {
          ...prev,
          categoryId: body.categoryId !== undefined ? body.categoryId : prev.categoryId,
          locked: body.locked !== undefined ? body.locked : prev.locked,
        };
      }
      const nextConfig: SeatingLayoutConfig = { blocks };
      await prisma.event.update({
        where: { id: event.id },
        data: { seatingLayoutConfig: nextConfig },
      });
    }

    const capacities = await syncPlanBackedCategoryCapacities(prisma, event.id);

    await writeAudit({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      action: "seating.assignment.update",
      entityType: "event",
      entityId: event.id,
      after: { ...body, updated: result.count, capacities },
    });

    return NextResponse.json({ ok: true, updated: result.count, capacities });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
