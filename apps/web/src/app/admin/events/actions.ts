"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  CREATE_EVENT_STATUSES,
  EVENT_STATUSES,
  parseDatetimeLocalBerlin,
  slugify,
} from "@/lib/admin/event-form";
import { parseArtistsJson } from "@/lib/admin/artist-form";
import { syncEventArtistsInTx } from "@/lib/admin/artist-sync";
import { allocateUniqueEventSlug } from "@/lib/admin/unique-event-slug";
import { resolveCoverForTourEvent } from "@/lib/commerce/tour-cover-sync";
import {
  canStartSales,
  hasValidEventCover,
  isEventSalesReleased,
  logSalesActivated,
  logSalesActivationBlocked,
  resolvePersistedEventStatus,
} from "@/lib/commerce/event-sale";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  streetContainsDigits,
  postalCodeContainsNonDigits,
} from "@/lib/commerce/address";
import { ensureSaleClosedEarlyColumn } from "@/lib/commerce/ensure-sale-closed-early";
import { ensureScheduleChangedAtColumn } from "@/lib/commerce/ensure-schedule-changed";
import {
  clampEventCampaignsToNewEnd,
  clampEventCampaignsToNewStart,
  isScheduleChangeAlertsEnabled,
  requiresStrictScheduleConfirm,
  scheduleEndChanged,
  scheduleStartChanged,
  shiftRelativeToStart,
  shouldConfirmScheduleChange,
} from "@/lib/commerce/schedule-change";

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

