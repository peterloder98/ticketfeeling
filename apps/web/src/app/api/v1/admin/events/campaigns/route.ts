import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ensureEventPricingSchema } from "@/lib/commerce/ensure-event-pricing-schema";
import { clampCampaignToEventEnd } from "@/lib/commerce/schedule-change";
import { parseDatetimeLocalBerlin } from "@/lib/admin/event-form";

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

/** Accept ISO, datetime-local, or DE display — always store as Date. */
const campaignInstantSchema = z.string().min(1).transform((raw, ctx) => {
  const d = parseDatetimeLocalBerlin(raw);
  if (!d) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bitte gültiges Datum und Uhrzeit für Von/Bis wählen.",
    });
    return z.NEVER;
  }
  return d;
});

const campaignSchema = z.object({
  eventId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  active: z.boolean().default(true),
  validFrom: campaignInstantSchema,
  validUntil: campaignInstantSchema,
  type: z.enum(["percent", "fixed"]),
  valueDisplay: z.number().min(0),
  channels: z.enum(["online", "box_office", "both"]).default("both"),
  categoryIds: z.array(z.string().uuid()).min(1),
  /** unit = per ticket; order = once when qty ≥ minQuantity */
  applyMode: z.enum(["unit", "order"]).default("unit"),
  minQuantity: z.number().int().min(1).max(99).default(1),
  badgeLabel: z.string().max(80).optional().nullable(),
  badgeDisclaimer: z.string().max(160).optional().nullable(),
  /** Extra tour-sibling event IDs to receive the same campaign settings */
  alsoEventIds: z.array(z.string().uuid()).max(40).optional().default([]),
});

