import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { campaignsMatch } from "@/lib/commerce/campaign-sibling-match";
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
  /**
   * Full set of tour dates to apply to (tour admin). When set, replaces the
   * implicit “always include source eventId” behavior — source is included only
   * if listed. `eventId` remains the category/campaign template source.
   */
  targetEventIds: z.array(z.string().uuid()).min(1).max(40).optional(),
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
  let siblingCampaigns: Array<{
    id: string;
    eventId: string;
    name: string;
    type: string;
    value: number;
    channels: string;
    applyMode: string;
    minQuantity: number;
    badgeLabel: string | null;
    validFrom: Date;
    campaignGroupId: string | null;
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
        priceCampaigns: {
          select: {
            id: true,
            eventId: true,
            name: true,
            type: true,
            value: true,
            channels: true,
            applyMode: true,
            minQuantity: true,
            badgeLabel: true,
            validFrom: true,
            campaignGroupId: true,
          },
        },
      },
    });
    tourSiblings = siblings.map((s) => ({
      id: s.id,
      name: s.name,
      eventStartsAt: s.eventStartsAt?.toISOString() ?? null,
      locationName: s.location?.name ?? null,
      city: s.location?.city ?? null,
    }));
    siblingCampaigns = siblings.flatMap((s) => s.priceCampaigns);
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
    campaigns: event.priceCampaigns.map((c) => {
      const matchedSiblingEventIds = [
        ...new Set(
          siblingCampaigns
            .filter((sib) =>
              campaignsMatch(
                {
                  campaignGroupId: c.campaignGroupId,
                  name: c.name,
                  type: c.type,
                  value: c.value,
                  channels: c.channels,
                  applyMode: c.applyMode,
                  minQuantity: c.minQuantity,
                  badgeLabel: c.badgeLabel,
                  validFrom: c.validFrom,
                },
                sib,
              ),
            )
            .map((sib) => sib.eventId),
        ),
      ];
      return {
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
        campaignGroupId: c.campaignGroupId ?? null,
        matchedSiblingEventIds,
        categoryIds: c.categories.map((x) => x.categoryId),
      };
    }),
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

    const validFrom = body.validFrom;
    const validUntil = body.validUntil;
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

    const targetEventIds = body.targetEventIds
      ? [...new Set(body.targetEventIds)]
      : null;
    const alsoEventIds = targetEventIds
      ? targetEventIds.filter((id) => id !== event.id)
      : [...new Set((body.alsoEventIds ?? []).filter((id) => id !== event.id))];
    const includeSourceEvent = targetEventIds ? targetEventIds.includes(event.id) : true;
    const isEdit = Boolean(body.campaignId);

    let originalCampaign: {
      id: string;
      name: string;
      type: string;
      value: number;
      channels: string;
      applyMode: string;
      minQuantity: number;
      badgeLabel: string | null;
      validFrom: Date;
      campaignGroupId: string | null;
    } | null = null;

    if (body.campaignId) {
      originalCampaign = await prisma.eventPriceCampaign.findFirst({
        where: { id: body.campaignId, eventId: event.id },
        select: {
          id: true,
          name: true,
          type: true,
          value: true,
          channels: true,
          applyMode: true,
          minQuantity: true,
          badgeLabel: true,
          validFrom: true,
          campaignGroupId: true,
        },
      });
      if (!originalCampaign) {
        return NextResponse.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, { status: 404 });
      }
    }

    /** When editing, alsoEventIds is the full desired sibling set — remove matches from unchecked. */
    const needsTourSiblingLookup =
      alsoEventIds.length > 0 ||
      (isEdit && Boolean(event.tourId)) ||
      (targetEventIds !== null && Boolean(event.tourId));

    type SiblingRow = {
      id: string;
      eventEndsAt: Date | null;
      eventStartsAt: Date | null;
      ticketCategories: { id: string; name: string; categoryKind: string }[];
      priceCampaigns: {
        id: string;
        name: string;
        type: string;
        value: number;
        channels: string;
        applyMode: string;
        minQuantity: number;
        badgeLabel: string | null;
        validFrom: Date;
        campaignGroupId: string | null;
      }[];
    };

    let tourSiblingRows: SiblingRow[] = [];
    if (needsTourSiblingLookup) {
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
      tourSiblingRows = await prisma.event.findMany({
        where: {
          organizationId: membership.organizationId,
          tourId: event.tourId,
          id: { not: event.id },
        },
        select: {
          id: true,
          eventEndsAt: true,
          eventStartsAt: true,
          ticketCategories: {
            select: { id: true, name: true, categoryKind: true },
          },
          priceCampaigns: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              channels: true,
              applyMode: true,
              minQuantity: true,
              badgeLabel: true,
              validFrom: true,
              campaignGroupId: true,
            },
          },
        },
      });
    }

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
      const allowed = new Set(tourSiblingRows.map((s) => s.id));
      if (alsoEventIds.some((id) => !allowed.has(id))) {
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

    const matchSource = originalCampaign ?? {
      name: body.name.trim(),
      type: body.type,
      value: toStoredValue(body.type, body.valueDisplay),
      channels: body.channels,
      applyMode: body.applyMode === "order" ? "order" : "unit",
      minQuantity: Math.max(1, body.minQuantity ?? 1),
      badgeLabel: body.badgeLabel?.trim() || null,
      validFrom,
      campaignGroupId: null as string | null,
    };

    function findMatchingCampaign(sib: SiblingRow) {
      return (
        sib.priceCampaigns.find((c) =>
          campaignsMatch(matchSource, {
            campaignGroupId: c.campaignGroupId,
            name: c.name,
            type: c.type,
            value: c.value,
            channels: c.channels,
            applyMode: c.applyMode,
            minQuantity: c.minQuantity,
            badgeLabel: c.badgeLabel,
            validFrom: c.validFrom,
          }),
        ) ?? null
      );
    }

    type TargetApply = {
      eventId: string;
      categoryIds: string[];
      eventBound: Date | null;
      campaignId?: string;
    };

    const targets: TargetApply[] = [];
    const siblingWarnings: string[] = [];
    const selectedSiblingSet = new Set(alsoEventIds);
    const removeCampaignIds: string[] = [];

    if (includeSourceEvent) {
      targets.push({
        eventId: event.id,
        categoryIds: body.categoryIds,
        eventBound: event.eventEndsAt ?? event.eventStartsAt,
        campaignId: body.campaignId,
      });
    } else if (isEdit && body.campaignId) {
      removeCampaignIds.push(body.campaignId);
    }

    for (const sib of tourSiblingRows) {
      const matched = findMatchingCampaign(sib);
      if (selectedSiblingSet.has(sib.id)) {
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
        targets.push({
          eventId: sib.id,
          categoryIds: mapped,
          eventBound: sib.eventEndsAt ?? sib.eventStartsAt,
          campaignId: matched?.id,
        });
      } else if (isEdit && matched) {
        removeCampaignIds.push(matched.id);
      }
    }

    if (targets.length < 1) {
      return NextResponse.json(
        {
          error: {
            code: "NO_TARGETS",
            message: "Bitte mindestens einen Termin wählen.",
          },
        },
        { status: 400 },
      );
    }

    const campaignGroupId =
      originalCampaign?.campaignGroupId ??
      (targets.length > 1 ? randomUUID() : null);

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
      campaignGroupId,
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

    if (removeCampaignIds.length > 0) {
      await prisma.eventPriceCampaign.deleteMany({
        where: { id: { in: removeCampaignIds } },
      });
      for (const removedId of removeCampaignIds) {
        await writeAudit({
          organizationId: membership.organizationId,
          actorUserId: session.user.id,
          action: "event.price_campaign.delete",
          entityType: "event_price_campaign",
          entityId: removedId,
          after: { reason: "tour_scope_sync", sourceEventId: event.id },
        });
      }
    }

    const extraCount = Math.max(0, appliedEventIds.length - 1);
    const removedCount = removeCampaignIds.length;
    return NextResponse.json({
      ok: true,
      campaignId: primaryCampaignId,
      campaignGroupId,
      clampedToEventEnd,
      appliedEventIds,
      appliedCount: appliedEventIds.length,
      removedCount,
      validUntil: validUntil.toISOString(),
      warnings: siblingWarnings.length > 0 ? siblingWarnings : undefined,
      message: clampedToEventEnd
        ? "Aktionsende lag nach dem Eventende und wurde auf das Eventende gesetzt."
        : extraCount > 0
          ? `Preisaktion auf ${appliedEventIds.length} Termine übernommen.`
          : removedCount > 0
            ? `Preisaktion gespeichert; von ${removedCount} weiteren Termin(en) entfernt.`
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