/** Best-effort DDL when migrate deploy lags (Vercel/Neon). */
async function ensureEventPauseColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "status_before_pause" TEXT`,
    );
  } catch (err) {
    console.error("[ensureEventPauseColumn]", err);
  }
}

function parseDt(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const d = parseDatetimeLocalBerlin(raw);
  if (!d || Number.isNaN(d.getTime())) throw new Error(`INVALID_${key}`);
  return d;
}

function eurosToCents(raw: string) {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export type CreateEventActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Create event from the admin wizard.
 * Returns a result (no redirect()) so the client can clear drafts and navigate
 * without catching NEXT_REDIRECT — which surfaces as a production Application error.
 */
export async function createEventAction(
  formData: FormData,
): Promise<CreateEventActionResult> {
  try {
    return await createEventFromFormData(formData);
  } catch (err) {
    // Auth redirects from requireEventWrite must propagate.
    const { isRedirectError } = await import(
      "next/dist/client/components/redirect-error"
    );
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "CREATE_FAILED";
    return { ok: false, error: message };
  }
}

async function createEventFromFormData(
  formData: FormData,
): Promise<CreateEventActionResult> {
  const { session, membership } = await requireEventWrite();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const preferredSlug = String(formData.get("slug") ?? "").trim() || null;

  const requestedStatus = String(formData.get("status") ?? "draft");
  if (!CREATE_EVENT_STATUSES.includes(requestedStatus as (typeof CREATE_EVENT_STATUSES)[number])) {
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
  const vipDoorsOpenAt = parseDt(formData, "vipDoorsOpenAt");
  const formPresaleStartsAt = parseDt(formData, "presaleStartsAt");
  // Creating already „Im Verkauf“ → start now if empty; Entwurf+Vorverkauf → geplant/Im Verkauf.
  const becomingOnSale = isEventSalesReleased(requestedStatus);
  const presaleStartsAt =
    becomingOnSale && !formPresaleStartsAt ? new Date() : formPresaleStartsAt;
  // Cover may come from tour inherit — resolved below before status.

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

  if (categories.length === 0 && seatingBookingMode === "none") {
    throw new Error("CATEGORIES_REQUIRED");
  }

  if (locationMode !== "new" && !locationId) {
    throw new Error("LOCATION_REQUIRED");
  }

  if (isEventSalesReleased(requestedStatus)) {
    const ready = canStartSales({
      coverImageUrl: persistedCoverUrl,
      eventStartsAt,
      categories: categories.map((c) => ({
        priceGrossCents: c.priceGrossCents,
        capacity: c.capacity,
      })),
    });
    if (!ready.ok) {
      logSalesActivationBlocked({
        eventId: "pending-create",
        reasons: ready.reasons,
        presaleStartsAt,
      });
      if (ready.reasons.includes("MISSING_EVENT_COVER")) {
        throw new Error("MISSING_EVENT_COVER");
      }
      throw new Error("SALES_START_BLOCKED");
    }
  }

  const status = resolvePersistedEventStatus({
    requestedStatus,
    presaleStartsAt,
    coverImageUrl: persistedCoverUrl,
    eventStartsAt,
    categories: categories.map((c) => ({
      priceGrossCents: c.priceGrossCents,
      capacity: c.capacity,
    })),
  });

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
          street: (() => {
            const street = String(formData.get("newLocationStreet") ?? "").trim() || null;
            if (street && streetContainsDigits(street)) {
              throw new Error(STREET_NO_NUMBERS_MESSAGE);
            }
            return street;
          })(),
          houseNumber: String(formData.get("newLocationHouseNumber") ?? "").trim() || null,
          postalCode: (() => {
            const postal = String(formData.get("newLocationPostalCode") ?? "").trim() || null;
            if (postal && (postalCodeContainsNonDigits(postal) || !/^\d{4,5}$/.test(postal))) {
              throw new Error(POSTAL_CODE_DIGITS_ONLY_MESSAGE);
            }
            return postal;
          })(),
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

      // Optional: saalplan already prepared in wizard (IDs set) OR create shell from form fields
      const preparedPlanId = String(formData.get("venuePlanId") ?? "").trim();
      if (preparedPlanId) {
        venuePlanId = preparedPlanId;
      } else if (formData.get("createVenuePlan") === "on") {
        const { metersToCm } = await import("@/lib/saalplan/types");
        const { createStage } = await import("@/lib/saalplan/snap");
        const planName =
          String(formData.get("newVenuePlanName") ?? "").trim() || `Saalplan ${locName}`;
        const widthM = Number(String(formData.get("newVenuePlanWidthM") ?? "20").replace(",", "."));
        const depthM = Number(String(formData.get("newVenuePlanDepthM") ?? "15").replace(",", "."));
        const widthCm = metersToCm(Number.isFinite(widthM) && widthM >= 2 ? widthM : 20);
        const depthCm = metersToCm(Number.isFinite(depthM) && depthM >= 2 ? depthM : 15);
        const withStage = formData.get("newVenuePlanWithStage") === "on";
        const plan = await tx.venuePlan.create({
          data: {
            organizationId: membership.organizationId,
            locationId: createdLoc.id,
            name: planName,
            widthCm,
            depthCm,
            objects: (withStage ? [createStage(widthCm, depthCm)] : []) as Prisma.InputJsonValue,
          },
        });
        venuePlanId = plan.id;
        if (seatingBookingMode === "none") seatingBookingMode = "seat_map_and_best";
      } else {
        venuePlanId = null;
        seatingBookingMode = "none";
      }
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
        vipDoorsOpenAt,
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

    const artistDrafts = parseArtistsJson(formData.get("artistsJson"));
    if (artistDrafts.length > 0) {
      await syncEventArtistsInTx(
        tx,
        membership.organizationId,
        created.id,
        artistDrafts,
        { asTourOverride: Boolean(tourId) },
      );
    } else if (tourId) {
      // Empty line-up on a tour date → inherit tour artists
      await tx.event.update({
        where: { id: created.id },
        data: { artistsUseTourDefaults: true },
      });
    }

    // Tour date: inherit name/copy unless form explicitly overrides
    if (tourId) {
      const detailsOverride = String(formData.get("detailsUseTourDefaults") ?? "").trim();
      await tx.event.update({
        where: { id: created.id },
        data: {
          detailsUseTourDefaults:
            detailsOverride !== "0" && detailsOverride !== "false",
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
      artistCount: parseArtistsJson(formData.get("artistsJson")).length,
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
    return {
      ok: true,
      redirectTo: `/admin/tours/${tourId}?termin=1${
        hasValidEventCover({ coverImageUrl: persistedCoverUrl }) ? "" : "&coverMissing=1"
      }`,
    };
  }
  const coverQs = hasValidEventCover({ coverImageUrl: persistedCoverUrl })
    ? ""
    : "&coverMissing=1";
  return {
    ok: true,
    redirectTo:
      event.venuePlanId && event.seatingBookingMode !== "none"
        ? `/admin/events/${event.id}?saved=1${coverQs}#zuordnung`
        : `/admin/events/${event.id}?saved=1${coverQs}`,
  };
}

