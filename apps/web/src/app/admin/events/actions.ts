"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  CREATE_EVENT_STATUSES,
  EVENT_STATUSES,
  slugify,
} from "@/lib/admin/event-form";
import { allocateUniqueEventSlug } from "@/lib/admin/unique-event-slug";
import { resolveCoverForTourEvent } from "@/lib/commerce/tour-cover-sync";
import { isEventSalesReleased } from "@/lib/commerce/event-sale";

async function requireEventWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed =
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    )) ||
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "tours:write",
    ));
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

function assertCoverForSaleRelease(status: string, coverImageUrl: string | null) {
  if (isEventSalesReleased(status) && !coverImageUrl?.trim()) {
    throw new Error("COVER_REQUIRED_FOR_SALE");
  }
}

function parseDt(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`INVALID_${key}`);
  return d;
}

function eurosToCents(raw: string) {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export async function createEventAction(formData: FormData) {
  const { session, membership } = await requireEventWrite();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const preferredSlug = String(formData.get("slug") ?? "").trim() || null;

  const status = String(formData.get("status") ?? "draft");
  if (!CREATE_EVENT_STATUSES.includes(status as (typeof CREATE_EVENT_STATUSES)[number])) {
    throw new Error("INVALID_STATUS");
  }

  const subtitle = String(formData.get("subtitle") ?? "").trim() || null;
  const shortDescription = String(formData.get("shortDescription") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim() || null;
  const tourIdRaw = String(formData.get("tourId") ?? "").trim();
  const tourId: string | null = tourIdRaw || null;

  const eventStartsAt = parseDt(formData, "eventStartsAt");
  const eventEndsAt = parseDt(formData, "eventEndsAt");
  const doorsOpenAt = parseDt(formData, "doorsOpenAt");
  const presaleStartsAt = parseDt(formData, "presaleStartsAt");

  const ticketTaxPercent = Number(
    String(formData.get("ticketTaxPercent") ?? "7").replace(",", "."),
  );
  const ticketTaxRateBasisPoints = [0, 7, 19].includes(ticketTaxPercent)
    ? Math.round(ticketTaxPercent * 100)
    : 700;
  const administrationFeeTaxMode =
    formData.get("administrationFeeTaxMode") === "custom" ? "custom" : "inherit";
  const customFeeTaxPercent = Number(
    String(formData.get("administrationFeeCustomTaxPercent") ?? "7").replace(",", "."),
  );
  const administrationFeeCustomTaxRateBasisPoints =
    administrationFeeTaxMode === "custom"
      ? Math.max(0, Math.round((Number.isFinite(customFeeTaxPercent) ? customFeeTaxPercent : 7) * 100))
      : null;

  const locationMode = String(formData.get("locationMode") ?? "existing");
  let locationId = String(formData.get("locationId") ?? "").trim() || null;
  let venuePlanId = String(formData.get("venuePlanId") ?? "").trim() || null;
  let seatingBookingMode = String(formData.get("seatingBookingMode") ?? "none").trim();
  if (!venuePlanId) seatingBookingMode = "none";
  else if (seatingBookingMode !== "best_available" && seatingBookingMode !== "seat_map_and_best") {
    seatingBookingMode = "seat_map_and_best";
  }

  const showRemainingAvailability = formData.get("showRemainingAvailability") === "on";

  const useOrgDefaults = formData.get("trackingUseOrgDefaults") === "on";
  const trackingGa4MeasurementId =
    String(formData.get("trackingGa4MeasurementId") ?? "").trim() || null;
  const trackingGtmContainerId =
    String(formData.get("trackingGtmContainerId") ?? "").trim() || null;
  const trackingMetaPixelId =
    String(formData.get("trackingMetaPixelId") ?? "").trim() || null;
  const trackingGoogleAdsId =
    String(formData.get("trackingGoogleAdsId") ?? "").trim() || null;

  const hasOverride = Boolean(
    trackingGa4MeasurementId ||
      trackingGtmContainerId ||
      trackingMetaPixelId ||
      trackingGoogleAdsId,
  );

  if (!useOrgDefaults && !hasOverride) {
    throw new Error("TRACKING_REVIEW_REQUIRED");
  }

  if (tourId) {
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!tour) throw new Error("TOUR_NOT_FOUND");
  }

  let locationCity: string | null = null;
  let locationName: string | null = null;
  if (locationMode === "new") {
    locationCity = String(formData.get("newLocationCity") ?? "").trim() || null;
    locationName = String(formData.get("newLocationName") ?? "").trim() || null;
  } else if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, organizationId: membership.organizationId },
      select: { city: true, name: true },
    });
    locationCity = loc?.city ?? null;
    locationName = loc?.name ?? null;
  }

  const slug = await allocateUniqueEventSlug({
    organizationId: membership.organizationId,
    name,
    preferredSlug,
    tourId,
    locationCity,
    locationName,
    eventStartsAt,
  });

  const persistedCoverUrl = await resolveCoverForTourEvent({
    tourId,
    coverImageUrl,
  });
  assertCoverForSaleRelease(status, persistedCoverUrl);

  const taxRate =
    (await prisma.taxRate.findFirst({
      where: {
        organizationId: membership.organizationId,
        active: true,
        isDefaultTicket: true,
      },
    })) ??
    (await prisma.taxRate.findFirst({
      where: { organizationId: membership.organizationId, active: true, rateBps: 700 },
    }));
  if (!taxRate) throw new Error("TAX_RATE_MISSING");

  const catNames = formData.getAll("categoryName").map((v) => String(v).trim());
  const catPrices = formData.getAll("categoryPrice");
  const catCaps = formData.getAll("categoryCapacity");
  const catMax = formData.getAll("categoryMaxPerOrder");
  const catSaleFrom = formData.getAll("categorySaleStartsAt");
  const catSaleTo = formData.getAll("categorySaleEndsAt");

  const categories = catNames
    .map((catName, i) => {
      if (!catName) return null;
      const priceGrossCents = eurosToCents(String(catPrices[i] ?? "0"));
      const capacity = Math.max(1, Math.round(Number(catCaps[i] ?? 100) || 100));
      const maxPerOrder = Math.max(1, Math.round(Number(catMax[i] ?? 10) || 10));
      const saleStartsRaw = String(catSaleFrom[i] ?? "").trim();
      const saleEndsRaw = String(catSaleTo[i] ?? "").trim();
      const saleStartsAt = saleStartsRaw ? new Date(saleStartsRaw) : null;
      const saleEndsAt = saleEndsRaw ? new Date(saleEndsRaw) : null;
      return {
        name: catName,
        priceGrossCents,
        capacity,
        maxPerOrder,
        saleStartsAt:
          saleStartsAt && !Number.isNaN(saleStartsAt.getTime()) ? saleStartsAt : null,
        saleEndsAt: saleEndsAt && !Number.isNaN(saleEndsAt.getTime()) ? saleEndsAt : null,
      };
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  if (categories.length === 0) {
    throw new Error("CATEGORIES_REQUIRED");
  }

  if (locationMode !== "new" && !locationId) {
    throw new Error("LOCATION_REQUIRED");
  }

  const event = await prisma.$transaction(async (tx) => {
    if (locationMode === "new") {
      const locName = String(formData.get("newLocationName") ?? "").trim();
      if (!locName) throw new Error("LOCATION_NAME_REQUIRED");
      let locSlug = slugify(locName);
      const slugTaken = await tx.location.findFirst({
        where: { organizationId: membership.organizationId, slug: locSlug },
      });
      if (slugTaken) locSlug = `${locSlug}-${Date.now().toString(36)}`;

      const createdLoc = await tx.location.create({
        data: {
          organizationId: membership.organizationId,
          name: locName,
          slug: locSlug,
          street: String(formData.get("newLocationStreet") ?? "").trim() || null,
          houseNumber: String(formData.get("newLocationHouseNumber") ?? "").trim() || null,
          postalCode: String(formData.get("newLocationPostalCode") ?? "").trim() || null,
          city: String(formData.get("newLocationCity") ?? "").trim() || null,
          country: String(formData.get("newLocationCountry") ?? "DE").trim() || "DE",
          phone: String(formData.get("newLocationPhone") ?? "").trim() || null,
          homepage: String(formData.get("newLocationHomepage") ?? "").trim() || null,
          maxCapacity: (() => {
            const n = Number(formData.get("newLocationMaxCapacity") ?? "");
            return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
          })(),
        },
      });
      locationId = createdLoc.id;
      venuePlanId = null;
      seatingBookingMode = "none";
    } else {
      const location = await tx.location.findFirst({
        where: { id: locationId!, organizationId: membership.organizationId },
      });
      if (!location) throw new Error("LOCATION_NOT_FOUND");
    }

    if (venuePlanId) {
      if (!locationId) throw new Error("VENUE_PLAN_NEEDS_LOCATION");
      const plan = await tx.venuePlan.findFirst({
        where: {
          id: venuePlanId,
          organizationId: membership.organizationId,
          locationId,
        },
      });
      if (!plan) throw new Error("VENUE_PLAN_NOT_FOUND");
    }

    const created = await tx.event.create({
      data: {
        organizationId: membership.organizationId,
        tourId,
        name,
        subtitle,
        slug,
        status,
        locationId,
        venuePlanId,
        seatingBookingMode,
        eventStartsAt,
        eventEndsAt,
        doorsOpenAt,
        presaleStartsAt,
        shortDescription,
        description,
        coverImageUrl: persistedCoverUrl,
        ticketTaxRateBasisPoints,
        administrationFeeTaxMode,
        administrationFeeCustomTaxRateBasisPoints,
        showRemainingAvailability,
        trackingReviewedAt: new Date(),
        trackingUseOrgDefaults: useOrgDefaults,
        trackingGa4MeasurementId: useOrgDefaults ? null : trackingGa4MeasurementId,
        trackingGtmContainerId: useOrgDefaults ? null : trackingGtmContainerId,
        trackingMetaPixelId: useOrgDefaults ? null : trackingMetaPixelId,
        trackingGoogleAdsId: useOrgDefaults ? null : trackingGoogleAdsId,
        visibleFrom: status === "draft" ? null : new Date(),
      },
    });

    for (let i = 0; i < categories.length; i += 1) {
      const cat = categories[i]!;
      const category = await tx.eventTicketCategory.create({
        data: {
          eventId: created.id,
          taxRateId: taxRate.id,
          name: cat.name,
          priceGrossCents: cat.priceGrossCents,
          capacity: cat.capacity,
          safetyReserve: 0,
          maxPerOrder: cat.maxPerOrder,
          saleStartsAt: cat.saleStartsAt,
          saleEndsAt: cat.saleEndsAt,
          onlineBookable: true,
          boxOfficeBookable: true,
          freeSeating: true,
          sortOrder: i,
          status: "active",
        },
      });

      await tx.inventoryPool.create({
        data: {
          eventId: created.id,
          categoryId: category.id,
          channel: "online",
          capacity: cat.capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
      await tx.inventoryPool.create({
        data: {
          eventId: created.id,
          categoryId: category.id,
          channel: "box_office",
          capacity: cat.capacity,
          soldQuantity: 0,
          heldQuantity: 0,
        },
      });
    }

    return created;
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.created",
    entityType: "event",
    entityId: event.id,
    after: {
      name,
      slug,
      status,
      locationId,
      venuePlanId,
      categoryCount: categories.length,
    },
  });

  if (venuePlanId && seatingBookingMode !== "none") {
    const { ensureEventSeats } = await import("@/lib/seating/materialize");
    await ensureEventSeats(event.id);
  }

  revalidatePath("/admin/events");
  revalidatePath("/admin/locations");
  revalidatePath("/admin/catalog");
  revalidatePath("/events");
  revalidatePath(`/event/${event.slug}`);
  revalidatePath("/");
  revalidatePath("/kasse");
  revalidatePath("/scanner");
  if (tourId) {
    revalidatePath(`/admin/tours/${tourId}`);
    revalidatePath("/admin/tours");
    redirect(`/admin/tours/${tourId}?termin=1`);
  }
  redirect(`/admin/events/${event.id}?saved=1`);
}

export async function updateEventAction(formData: FormData) {
  const { session, membership } = await requireEventWrite();

  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
  });
  if (!event) throw new Error("NOT_FOUND");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const preferredSlug = String(formData.get("slug") ?? "").trim() || null;

  const status = String(formData.get("status") ?? event.status);
  if (!EVENT_STATUSES.includes(status as (typeof EVENT_STATUSES)[number])) {
    throw new Error("INVALID_STATUS");
  }

  const locationIdRaw = String(formData.get("locationId") ?? "").trim();
  const locationId = locationIdRaw || null;
  let locationCity: string | null = null;
  let locationName: string | null = null;
  if (locationId) {
    const location = await prisma.location.findFirst({
      where: { id: locationId, organizationId: membership.organizationId },
    });
    if (!location) throw new Error("LOCATION_NOT_FOUND");
    locationCity = location.city;
    locationName = location.name;
  }

  let venuePlanId = String(formData.get("venuePlanId") ?? "").trim() || null;
  let seatingBookingMode = String(formData.get("seatingBookingMode") ?? "none").trim();
  if (venuePlanId) {
    if (!locationId) throw new Error("VENUE_PLAN_NEEDS_LOCATION");
    const plan = await prisma.venuePlan.findFirst({
      where: {
        id: venuePlanId,
        organizationId: membership.organizationId,
        locationId,
      },
    });
    if (!plan) throw new Error("VENUE_PLAN_NOT_FOUND");
    if (seatingBookingMode !== "best_available" && seatingBookingMode !== "seat_map_and_best") {
      seatingBookingMode = "seat_map_and_best";
    }
  } else {
    venuePlanId = null;
    seatingBookingMode = "none";
  }

  const eventStartsAt = parseDt(formData, "eventStartsAt");
  const eventEndsAt = parseDt(formData, "eventEndsAt");
  const doorsOpenAt = parseDt(formData, "doorsOpenAt");
  const presaleStartsAt = parseDt(formData, "presaleStartsAt");
  const subtitle = String(formData.get("subtitle") ?? "").trim() || null;
  const shortDescription = String(formData.get("shortDescription") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const tourIdRaw = String(formData.get("tourId") ?? "").trim();
  const tourId: string | null = tourIdRaw || null;
  const ticketTaxPercent = Number(
    String(formData.get("ticketTaxPercent") ?? "7").replace(",", "."),
  );
  const ticketTaxRateBasisPoints = [0, 7, 19].includes(ticketTaxPercent)
    ? Math.round(ticketTaxPercent * 100)
    : 700;
  const administrationFeeTaxMode =
    formData.get("administrationFeeTaxMode") === "custom" ? "custom" : "inherit";
  const customFeeTaxPercent = Number(
    String(formData.get("administrationFeeCustomTaxPercent") ?? "7").replace(",", "."),
  );
  const administrationFeeCustomTaxRateBasisPoints =
    administrationFeeTaxMode === "custom"
      ? Math.max(0, Math.round((Number.isFinite(customFeeTaxPercent) ? customFeeTaxPercent : 7) * 100))
      : null;
  const showRemainingAvailability = formData.get("showRemainingAvailability") === "on";

  if (tourId) {
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!tour) throw new Error("TOUR_NOT_FOUND");
  }

  const slug = await allocateUniqueEventSlug({
    organizationId: membership.organizationId,
    name,
    preferredSlug,
    tourId,
    locationCity,
    locationName,
    eventStartsAt,
    excludeEventId: event.id,
  });

  // Cover is owned by CoverImageField (upload API). Only sync when tour link changes.
  let nextCoverUrl = event.coverImageUrl;
  if ((event.tourId ?? null) !== tourId) {
    if (tourId) {
      const previousTourCover = event.tourId
        ? (
            await prisma.tour.findUnique({
              where: { id: event.tourId },
              select: { coverImageUrl: true },
            })
          )?.coverImageUrl
        : null;
      const wasInheriting =
        !event.coverImageUrl?.trim() ||
        event.coverImageUrl === previousTourCover;
      nextCoverUrl = wasInheriting
        ? await resolveCoverForTourEvent({ tourId, coverImageUrl: null })
        : event.coverImageUrl;
    }
  }
  assertCoverForSaleRelease(status, nextCoverUrl);

  await prisma.event.update({
    where: { id: event.id },
    data: {
      name,
      slug,
      status,
      tourId,
      locationId,
      venuePlanId,
      seatingBookingMode,
      subtitle,
      shortDescription,
      description,
      coverImageUrl: nextCoverUrl,
      eventStartsAt,
      eventEndsAt,
      doorsOpenAt,
      presaleStartsAt,
      ticketTaxRateBasisPoints,
      administrationFeeTaxMode,
      administrationFeeCustomTaxRateBasisPoints,
      showRemainingAvailability,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.updated",
    entityType: "event",
    entityId: event.id,
    before: {
      name: event.name,
      slug: event.slug,
      status: event.status,
      venuePlanId: event.venuePlanId,
      ticketTaxRateBasisPoints: event.ticketTaxRateBasisPoints,
      administrationFeeTaxMode: event.administrationFeeTaxMode,
      administrationFeeCustomTaxRateBasisPoints:
        event.administrationFeeCustomTaxRateBasisPoints,
      showRemainingAvailability: event.showRemainingAvailability,
    },
    after: {
      name,
      slug,
      status,
      locationId,
      venuePlanId,
      ticketTaxRateBasisPoints,
      administrationFeeTaxMode,
      administrationFeeCustomTaxRateBasisPoints,
      showRemainingAvailability,
    },
  });

  if (venuePlanId && seatingBookingMode !== "none") {
    const { ensureEventSeats } = await import("@/lib/seating/materialize");
    await ensureEventSeats(event.id);
  }

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath("/events");
  revalidatePath(`/event/${event.slug}`);
  if (event.slug !== slug) revalidatePath(`/event/${slug}`);
  revalidatePath("/");
  revalidatePath("/kasse");
  revalidatePath("/scanner");
  if (tourId) {
    revalidatePath(`/admin/tours/${tourId}`);
    revalidatePath("/admin/tours");
  }
  redirect(`/admin/events/${event.id}?saved=1`);
}
