"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

async function requireWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

async function defaultTaxRate(organizationId: string) {
  return (
    (await prisma.taxRate.findFirst({
      where: { organizationId, active: true, isDefaultTicket: true },
    })) ??
    (await prisma.taxRate.findFirst({
      where: { organizationId, active: true, rateBps: 700 },
    }))
  );
}

export async function upsertCategoryTemplateAction(formData: FormData) {
  const { session, membership } = await requireWrite();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const priceEuro = Number(String(formData.get("priceEuro") ?? "0").replace(",", "."));
  const priceGrossCents = Math.round(priceEuro * 100);
  const capacity = Math.max(1, Number(formData.get("capacity") ?? 100));
  const maxPerOrder = Math.max(1, Number(formData.get("maxPerOrder") ?? 10));
  const description = String(formData.get("description") ?? "").trim() || null;

  if (id) {
    const existing = await prisma.ticketCategoryTemplate.findFirst({
      where: { id, organizationId: membership.organizationId },
    });
    if (!existing) throw new Error("NOT_FOUND");
    await prisma.ticketCategoryTemplate.update({
      where: { id },
      data: { name, description, priceGrossCents, capacity, maxPerOrder },
    });
  } else {
    const count = await prisma.ticketCategoryTemplate.count({
      where: { organizationId: membership.organizationId },
    });
    await prisma.ticketCategoryTemplate.create({
      data: {
        organizationId: membership.organizationId,
        name,
        description,
        priceGrossCents,
        capacity,
        maxPerOrder,
        sortOrder: count,
      },
    });
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: id ? "category_template.updated" : "category_template.created",
    entityType: "ticket_category_template",
    entityId: id || undefined,
    after: { name, priceGrossCents, capacity },
  });

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/events");
}

export async function deleteCategoryTemplateAction(formData: FormData) {
  const { session, membership } = await requireWrite();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.ticketCategoryTemplate.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");
  await prisma.ticketCategoryTemplate.delete({ where: { id } });
  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "category_template.deleted",
    entityType: "ticket_category_template",
    entityId: id,
  });
  revalidatePath("/admin/catalog");
}