export async function updateEventAction(formData: FormData) {
  const { session, membership } = await requireEventWrite();
  await ensureEventPauseColumn();
  await ensureScheduleChangedAtColumn();
  await ensureSaleClosedEarlyColumn();

  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    include: {
      location: { select: { name: true, city: true } },
      tour: { select: { coverImageUrl: true, visibility: true } },
      ticketCategories: { select: { priceGrossCents: true, capacity: true } },
    },
  });
  if (!event) throw new Error("NOT_FOUND");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const preferredSlug = String(formData.get("slug") ?? "").trim() || null;

  const requestedStatus = String(formData.get("status") ?? event.status);
  if (!EVENT_STATUSES.includes(requestedStatus as (typeof EVENT_STATUSES)[number])) {
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

  const { seatOptFromFormData } = await import("@/lib/seating/seat-optimization-settings");
  const seatOptFields = seatOptFromFormData(formData);

  const eventStartsAt = parseDt(formData, "eventStartsAt");
  let eventEndsAt = parseDt(formData, "eventEndsAt");
  let doorsOpenAt = parseDt(formData, "doorsOpenAt");
  // VIP-Einlass is edited on the VIP category only; keep stored value unless start moves.
  let vipDoorsOpenAt = event.vipDoorsOpenAt;
  const formPresaleStartsAt = parseDt(formData, "presaleStartsAt");
  const scheduleChangeConfirmed =
    String(formData.get("scheduleChangeConfirmed") ?? "") === "1";
  const startChanged = scheduleStartChanged(event.eventStartsAt, eventStartsAt);

  const ticketsSold = startChanged
    ? await prisma.ticket.count({ where: { eventId: event.id } })
    : 0;
  const alertsEnabled = isScheduleChangeAlertsEnabled();
  const needsScheduleConfirm =
    alertsEnabled &&
    startChanged &&
    shouldConfirmScheduleChange({ status: event.status, ticketsSold });

  if (needsScheduleConfirm && !scheduleChangeConfirmed) {
    throw new Error("SCHEDULE_CHANGE_CONFIRM_REQUIRED");
  }

  // Confirmed start move, or silent correction while alerts kill switch is off:
  // preserve relative Ende / Einlass offsets from the stored start.
  const applyScheduleOffsets =
    startChanged &&
    (scheduleChangeConfirmed ||
      (!alertsEnabled &&
        shouldConfirmScheduleChange({ status: event.status, ticketsSold })));
  if (applyScheduleOffsets) {
    eventEndsAt = shiftRelativeToStart(event.eventEndsAt, event.eventStartsAt, eventStartsAt);
    doorsOpenAt = shiftRelativeToStart(event.doorsOpenAt, event.eventStartsAt, eventStartsAt);
    vipDoorsOpenAt = shiftRelativeToStart(
      event.vipDoorsOpenAt,
      event.eventStartsAt,
      eventStartsAt,
    );
  }

  const notifyBuyers =
    alertsEnabled &&
    startChanged &&
    scheduleChangeConfirmed &&
    (requiresStrictScheduleConfirm(event.status) || ticketsSold > 0);

  // Manual „Im Verkauf“: Vorverkaufsstart becomes now so the shop is buyable immediately.
  const becomingOnSale =
    isEventSalesReleased(requestedStatus) && !isEventSalesReleased(event.status);
  const presaleStartsAt = becomingOnSale ? new Date() : formPresaleStartsAt;
  // Cover may change with tour link — resolve below before status.
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
  const sepaMinRaw = String(formData.get("sepaMinDaysBeforeEvent") ?? "").trim();
  const sepaMinParsed = sepaMinRaw === "" ? null : Number(sepaMinRaw);
  const sepaMinDaysBeforeEvent =
    sepaMinParsed != null && Number.isFinite(sepaMinParsed)
      ? Math.max(0, Math.round(sepaMinParsed))
      : null;

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
  let artistsUseTourDefaults = event.artistsUseTourDefaults;
  let detailsUseTourDefaults = event.detailsUseTourDefaults;
  const detailsFlagRaw = String(formData.get("detailsUseTourDefaults") ?? "").trim();
  if (detailsFlagRaw === "0" || detailsFlagRaw === "false") {
    detailsUseTourDefaults = false;
  } else if (detailsFlagRaw === "1" || detailsFlagRaw === "true" || detailsFlagRaw === "on") {
    detailsUseTourDefaults = true;
  }
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
      const eventArtistCount = await prisma.eventArtist.count({
        where: { eventId: event.id },
      });
      // Keep existing event line-up as override when joining a tour; otherwise inherit.
      artistsUseTourDefaults = eventArtistCount === 0;
      // Joining a tour: inherit details unless admin explicitly overrode in this save.
      if (detailsFlagRaw === "") {
        detailsUseTourDefaults = true;
      }
    } else {
      // Leaving a tour: keep any event artists as the sole line-up.
      artistsUseTourDefaults = true;
      detailsUseTourDefaults = true;
    }
  }
  if (!tourId) {
    detailsUseTourDefaults = true;
  }
  const statusReadyInput = {
    coverImageUrl: nextCoverUrl,
    eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  };

  if (becomingOnSale || isEventSalesReleased(requestedStatus)) {
    // Hard block manual / persisted Im Verkauf without readiness (cover etc.)
    if (
      becomingOnSale ||
      (isEventSalesReleased(requestedStatus) && !isEventSalesReleased(event.status))
    ) {
      const ready = canStartSales(statusReadyInput);
      if (!ready.ok) {
        logSalesActivationBlocked({
          eventId: event.id,
          reasons: ready.reasons,
          presaleStartsAt,
        });
        if (ready.reasons.includes("MISSING_EVENT_COVER")) {
          throw new Error("MISSING_EVENT_COVER");
        }
        throw new Error("SALES_START_BLOCKED");
      }
    }
  }

  const status = resolvePersistedEventStatus({
    requestedStatus,
    presaleStartsAt,
    coverImageUrl: nextCoverUrl,
    eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  });

  if (
    isEventSalesReleased(status) &&
    !isEventSalesReleased(event.status)
  ) {
    logSalesActivated({
      eventId: event.id,
      fromStatus: event.status,
      trigger: becomingOnSale ? "manual" : "save",
    });
  }

  const { isEventPausable } = await import("@/lib/commerce/event-sale");
  const statusBeforePause =
    status === "paused"
      ? event.status === "paused"
        ? event.statusBeforePause
        : isEventPausable(event.status)
          ? event.status
          : "presale_active"
      : null;

  // While alerts kill switch is off: still allow start edits, but do not stamp scheduleChangedAt.
  const scheduleChangedAt =
    alertsEnabled && startChanged && scheduleChangeConfirmed
      ? new Date()
      : event.scheduleChangedAt;
  const stampScheduleChangedAt =
    alertsEnabled && startChanged && scheduleChangeConfirmed;

  const oldStartsAt = event.eventStartsAt;
  const oldEndsAt = event.eventEndsAt;
  const oldDoorsOpenAt = event.doorsOpenAt;
  const oldVipDoorsOpenAt = event.vipDoorsOpenAt;

  await prisma.event.update({
    where: { id: event.id },
    data: {
      name,
      slug,
      status,
      statusBeforePause,
      tourId,
      locationId,
      venuePlanId,
      seatingBookingMode,
      ...seatOptFields,
      subtitle,
      shortDescription,
      description,
      coverImageUrl: nextCoverUrl,
      artistsUseTourDefaults,
      detailsUseTourDefaults,
      eventStartsAt,
      eventEndsAt,
      doorsOpenAt,
      vipDoorsOpenAt,
      presaleStartsAt,
      ticketTaxRateBasisPoints,
      administrationFeeTaxMode,
      administrationFeeCustomTaxRateBasisPoints,
      showRemainingAvailability,
      sepaMinDaysBeforeEvent,
      ...(stampScheduleChangedAt ? { scheduleChangedAt } : {}),
      organizerName: String(formData.get("organizerName") ?? "").trim() || null,
      organizerContact: String(formData.get("organizerContact") ?? "").trim() || null,
      organizerStreet: String(formData.get("organizerStreet") ?? "").trim() || null,
      organizerHouseNumber: String(formData.get("organizerHouseNumber") ?? "").trim() || null,
      organizerPostalCode: String(formData.get("organizerPostalCode") ?? "").trim() || null,
      organizerCity: String(formData.get("organizerCity") ?? "").trim() || null,
      organizerEmail: String(formData.get("organizerEmail") ?? "").trim() || null,
      organizerPhone: String(formData.get("organizerPhone") ?? "").trim() || null,
      organizerWebsite: String(formData.get("organizerWebsite") ?? "").trim() || null,
    },
  });

  // Keep VIP category Sonder-Einlass in sync with event.vipDoorsOpenAt (tickets / check-in).
  if (vipDoorsOpenAt?.getTime() !== oldVipDoorsOpenAt?.getTime()) {
    await prisma.eventTicketCategory.updateMany({
      where: {
        eventId: event.id,
        OR: [{ categoryKind: "vip" }, { name: { startsWith: "VIP", mode: "insensitive" } }],
        status: "active",
      },
      data: {
        doorsOpenAt: vipDoorsOpenAt,
        doorsNote: vipDoorsOpenAt
          ? "VIP-Einlass: eine halbe Stunde vor dem regulären Einlass"
          : null,
      },
    });
  }

  let campaignsAdjusted = 0;
  if (startChanged && eventStartsAt) {
    const clamp = await clampEventCampaignsToNewStart(prisma, event.id, eventStartsAt);
    campaignsAdjusted += clamp.adjusted;
  }
  const endChanged = scheduleEndChanged(oldEndsAt, eventEndsAt);
  if (endChanged && eventEndsAt) {
    const clamp = await clampEventCampaignsToNewEnd(prisma, event.id, eventEndsAt);
    campaignsAdjusted += clamp.adjusted;
  }

  let buyersEmailed = 0;
  if (notifyBuyers) {
    const { notifyBuyersOfScheduleChange } = await import(
      "@/lib/commerce/notify-schedule-change"
    );
    const locationLabel =
      locationName || event.location?.name
        ? `${locationName ?? event.location?.name ?? ""}${
            (locationCity ?? event.location?.city)
              ? `, ${locationCity ?? event.location?.city}`
              : ""
          }`
        : null;
    const notified = await notifyBuyersOfScheduleChange({
      organizationId: membership.organizationId,
      eventId: event.id,
      eventName: name,
      eventSlug: slug,
      locationLabel,
      oldStartsAt,
      newStartsAt: eventStartsAt,
      oldEndsAt,
      newEndsAt: eventEndsAt,
      oldDoorsOpenAt,
      newDoorsOpenAt: doorsOpenAt,
    });
    buyersEmailed = notified.emailed;
  }

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
      eventStartsAt: oldStartsAt,
      eventEndsAt: oldEndsAt,
      doorsOpenAt: oldDoorsOpenAt,
      vipDoorsOpenAt: oldVipDoorsOpenAt,
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
      eventStartsAt,
      eventEndsAt,
      doorsOpenAt,
      vipDoorsOpenAt,
      ...(becomingOnSale ? { presaleStartsAt } : {}),
      ...(startChanged && scheduleChangeConfirmed
        ? {
            ...(stampScheduleChangedAt ? { scheduleChangedAt } : {}),
            scheduleChangeAlertsEnabled: alertsEnabled,
            campaignsAdjusted,
            buyersEmailed,
          }
        : {}),
    },
  });

  if (venuePlanId && seatingBookingMode !== "none") {
    const { ensureEventSeats } = await import("@/lib/seating/materialize");
    await ensureEventSeats(event.id);
  }

  // Soft save: keep form mounted, but revalidate this event so seating UI can refresh.
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath("/events");
  revalidatePath(`/event/${event.slug}`);
  revalidatePath(`/embed/event/${event.slug}`);
  if (event.slug !== slug) {
    revalidatePath(`/event/${slug}`);
    revalidatePath(`/embed/event/${slug}`);
  }
  revalidatePath("/");
  revalidatePath("/kasse");
  revalidatePath("/scanner");
  if (tourId) {
    revalidatePath(`/admin/tours/${tourId}`);
    revalidatePath("/admin/tours");
  }
  return {
    ok: true as const,
    eventId: event.id,
    venuePlanId,
    seatingBookingMode,
    scheduleChanged: Boolean(stampScheduleChangedAt),
    buyersEmailed,
    campaignsAdjusted,
    coverMissing: !hasValidEventCover({
      coverImageUrl: nextCoverUrl,
      tour: event.tour,
    }),
  };
}

