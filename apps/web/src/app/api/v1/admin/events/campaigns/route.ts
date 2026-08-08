import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureEventPricingSchema } from "@/lib/commerce/ensure-event-pricing-schema";
import { clampCampaignToEventEnd } from "@/lib/commerce/schedule-change";

async function requireWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:write",
  );
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

const accessibilitySchema = z.object({
  eventId: z.string().uuid(),
  enabled: z.boolean(),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional().nullable(),
  type: z.enum(["percent", "fixed"]),
  /** percent: percent points e.g. 10 for 10%; fixed: euros */
  valueDisplay: z.number().min(0),
});

const campaignSchema = z.object({
  eventId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  active: z.boolean().default(true),
  validFrom: z.string().datetime({ offset: true }).or(z.string().min(8)),
  validUntil: z.string().datetime({ offset: true }).or(z.string().min(8)),
  type: z.enum(["percent", "fixed"]),
  valueDisplay: z.number().min(0),
  channels: z.enum(["online", "box_office", "both"]).default("both"),
  categoryIds: z.array(z.string().uuid()).min(1),
});

function toStoredValue(type: "percent" | "fixed", valueDisplay: number) {
  if (type === "percent") return Math.round(valueDisplay * 100); // 10% → 1000 bps
  return Math.round(valueDisplay * 100); // euros → cents
}

export async function GET(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { membership } = auth as { membership: { organizationId: string } };

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: { code: "EVENT_ID_REQUIRED" } }, { status: 400 });
  }

  await ensureEventPricingSchema(prisma);
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      eventEndsAt: true,
      eventStartsAt: true,
      accessibilityDiscountEnabled: true,
      accessibilityDiscountLabel: true,
      accessibilityDiscountDescription: true,
      accessibilityDiscountType: true,
      accessibilityDiscountValue: true,
      ticketCategories: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, priceGrossCents: true },
      },
      priceCampaigns: {
        orderBy: { validFrom: "asc" },
        include: { categories: { select: { categoryId: true } } },
      },
    },
  });
  if (!event) {
    return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({
    eventEndsAt: event.eventEndsAt?.toISOString() ?? null,
    eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
    accessibility: {
      enabled: event.accessibilityDiscountEnabled,
      label: event.accessibilityDiscountLabel,
      description: event.accessibilityDiscountDescription,
      type: event.accessibilityDiscountType === "fixed" ? "fixed" : "percent",
      valueDisplay:
        event.accessibilityDiscountType === "fixed"
          ? event.accessibilityDiscountValue / 100
          : event.accessibilityDiscountValue / 100,
    },
    categories: event.ticketCategories,
    campaigns: event.priceCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil.toISOString(),
      type: c.type,
      valueDisplay: c.value / 100,
      channels: c.channels,
      categoryIds: c.categories.map((x) => x.categoryId),
    })),
  });
}

/** PATCH accessibility offer on the event */
export async function PATCH(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  await ensureEventPricingSchema(prisma);
  try {
    const body = accessibilitySchema.parse(await request.json());
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        accessibilityDiscountEnabled: body.enabled,
        accessibilityDiscountLabel: body.label?.trim() || "Rollstuhl / Ermäßigt",
        accessibilityDiscountDescription: body.description?.trim() || null,
        accessibilityDiscountType: body.type,
        accessibilityDiscountValue: toStoredValue(body.type, body.valueDisplay),
      },
    });

    await writeAudit({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      action: "event.accessibility_discount.update",
      entityType: "event",
      entityId: event.id,
      after: {
        enabled: updated.accessibilityDiscountEnabled,
        type: updated.accessibilityDiscountType,
        value: updated.accessibilityDiscountValue,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", details: err.flatten() } }, { status: 400 });
    }
    console.error("[campaigns PATCH]", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}

/** PUT create/update a price campaign */
export async function PUT(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  await ensureEventPricingSchema(prisma);
  try {
    const body = campaignSchema.parse(await request.json());
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
      select: { id: true, eventEndsAt: true, eventStartsAt: true },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    const cats = await prisma.eventTicketCategory.findMany({
      where: { eventId: event.id, id: { in: body.categoryIds } },
      select: { id: true },
    });
    if (cats.length !== body.categoryIds.length) {
      return NextResponse.json({ error: { code: "CATEGORY_MISMATCH" } }, { status: 400 });
    }

    let validFrom = new Date(body.validFrom);
    let validUntil = new Date(body.validUntil);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      return NextResponse.json({ error: { code: "INVALID_WINDOW" } }, { status: 400 });
    }

    const eventBound = event.eventEndsAt ?? event.eventStartsAt;
    let clampedToEventEnd = false;
    if (eventBound) {
      const clamped = clampCampaignToEventEnd({
        validFrom,
        validUntil,
        eventEndsAt: eventBound,
      });
      if (clamped.changed) {
        validFrom = clamped.validFrom;
        validUntil = clamped.validUntil;
        clampedToEventEnd = true;
      }
    }

    if (!(validFrom < validUntil)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_WINDOW",
            message: "Aktionsende muss nach dem Aktionsbeginn liegen.",
          },
        },
        { status: 400 },
      );
    }

    const value = toStoredValue(body.type, body.valueDisplay);
    const data = {
      name: body.name.trim(),
      active: body.active,
      validFrom,
      validUntil,
      type: body.type,
      value,
      channels: body.channels,
    };

    let campaignId = body.campaignId;
    if (campaignId) {
      const existing = await prisma.eventPriceCampaign.findFirst({
        where: { id: campaignId, eventId: event.id },
      });
      if (!existing) {
        return NextResponse.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, { status: 404 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.eventPriceCampaign.update({ where: { id: campaignId! }, data });
        await tx.eventPriceCampaignCategory.deleteMany({ where: { campaignId: campaignId! } });
        await tx.eventPriceCampaignCategory.createMany({
          data: body.categoryIds.map((categoryId) => ({
            campaignId: campaignId!,
            categoryId,
          })),
        });
      });
    } else {
      const created = await prisma.eventPriceCampaign.create({
        data: {
          eventId: event.id,
          ...data,
          categories: {
            create: body.categoryIds.map((categoryId) => ({ categoryId })),
          },
        },
      });
      campaignId = created.id;
    }

    await writeAudit({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      action: "event.price_campaign.upsert",
      entityType: "event_price_campaign",
      entityId: campaignId,
      after: { ...data, categoryIds: body.categoryIds, clampedToEventEnd },
    });

    return NextResponse.json({
      ok: true,
      campaignId,
      clampedToEventEnd,
      validUntil: validUntil.toISOString(),
      message: clampedToEventEnd
        ? "Aktionsende lag nach dem Eventende und wurde auf das Eventende gesetzt."
        : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", details: err.flatten() } }, { status: 400 });
    }
    console.error("[campaigns PUT]", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  await ensureEventPricingSchema(prisma);
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const campaignId = url.searchParams.get("campaignId");
  if (!eventId || !campaignId) {
    return NextResponse.json({ error: { code: "IDS_REQUIRED" } }, { status: 400 });
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
  }

  const deleted = await prisma.eventPriceCampaign.deleteMany({
    where: { id: campaignId, eventId: event.id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, { status: 404 });
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.price_campaign.delete",
    entityType: "event_price_campaign",
    entityId: campaignId,
  });

  return NextResponse.json({ ok: true });
}
