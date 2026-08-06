"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { parseVenuePlanObjects, metersToCm } from "@/lib/saalplan/types";
import {
  parsePlanCategorySlots,
  stripPlanCategoryPaint,
} from "@/lib/saalplan/category-slots";
import { createStage } from "@/lib/saalplan/snap";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  streetContainsDigits,
  postalCodeContainsNonDigits,
} from "@/lib/commerce/address";

async function requireLocationsWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "locations:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

async function createVenuePlanRecord(input: {
  organizationId: string;
  locationId: string;
  name: string;
  widthM: number;
  depthM: number;
  withStage: boolean;
}) {
  const widthCm = metersToCm(
    Number.isFinite(input.widthM) && input.widthM >= 2 ? input.widthM : 20,
  );
  const depthCm = metersToCm(
    Number.isFinite(input.depthM) && input.depthM >= 2 ? input.depthM : 15,
  );
  const objects = input.withStage ? [createStage(widthCm, depthCm)] : [];
  return prisma.venuePlan.create({
    data: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      name: input.name,
      widthCm,
      depthCm,
      objects: objects as Prisma.InputJsonValue,
    },
  });
}

export async function createVenuePlanAction(formData: FormData) {
  const { membership } = await requireLocationsWrite();
  const locationId = String(formData.get("locationId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Saalplan";
  const widthM = Number(String(formData.get("widthM") ?? "20").replace(",", "."));
  const depthM = Number(String(formData.get("depthM") ?? "15").replace(",", "."));
  const withStage = formData.get("withStage") === "on";

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: membership.organizationId },
  });
  if (!location) throw new Error("LOCATION_NOT_FOUND");

  const plan = await createVenuePlanRecord({
    organizationId: membership.organizationId,
    locationId: location.id,
    name,
    widthM,
    depthM,
    withStage,
  });

  revalidatePath(`/admin/locations/${location.id}`);
  redirect(`/admin/saalplan/${plan.id}`);
}

export type WizardPlanPrepareResult = {
  locationId: string;
  locationName: string;
  locationCity: string | null;
  venuePlanId: string;
  planName: string;
  widthCm: number;
  depthCm: number;
  objects: ReturnType<typeof parseVenuePlanObjects>;
  categorySlots: ReturnType<typeof parsePlanCategorySlots>;
  seatCapacity: number;
  sizeLabel: string;
};