function revalidateEventSurfaces(opts: {
  eventId: string;
  slug: string;
  tourId?: string | null;
}) {
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${opts.eventId}`);
  revalidatePath("/events");
  revalidatePath(`/event/${opts.slug}`);
  revalidatePath(`/embed/event/${opts.slug}`);
  revalidatePath("/");
  revalidatePath("/kasse");
  revalidatePath("/scanner");
  if (opts.tourId) {
    revalidatePath(`/admin/tours/${opts.tourId}`);
    revalidatePath("/admin/tours");
  }
}

async function countSoldTickets(eventId: string) {
  return prisma.ticket.count({ where: { eventId } });
}

export type PauseResumeResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

export async function pauseEventSalesAction(eventId: string): Promise<PauseResumeResult> {
  const { session, membership } = await requireEventWrite();
  await ensureEventPauseColumn();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      slug: true,
      status: true,
      tourId: true,
      statusBeforePause: true,
      presaleStartsAt: true,
    },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };

  const { isEventPausable, effectiveEventStatus } = await import("@/lib/commerce/event-sale");
  const display = effectiveEventStatus(event);
  if (!isEventPausable(display) && !isEventPausable(event.status)) {
    return { ok: false, error: "Nur Events im Verkauf können pausiert werden." };
  }

  const previousStatus = isEventPausable(event.status) ? event.status : display;

  await prisma.event.update({
    where: { id: event.id },
    data: {
      status: "paused",
      statusBeforePause: previousStatus,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.sales_paused",
    entityType: "event",
    entityId: event.id,
    before: { status: event.status },
    after: { status: "paused", statusBeforePause: previousStatus },
  });

  revalidateEventSurfaces({
    eventId: event.id,
    slug: event.slug,
    tourId: event.tourId,
  });
  return { ok: true, status: "paused" };
}

export async function resumeEventSalesAction(eventId: string): Promise<PauseResumeResult> {
  const { session, membership } = await requireEventWrite();
  await ensureEventPauseColumn();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      slug: true,
      status: true,
      tourId: true,
      statusBeforePause: true,
    },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };
  if (event.status !== "paused") {
    return { ok: false, error: "Das Event ist nicht pausiert." };
  }

  const restoreStatus =
    event.statusBeforePause === "published" || event.statusBeforePause === "presale_active"
      ? event.statusBeforePause
      : "presale_active";

  await prisma.event.update({
    where: { id: event.id },
    data: {
      status: restoreStatus,
      statusBeforePause: null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.sales_resumed",
    entityType: "event",
    entityId: event.id,
    before: { status: "paused", statusBeforePause: event.statusBeforePause },
    after: { status: restoreStatus },
  });

  revalidateEventSurfaces({
    eventId: event.id,
    slug: event.slug,
    tourId: event.tourId,
  });
  return { ok: true, status: restoreStatus };
}

export type CloseSaleEarlyResult =
  | { ok: true; saleClosedEarly: boolean }
  | { ok: false; error: string };

/**
 * End online/box-office sale early while keeping the event ready for check-in.
 * Also unlocks production scanning before doors open.
 */
export async function closeEventSaleEarlyAction(
  eventId: string,
): Promise<CloseSaleEarlyResult> {
  const { session, membership } = await requireEventWrite();
  await ensureSaleClosedEarlyColumn();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      slug: true,
      status: true,
      tourId: true,
      saleClosedEarly: true,
      presaleEndsAt: true,
    },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };
  if (event.status === "cancelled" || event.status === "completed") {
    return { ok: false, error: "Für abgesagte oder beendete Events geht das nicht." };
  }
  if (event.saleClosedEarly) {
    return { ok: false, error: "Der Verkauf ist bereits vorzeitig beendet." };
  }
  if (
    event.status !== "presale_active" &&
    event.status !== "published" &&
    event.status !== "paused" &&
    event.status !== "sold_out" &&
    event.status !== "announcement"
  ) {
    return { ok: false, error: "Nur Events im oder nach dem Verkauf können beendet werden." };
  }

  const now = new Date();
  await prisma.event.update({
    where: { id: event.id },
    data: {
      saleClosedEarly: true,
      // Also close the time window so other sale checks stay consistent
      ...(event.presaleEndsAt && event.presaleEndsAt.getTime() < now.getTime()
        ? {}
        : { presaleEndsAt: now }),
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.sale_closed_early",
    entityType: "event",
    entityId: event.id,
    before: { saleClosedEarly: false, presaleEndsAt: event.presaleEndsAt },
    after: { saleClosedEarly: true, presaleEndsAt: now },
  });

  revalidateEventSurfaces({
    eventId: event.id,
    slug: event.slug,
    tourId: event.tourId,
  });
  return { ok: true, saleClosedEarly: true };
}

/** Re-open online/box-office sale after an early close (does not change doors time). */
export async function reopenEventSaleAction(eventId: string): Promise<CloseSaleEarlyResult> {
  const { session, membership } = await requireEventWrite();
  await ensureSaleClosedEarlyColumn();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      slug: true,
      status: true,
      tourId: true,
      saleClosedEarly: true,
      eventStartsAt: true,
      doorsOpenAt: true,
    },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };
  if (!event.saleClosedEarly) {
    return { ok: false, error: "Der Verkauf ist nicht vorzeitig beendet." };
  }

  await prisma.event.update({
    where: { id: event.id },
    data: {
      saleClosedEarly: false,
      // Clear early-end timestamp so sale window can reopen
      presaleEndsAt: null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.sale_reopened",
    entityType: "event",
    entityId: event.id,
    before: { saleClosedEarly: true },
    after: { saleClosedEarly: false, presaleEndsAt: null },
  });

  revalidateEventSurfaces({
    eventId: event.id,
    slug: event.slug,
    tourId: event.tourId,
  });
  return { ok: true, saleClosedEarly: false };
}

export type DeleteOrCancelResult =
  | { ok: true; mode: "deleted" }
  | { ok: true; mode: "cancelled" }
  | { ok: false; error: string };

/**
 * Hard-delete when no tickets sold; otherwise cancel (status=cancelled) and keep data.
 */
export async function deleteOrCancelEventAction(
  eventId: string,
): Promise<DeleteOrCancelResult> {
  const { session, membership } = await requireEventWrite();
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      tourId: true,
    },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };

  const sold = await countSoldTickets(event.id);
  if (sold > 0) {
    if (event.status === "cancelled") {
      return { ok: false, error: "Das Event ist bereits abgesagt." };
    }
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "cancelled", statusBeforePause: null },
    });
    await writeAudit({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      action: "event.cancelled",
      entityType: "event",
      entityId: event.id,
      before: { status: event.status },
      after: { status: "cancelled", soldTickets: sold },
    });
    revalidateEventSurfaces({
      eventId: event.id,
      slug: event.slug,
      tourId: event.tourId,
    });
    return { ok: true, mode: "cancelled" };
  }

  // No tickets — hard delete. Clear cart lines that would block category cascade.
  try {
    await prisma.$transaction(async (tx) => {
      const categories = await tx.eventTicketCategory.findMany({
        where: { eventId: event.id },
        select: { id: true },
      });
      const categoryIds = categories.map((c) => c.id);
      if (categoryIds.length > 0) {
        await tx.cartItem.deleteMany({ where: { categoryId: { in: categoryIds } } });
      }
      // Order items without tickets shouldn't exist, but guard anyway.
      const orderItems = await tx.orderItem.count({ where: { eventId: event.id } });
      if (orderItems > 0) {
        throw new Error("HAS_ORDERS");
      }
      await tx.event.delete({ where: { id: event.id } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "DELETE_FAILED";
    if (message === "HAS_ORDERS") {
      return {
        ok: false,
        error: "Es gibt noch Bestellungen zu diesem Event — bitte absagen statt löschen.",
      };
    }
    console.error("[deleteOrCancelEventAction] delete failed", event.id, err);
    return { ok: false, error: "Löschen fehlgeschlagen. Bitte erneut versuchen." };
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.deleted",
    entityType: "event",
    entityId: event.id,
    before: { name: event.name, slug: event.slug, status: event.status },
    after: { deleted: true },
  });

  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath(`/event/${event.slug}`);
  revalidatePath(`/embed/event/${event.slug}`);
  revalidatePath("/");
  revalidatePath("/kasse");
  if (event.tourId) {
    revalidatePath(`/admin/tours/${event.tourId}`);
    revalidatePath("/admin/tours");
  }
  return { ok: true, mode: "deleted" };
}

/**
 * Clear public „geänderter Termin“ banner (scheduleChangedAt) without changing dates.
 */
export async function clearScheduleChangedNoticeAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, membership } = await requireEventWrite();
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return { ok: false, error: "Event fehlt." };

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: { id: true, slug: true, tourId: true, scheduleChangedAt: true },
  });
  if (!event) return { ok: false, error: "Event nicht gefunden." };
  if (!event.scheduleChangedAt) return { ok: true };

  await prisma.event.update({
    where: { id: event.id },
    data: { scheduleChangedAt: null },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.schedule_notice_cleared",
    entityType: "event",
    entityId: event.id,
    before: { scheduleChangedAt: event.scheduleChangedAt.toISOString() },
    after: { scheduleChangedAt: null },
  });

  revalidateEventSurfaces({
    eventId: event.id,
    slug: event.slug,
    tourId: event.tourId,
  });
  return { ok: true };
}