export async function upsertEventCategoryAction(formData: FormData) {
  const { session, membership } = await requireWrite();
  const eventId = String(formData.get("eventId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
  });
  if (!event) throw new Error("EVENT_NOT_FOUND");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const priceEuro = Number(String(formData.get("priceEuro") ?? "0").replace(",", "."));
  const priceGrossCents = Math.round(priceEuro * 100);
  const capacity = Math.max(0, Number(formData.get("capacity") ?? 0));
  const maxPerOrder = Math.max(1, Number(formData.get("maxPerOrder") ?? 10));
  const description = String(formData.get("description") ?? "").trim() || null;

  const { canCreateEventCategories } = await import("@/lib/commerce/event-sale");
  if (!categoryId && !(await canCreateEventCategories(event.id))) {
    throw new Error("CATEGORIES_LOCKED");
  }

  if (categoryId) {
    const category = await prisma.eventTicketCategory.findFirst({
      where: { id: categoryId, eventId: event.id },
      include: { pools: true },
    });
    if (!category) throw new Error("NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      await tx.eventTicketCategory.update({
        where: { id: category.id },
        data: { name, description, priceGrossCents, capacity, maxPerOrder },
      });
      for (const pool of category.pools) {
        const newCap = Math.max(pool.soldQuantity + pool.heldQuantity, capacity);
        await tx.inventoryPool.update({
          where: { id: pool.id },
          data: { capacity: newCap },
        });
      }
    });
  } else {
    const taxRate = await defaultTaxRate(membership.organizationId);
    if (!taxRate) throw new Error("TAX_RATE_MISSING");
    const sortOrder = await prisma.eventTicketCategory.count({ where: { eventId: event.id } });

    await prisma.$transaction(async (tx) => {
      const created = await tx.eventTicketCategory.create({
        data: {
          eventId: event.id,
          taxRateId: taxRate.id,
          name,
          description,
          priceGrossCents,
          capacity,
          maxPerOrder,
          onlineBookable: true,
          boxOfficeBookable: true,
          freeSeating: true,
          sortOrder,
          status: "active",
        },
      });
      await tx.inventoryPool.create({
        data: {
          eventId: event.id,
          categoryId: created.id,
          channel: "online",
          capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
      await tx.inventoryPool.create({
        data: {
          eventId: event.id,
          categoryId: created.id,
          channel: "box_office",
          capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
    });
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: categoryId ? "event.category.updated" : "event.category.created",
    entityType: "event_ticket_category",
    entityId: categoryId || event.id,
    after: { eventId: event.id, name, priceGrossCents, capacity },
  });

  // Sync seat geometry only — categoryId stays null until Preiskategorie-Zuordnung.
  const { ensureEventSeats } = await import("@/lib/seating/materialize");
  await ensureEventSeats(event.id);

  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath(`/event/${event.slug}`);
  revalidatePath("/events");
  revalidatePath("/kasse");
  redirect(`/admin/events/${event.id}?saved=1#kategorien`);
}

export async function applyCategoryTemplateAction(formData: FormData) {
  const { session, membership } = await requireWrite();
  const eventId = String(formData.get("eventId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
  });
  if (!event) throw new Error("EVENT_NOT_FOUND");
  const { canCreateEventCategories } = await import("@/lib/commerce/event-sale");
  if (!(await canCreateEventCategories(event.id))) throw new Error("CATEGORIES_LOCKED");
  const template = await prisma.ticketCategoryTemplate.findFirst({
    where: { id: templateId, organizationId: membership.organizationId },
  });
  if (!template) throw new Error("TEMPLATE_NOT_FOUND");

  const taxRate = await defaultTaxRate(membership.organizationId);
  if (!taxRate) throw new Error("TAX_RATE_MISSING");
  const sortOrder = await prisma.eventTicketCategory.count({ where: { eventId: event.id } });

  await prisma.$transaction(async (tx) => {
    const created = await tx.eventTicketCategory.create({
      data: {
        eventId: event.id,
        taxRateId: taxRate.id,
        name: template.name,
        description: template.description,
        priceGrossCents: template.priceGrossCents,
        capacity: template.capacity,
        maxPerOrder: template.maxPerOrder,
        onlineBookable: true,
        boxOfficeBookable: true,
        freeSeating: true,
        sortOrder,
        status: "active",
      },
    });
    await tx.inventoryPool.create({
      data: {
        eventId: event.id,
        categoryId: created.id,
        channel: "online",
        capacity: template.capacity,
        soldQuantity: 0,
        heldQuantity: 0,
      },
    });
    await tx.inventoryPool.create({
      data: {
        eventId: event.id,
        categoryId: created.id,
        channel: "box_office",
        capacity: template.capacity,
        soldQuantity: 0,
        heldQuantity: 0,
      },
    });
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.category.from_template",
    entityType: "event",
    entityId: event.id,
    after: { templateId, name: template.name },
  });

  // Sync seat geometry only — does not map template names onto plan slots.
  const { ensureEventSeats } = await import("@/lib/seating/materialize");
  await ensureEventSeats(event.id);

  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath(`/event/${event.slug}`);
  redirect(`/admin/events/${event.id}?saved=1#kategorien`);
}

export async function deleteEventCategoryAction(formData: FormData) {
  const { session, membership } = await requireWrite();
  const categoryId = String(formData.get("categoryId") ?? "");
  const category = await prisma.eventTicketCategory.findFirst({
    where: { id: categoryId, event: { organizationId: membership.organizationId } },
    include: { pools: true, event: true, _count: { select: { orderItems: true, tickets: true } } },
  });
  if (!category) throw new Error("NOT_FOUND");
  const sold = category.pools.reduce((s, p) => s + p.soldQuantity, 0);
  if (sold > 0 || category._count.tickets > 0 || category._count.orderItems > 0) {
    throw new Error("CATEGORY_HAS_SALES");
  }

  await prisma.eventTicketCategory.delete({ where: { id: category.id } });
  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.category.deleted",
    entityType: "event_ticket_category",
    entityId: category.id,
    before: { name: category.name },
  });

  revalidatePath(`/admin/events/${category.eventId}`);
  revalidatePath(`/event/${category.event.slug}`);
  redirect(`/admin/events/${category.eventId}?saved=1#kategorien`);
}