function toStoredValue(type: "percent" | "fixed", valueDisplay: number) {
  if (type === "percent") return Math.round(valueDisplay * 100); // 10% → 1000 bps
  return Math.round(valueDisplay * 100); // euros → cents
}

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map selected source category IDs onto a sibling event by category name (then kind). */
function mapCategoriesToSibling(args: {
  sourceSelected: { id: string; name: string; categoryKind: string }[];
  siblingCategories: { id: string; name: string; categoryKind: string }[];
}): string[] {
  const byName = new Map(
    args.siblingCategories.map((c) => [normalizeCategoryName(c.name), c.id] as const),
  );
  const byKind = new Map<string, string[]>();
  for (const c of args.siblingCategories) {
    const kind = c.categoryKind || "standard";
    const list = byKind.get(kind) ?? [];
    list.push(c.id);
    byKind.set(kind, list);
  }

  const mapped: string[] = [];
  const seen = new Set<string>();
  for (const src of args.sourceSelected) {
    const byNameId = byName.get(normalizeCategoryName(src.name));
    let id = byNameId;
    if (!id) {
      const kindMatches = byKind.get(src.categoryKind || "standard") ?? [];
      if (kindMatches.length === 1) id = kindMatches[0];
    }
    if (id && !seen.has(id)) {
      seen.add(id);
      mapped.push(id);
    }
  }
  return mapped;
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
      tourId: true,
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

  let tourSiblings: Array<{
    id: string;
    name: string;
    eventStartsAt: string | null;
    locationName: string | null;
    city: string | null;
  }> = [];
  if (event.tourId) {
    const siblings = await prisma.event.findMany({
      where: {
        organizationId: membership.organizationId,
        tourId: event.tourId,
        id: { not: event.id },
      },
      orderBy: { eventStartsAt: "asc" },
      select: {
        id: true,
        name: true,
        eventStartsAt: true,
        location: { select: { name: true, city: true } },
      },
    });
    tourSiblings = siblings.map((s) => ({
      id: s.id,
      name: s.name,
      eventStartsAt: s.eventStartsAt?.toISOString() ?? null,
      locationName: s.location?.name ?? null,
      city: s.location?.city ?? null,
    }));
  }

  return NextResponse.json({
    eventEndsAt: event.eventEndsAt?.toISOString() ?? null,
    eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
    tourId: event.tourId,
    tourSiblings,
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
      applyMode: c.applyMode === "order" ? "order" : "unit",
      minQuantity: Math.max(1, c.minQuantity ?? 1),
      badgeLabel: c.badgeLabel ?? null,
      badgeDisclaimer: c.badgeDisclaimer ?? null,
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
      select: {
        id: true,
        tourId: true,
        eventEndsAt: true,
        eventStartsAt: true,
        ticketCategories: {
          select: { id: true, name: true, categoryKind: true },
        },
      },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    const sourceSelected = event.ticketCategories.filter((c) =>
      body.categoryIds.includes(c.id),
    );
    if (sourceSelected.length !== body.categoryIds.length) {
      return NextResponse.json({ error: { code: "CATEGORY_MISMATCH" } }, { status: 400 });
    }

    let validFrom = body.validFrom;
    let validUntil = body.validUntil;
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_WINDOW",
            message: "Bitte gültige Daten für Von und Bis angeben.",
          },
        },
        { status: 400 },
      );
    }

    const alsoEventIds = [...new Set((body.alsoEventIds ?? []).filter((id) => id !== event.id))];
    let siblingEvents: Array<{
      id: string;
      eventEndsAt: Date | null;
      eventStartsAt: Date | null;
      ticketCategories: { id: string; name: string; categoryKind: string }[];
    }> = [];
    if (alsoEventIds.length > 0) {
      if (!event.tourId) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_ON_TOUR",
              message: "Weitere Termine nur bei Events einer Tour möglich.",
            },
          },
          { status: 400 },
        );
      }
      siblingEvents = await prisma.event.findMany({
        where: {
          id: { in: alsoEventIds },
          organizationId: membership.organizationId,
          tourId: event.tourId,
        },
        select: {
          id: true,
          eventEndsAt: true,
          eventStartsAt: true,
          ticketCategories: {
            select: { id: true, name: true, categoryKind: true },
          },
        },
      });
      if (siblingEvents.length !== alsoEventIds.length) {
        return NextResponse.json(
          {
            error: {
              code: "SIBLING_MISMATCH",
              message: "Einige Termine gehören nicht zur gleichen Tour.",
            },
          },
          { status: 400 },
        );
      }
    }

    type TargetApply = {
      eventId: string;
      categoryIds: string[];
      eventBound: Date | null;
      campaignId?: string;
    };

    const targets: TargetApply[] = [
      {
        eventId: event.id,
        categoryIds: body.categoryIds,
        eventBound: event.eventEndsAt ?? event.eventStartsAt,
        campaignId: body.campaignId,
      },
    ];

    const siblingWarnings: string[] = [];
    const siblingTargets: TargetApply[] = [];
    for (const sib of siblingEvents) {
      const mapped = mapCategoriesToSibling({
        sourceSelected,
        siblingCategories: sib.ticketCategories,
      });
      if (mapped.length < 1) {
        siblingWarnings.push(`Termin ohne passende Preiskategorie übersprungen.`);
        continue;
      }
      if (mapped.length < sourceSelected.length) {
        siblingWarnings.push(
          `Bei einem Termin wurden nicht alle Kategorien gefunden — nur passende übernommen.`,
        );
      }
      siblingTargets.push({
        eventId: sib.id,
        categoryIds: mapped,
        eventBound: sib.eventEndsAt ?? sib.eventStartsAt,
      });
    }

    if (siblingTargets.length > 0) {
      const existingByEvent = await prisma.eventPriceCampaign.findMany({
        where: {
          eventId: { in: siblingTargets.map((t) => t.eventId) },
          name: body.name.trim(),
        },
        select: { id: true, eventId: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      });
      const latestByEvent = new Map<string, string>();
      for (const row of existingByEvent) {
        if (!latestByEvent.has(row.eventId)) latestByEvent.set(row.eventId, row.id);
      }
      for (const t of siblingTargets) {
        targets.push({
          ...t,
          campaignId: latestByEvent.get(t.eventId),
        });
      }
    }

    const applyMode = body.applyMode === "order" ? "order" : "unit";
    const minQuantity = Math.max(1, body.minQuantity ?? 1);
    const value = toStoredValue(body.type, body.valueDisplay);
    const baseData = {
      name: body.name.trim(),
      active: body.active,
      type: body.type,
      value,
      channels: body.channels,
      applyMode,
      minQuantity,
      badgeLabel: body.badgeLabel?.trim() || null,
      badgeDisclaimer: body.badgeDisclaimer?.trim() || null,
    };

    let primaryCampaignId = body.campaignId;
    let clampedToEventEnd = false;
    const appliedEventIds: string[] = [];

    for (const target of targets) {
      let from = validFrom;
      let until = validUntil;
      if (target.eventBound) {
        const clamped = clampCampaignToEventEnd({
          validFrom: from,
          validUntil: until,
          eventEndsAt: target.eventBound,
        });
        if (clamped.changed) {
          from = clamped.validFrom;
          until = clamped.validUntil;
          if (target.eventId === event.id) clampedToEventEnd = true;
        }
      }
      if (!(from < until)) {
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

      const data = { ...baseData, validFrom: from, validUntil: until };
      let campaignId = target.campaignId;

      if (campaignId) {
        const existing = await prisma.eventPriceCampaign.findFirst({
          where: { id: campaignId, eventId: target.eventId },
        });
        if (!existing) {
          return NextResponse.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, { status: 404 });
        }
        await prisma.$transaction(async (tx) => {
          await tx.eventPriceCampaign.update({ where: { id: campaignId! }, data });
          await tx.eventPriceCampaignCategory.deleteMany({ where: { campaignId: campaignId! } });
          await tx.eventPriceCampaignCategory.createMany({
            data: target.categoryIds.map((categoryId) => ({
              campaignId: campaignId!,
              categoryId,
            })),
          });
        });
      } else {
        const created = await prisma.eventPriceCampaign.create({
          data: {
            eventId: target.eventId,
            ...data,
            categories: {
              create: target.categoryIds.map((categoryId) => ({ categoryId })),
            },
          },
        });
        campaignId = created.id;
      }

      if (target.eventId === event.id) primaryCampaignId = campaignId;
      appliedEventIds.push(target.eventId);

      await writeAudit({
        organizationId: membership.organizationId,
        actorUserId: session.user.id,
        action: "event.price_campaign.upsert",
        entityType: "event_price_campaign",
        entityId: campaignId,
        after: {
          ...data,
          categoryIds: target.categoryIds,
          clampedToEventEnd: target.eventId === event.id ? clampedToEventEnd : undefined,
          sourceEventId: event.id,
        },
      });
    }

    const extraCount = Math.max(0, appliedEventIds.length - 1);
    return NextResponse.json({
      ok: true,
      campaignId: primaryCampaignId,
      clampedToEventEnd,
      appliedEventIds,
      appliedCount: appliedEventIds.length,
      validUntil: validUntil.toISOString(),
      warnings: siblingWarnings.length > 0 ? siblingWarnings : undefined,
      message: clampedToEventEnd
        ? "Aktionsende lag nach dem Eventende und wurde auf das Eventende gesetzt."
        : extraCount > 0
          ? `Preisaktion auf ${appliedEventIds.length} Termine übernommen.`
          : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0]?.message;
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION",
            message: first || "Aktion konnte nicht gespeichert werden — bitte Eingaben prüfen.",
            details: err.flatten(),
          },
        },
        { status: 400 },
      );
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