/** Create location (optional) + venue plan shell for the event wizard — no redirect. */
export async function prepareWizardLocationPlanAction(
  formData: FormData,
): Promise<WizardPlanPrepareResult> {
  const { membership } = await requireLocationsWrite();
  const { slugify } = await import("@/lib/admin/event-form");
  const { cmToMetersLabel, planSeatCapacity } = await import("@/lib/saalplan/types");

  const mode = String(formData.get("locationMode") ?? "existing");
  let locationId = String(formData.get("locationId") ?? "").trim();
  const planName = String(formData.get("planName") ?? "").trim() || "Saalplan";
  const widthM = Number(String(formData.get("widthM") ?? "20").replace(",", "."));
  const depthM = Number(String(formData.get("depthM") ?? "15").replace(",", "."));
  const withStage = formData.get("withStage") === "on" || formData.get("withStage") === "true";

  let locationName = "";
  let locationCity: string | null = null;

  if (mode === "new" || !locationId) {
    const locName = String(formData.get("newLocationName") ?? "").trim();
    if (!locName) throw new Error("LOCATION_NAME_REQUIRED");
    let locSlug = slugify(locName);
    const slugTaken = await prisma.location.findFirst({
      where: { organizationId: membership.organizationId, slug: locSlug },
    });
    if (slugTaken) locSlug = `${locSlug}-${Date.now().toString(36)}`;

    const createdLoc = await prisma.location.create({
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
    locationName = createdLoc.name;
    locationCity = createdLoc.city;
  } else {
    const location = await prisma.location.findFirst({
      where: { id: locationId, organizationId: membership.organizationId },
    });
    if (!location) throw new Error("LOCATION_NOT_FOUND");
    locationName = location.name;
    locationCity = location.city;
  }

  const plan = await createVenuePlanRecord({
    organizationId: membership.organizationId,
    locationId,
    name: planName,
    widthM,
    depthM,
    withStage,
  });

  const objects = parseVenuePlanObjects(plan.objects);
  const categorySlots = parsePlanCategorySlots(plan.categorySlots);
  revalidatePath(`/admin/locations/${locationId}`);

  return {
    locationId,
    locationName,
    locationCity,
    venuePlanId: plan.id,
    planName: plan.name,
    widthCm: plan.widthCm,
    depthCm: plan.depthCm,
    objects,
    categorySlots,
    seatCapacity: planSeatCapacity(objects),
    sizeLabel: `${cmToMetersLabel(plan.widthCm)} × ${cmToMetersLabel(plan.depthCm)}`,
  };
}

export type SaveVenuePlanResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function saveVenuePlanAction(
  formData: FormData,
): Promise<SaveVenuePlanResult> {
  const { membership } = await requireLocationsWrite();
  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Saalplan";
  const widthCm = Math.max(200, Math.round(Number(formData.get("widthCm") ?? 2000)));
  const depthCm = Math.max(200, Math.round(Number(formData.get("depthCm") ?? 1500)));
  const objects = parseVenuePlanObjects(
    (() => {
      try {
        return JSON.parse(String(formData.get("objects") ?? "[]"));
      } catch {
        return [];
      }
    })(),
  ).map(stripPlanCategoryPaint);
  // Geometry save never invents Preiskategorien from standing zones or painted slots.
  const categorySlots = parsePlanCategorySlots([]);

  const plan = await prisma.venuePlan.findFirst({
    where: { id: planId, organizationId: membership.organizationId },
  });
  if (!plan) return { ok: false, error: "Saalplan nicht gefunden.", code: "NOT_FOUND" };

  const {
    checkVenuePlanGeometryFrozen,
    geometryPayloadChangesSeatIdentities,
    GEOMETRY_FROZEN_MESSAGE,
  } = await import("@/lib/seating/geometry-freeze");

  const freeze = await checkVenuePlanGeometryFrozen(plan.id);
  if (freeze.frozen) {
    const geometryChanged = geometryPayloadChangesSeatIdentities({
      previousWidthCm: plan.widthCm,
      previousDepthCm: plan.depthCm,
      previousObjects: plan.objects,
      nextWidthCm: widthCm,
      nextDepthCm: depthCm,
      nextObjects: objects,
    });
    if (geometryChanged) {
      return {
        ok: false,
        error: freeze.message || GEOMETRY_FROZEN_MESSAGE,
        code: "GEOMETRY_FROZEN",
      };
    }
    // Name-only (and legacy categorySlots) still allowed while frozen.
    await prisma.venuePlan.update({
      where: { id: plan.id },
      data: {
        name,
        categorySlots: categorySlots as Prisma.InputJsonValue,
      },
    });
    revalidatePath(`/admin/saalplan/${plan.id}`);
    revalidatePath(`/admin/locations/${plan.locationId}`);
    return { ok: true };
  }

  await prisma.venuePlan.update({
    where: { id: plan.id },
    data: {
      name,
      widthCm,
      depthCm,
      objects: objects as Prisma.InputJsonValue,
      categorySlots: categorySlots as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  // Keep event seat inventory in sync (new seats stay unassigned until Preiskategorie-Zuordnung).
  const { syncSeatsForVenuePlan } = await import("@/lib/seating/materialize");
  await syncSeatsForVenuePlan(plan.id);

  revalidatePath(`/admin/saalplan/${plan.id}`);
  revalidatePath(`/admin/locations/${plan.locationId}`);
  revalidatePath("/admin/events");
  return { ok: true };
}

async function deleteVenuePlanRecord(input: {
  organizationId: string;
  planId: string;
  requireUnused: boolean;
}): Promise<{ deleted: boolean; locationId?: string; reason?: string }> {
  const plan = await prisma.venuePlan.findFirst({
    where: { id: input.planId, organizationId: input.organizationId },
    include: { _count: { select: { events: true } } },
  });
  if (!plan) return { deleted: false, reason: "NOT_FOUND" };
  if (input.requireUnused && plan._count.events > 0) {
    return { deleted: false, locationId: plan.locationId, reason: "IN_USE" };
  }

  // Never wipe a plan once linked events have sale/inventory freeze.
  const { checkVenuePlanGeometryFrozen } = await import("@/lib/seating/geometry-freeze");
  const freeze = await checkVenuePlanGeometryFrozen(plan.id);
  if (freeze.frozen) {
    return { deleted: false, locationId: plan.locationId, reason: "GEOMETRY_FROZEN" };
  }

  // EventSeat has no FK to VenuePlan — clear any leftover inventory rows first.
  if (typeof prisma.eventSeat?.deleteMany === "function") {
    await prisma.eventSeat.deleteMany({ where: { venuePlanId: plan.id } });
  }
  await prisma.venuePlan.delete({ where: { id: plan.id } });
  return { deleted: true, locationId: plan.locationId };
}

export async function deleteVenuePlanAction(formData: FormData) {
  const { membership } = await requireLocationsWrite();
  const planId = String(formData.get("planId") ?? "");
  const result = await deleteVenuePlanRecord({
    organizationId: membership.organizationId,
    planId,
    requireUnused: false,
  });
  if (!result.deleted) {
    if (result.reason === "GEOMETRY_FROZEN") {
      const { GEOMETRY_FROZEN_MESSAGE } = await import("@/lib/seating/geometry-freeze");
      throw new Error(GEOMETRY_FROZEN_MESSAGE);
    }
    throw new Error("NOT_FOUND");
  }
  revalidatePath(`/admin/locations/${result.locationId}`);
  redirect(`/admin/locations/${result.locationId}`);
}

/**
 * Discard an unfinished wizard/editor plan without redirect.
 * Safe only when no event still references the plan.
 */
export async function discardVenuePlanQuietAction(
  planId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { membership } = await requireLocationsWrite();
  const id = String(planId ?? "").trim();
  if (!id) return { ok: false, reason: "MISSING_ID" };

  const result = await deleteVenuePlanRecord({
    organizationId: membership.organizationId,
    planId: id,
    requireUnused: true,
  });
  if (!result.deleted) {
    return { ok: false, reason: result.reason ?? "NOT_FOUND" };
  }
  if (result.locationId) {
    revalidatePath(`/admin/locations/${result.locationId}`);
  }
  return { ok: true };
}
