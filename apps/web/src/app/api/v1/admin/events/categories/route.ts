import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canMutateEventCategories } from "@/lib/commerce/event-sale";
import {
  isPlanBackedTicketCategory,
  syncPlanBackedCategoryCapacities,
} from "@/lib/seating/sync-category-capacity";

const CATEGORY_KINDS = [
  "standard",
  "standing",
  "free_choice",
  "vip",
  "wheelchair",
] as const;

const upsertSchema = z.object({
  eventId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  priceEuro: z.number().min(0),
  capacity: z.number().int().min(0),
  maxPerOrder: z.number().int().min(1).max(50),
  categoryKind: z.enum(CATEGORY_KINDS).optional(),
  companionFree: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .optional()
    .nullable(),
});

async function requireWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  const allowed = await userHasPermission(session.user.id, membership.organizationId, "events:write");
  if (!allowed) return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  return { session, membership };
}

export async function PUT(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  try {
    const body = upsertSchema.parse(await request.json());
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
    });
    if (!event) return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });

    // New categories only while event is still draft / announcement
    if (!body.categoryId && !canMutateEventCategories(event.status)) {
      return NextResponse.json({ error: { code: "CATEGORIES_LOCKED" } }, { status: 409 });
    }

    const priceGrossCents = Math.round(body.priceEuro * 100);
    const description = body.description?.trim() || null;
    const categoryKind = body.categoryKind ?? "standard";
    const companionFree = categoryKind === "wheelchair" ? Boolean(body.companionFree) : false;
    const freeSeating =
      categoryKind === "standing" ||
      categoryKind === "free_choice" ||
      event.seatingBookingMode === "none";
    const planBacked = isPlanBackedTicketCategory({ freeSeating, categoryKind });
    // Plan-backed: Kontingent is derived from Saalplan; ignore manual input on create.
    const capacity = planBacked ? 0 : body.capacity;

    if (body.categoryId) {
      const category = await prisma.eventTicketCategory.findFirst({
        where: { id: body.categoryId, eventId: event.id },
        include: { pools: true },
      });
      if (!category) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

      // Keep submitted capacity for freiverkauf; plan-backed is overwritten by seat sync below.
      const nextCapacity = planBacked ? category.capacity : body.capacity;

      await prisma.$transaction(async (tx) => {
        await tx.eventTicketCategory.update({
          where: { id: category.id },
          data: {
            name: body.name,
            description,
            priceGrossCents,
            capacity: nextCapacity,
            maxPerOrder: body.maxPerOrder,
            categoryKind,
            companionFree,
            freeSeating,
            color: body.color === undefined ? undefined : body.color,
          },
        });
        if (!planBacked) {
          for (const pool of category.pools) {
            const newCap = Math.max(pool.soldQuantity + pool.heldQuantity, body.capacity);
            await tx.inventoryPool.update({
              where: { id: pool.id },
              data: { capacity: newCap },
            });
          }
        }
      });

      if (planBacked) {
        await syncPlanBackedCategoryCapacities(prisma, event.id);
      }

      await writeAudit({
        organizationId: membership.organizationId,
        actorUserId: session.user.id,
        action: "event.category.updated",
        entityType: "event_ticket_category",
        entityId: category.id,
        after: { name: body.name, priceGrossCents, planBacked },
      });

      const updated = await prisma.eventTicketCategory.findUniqueOrThrow({
        where: { id: category.id },
        include: { pools: true },
      });
      return NextResponse.json({ ok: true, category: updated });
    }

    const taxRate =
      (await prisma.taxRate.findFirst({
        where: { organizationId: membership.organizationId, active: true, isDefaultTicket: true },
      })) ??
      (await prisma.taxRate.findFirst({
        where: { organizationId: membership.organizationId, active: true, rateBps: 700 },
      }));
    if (!taxRate) return NextResponse.json({ error: { code: "TAX_RATE_MISSING" } }, { status: 400 });

    const sortOrder = await prisma.eventTicketCategory.count({ where: { eventId: event.id } });
    const created = await prisma.$transaction(async (tx) => {
      const cat = await tx.eventTicketCategory.create({
        data: {
          eventId: event.id,
          taxRateId: taxRate.id,
          name: body.name,
          description,
          priceGrossCents,
          capacity,
          maxPerOrder: body.maxPerOrder,
          onlineBookable: true,
          boxOfficeBookable: true,
          freeSeating,
          categoryKind,
          companionFree,
          color: body.color ?? null,
          sortOrder,
          status: "active",
        },
      });
      await tx.inventoryPool.create({
        data: {
          eventId: event.id,
          categoryId: cat.id,
          channel: "online",
          capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
      await tx.inventoryPool.create({
        data: {
          eventId: event.id,
          categoryId: cat.id,
          channel: "box_office",
          capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
      return cat;
    });

    const full = await prisma.eventTicketCategory.findUniqueOrThrow({
      where: { id: created.id },
      include: { pools: true },
    });
    return NextResponse.json({ ok: true, category: full });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  try {
    const { categoryId } = z.object({ categoryId: z.string().uuid() }).parse(await request.json());
    const category = await prisma.eventTicketCategory.findFirst({
      where: { id: categoryId, event: { organizationId: membership.organizationId } },
      include: { pools: true, _count: { select: { orderItems: true, tickets: true } } },
    });
    if (!category) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    const sold = category.pools.reduce((s, p) => s + p.soldQuantity, 0);
    if (sold > 0 || category._count.tickets > 0 || category._count.orderItems > 0) {
      return NextResponse.json({ error: { code: "CATEGORY_HAS_SALES" } }, { status: 409 });
    }
    await prisma.eventTicketCategory.delete({ where: { id: category.id } });
    await writeAudit({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      action: "event.category.deleted",
      entityType: "event_ticket_category",
      entityId: category.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
