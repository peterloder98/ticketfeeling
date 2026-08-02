"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { parseVenuePlanObjects, metersToCm } from "@/lib/saalplan/types";
import { createStage } from "@/lib/saalplan/snap";

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

  const widthCm = metersToCm(Number.isFinite(widthM) && widthM >= 2 ? widthM : 20);
  const depthCm = metersToCm(Number.isFinite(depthM) && depthM >= 2 ? depthM : 15);
  const objects = withStage ? [createStage(widthCm, depthCm)] : [];

  const plan = await prisma.venuePlan.create({
    data: {
      organizationId: membership.organizationId,
      locationId: location.id,
      name,
      widthCm,
      depthCm,
      objects: objects as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/locations/${location.id}`);
  redirect(`/admin/saalplan/${plan.id}`);
}

export async function saveVenuePlanAction(formData: FormData) {
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
  );

  const plan = await prisma.venuePlan.findFirst({
    where: { id: planId, organizationId: membership.organizationId },
  });
  if (!plan) throw new Error("NOT_FOUND");

  await prisma.venuePlan.update({
    where: { id: plan.id },
    data: {
      name,
      widthCm,
      depthCm,
      objects: objects as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  // Keep event seat inventory in sync with the edited plan
  const { syncSeatsForVenuePlan } = await import("@/lib/seating/materialize");
  await syncSeatsForVenuePlan(plan.id);

  revalidatePath(`/admin/saalplan/${plan.id}`);
  revalidatePath(`/admin/locations/${plan.locationId}`);
}

export async function deleteVenuePlanAction(formData: FormData) {
  const { membership } = await requireLocationsWrite();
  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.venuePlan.findFirst({
    where: { id: planId, organizationId: membership.organizationId },
  });
  if (!plan) throw new Error("NOT_FOUND");
  await prisma.venuePlan.delete({ where: { id: plan.id } });
  revalidatePath(`/admin/locations/${plan.locationId}`);
  redirect(`/admin/locations/${plan.locationId}`);
}
