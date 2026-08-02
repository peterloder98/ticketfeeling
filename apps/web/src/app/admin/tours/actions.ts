"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { slugify } from "@/lib/admin/event-form";
import { syncTourCoverToEvents } from "@/lib/commerce/tour-cover-sync";

async function requireTourWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "tours:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

function parseDateOnly(raw: string): Date | null {
  const s = raw.trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00.000Z`);
}

export async function createTourAction(formData: FormData) {
  const { session, membership } = await requireTourWrite();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  let slug = String(formData.get("slug") ?? "").trim();
  if (!slug) slug = slugify(name);
  const description = String(formData.get("description") ?? "").trim() || null;
  const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim() || null;
  const visibility = String(formData.get("visibility") ?? "draft");
  if (visibility !== "draft" && visibility !== "published") throw new Error("INVALID_VISIBILITY");
  const startsOn = parseDateOnly(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateOnly(String(formData.get("endsOn") ?? ""));

  const taken = await prisma.tour.findFirst({
    where: { organizationId: membership.organizationId, slug },
  });
  if (taken) throw new Error("SLUG_TAKEN");

  const created = await prisma.tour.create({
    data: {
      organizationId: membership.organizationId,
      name,
      slug,
      description,
      coverImageUrl,
      startsOn,
      endsOn,
      visibility,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "tour.created",
    entityType: "tour",
    entityId: created.id,
    after: { name, slug, visibility, coverImageUrl },
  });

  revalidatePath("/admin/tours");
  revalidatePath("/");
  revalidatePath("/events");
  redirect(`/admin/tours/${created.id}?neu=1`);
}

export async function updateTourAction(formData: FormData) {
  const { session, membership } = await requireTourWrite();
  const tourId = String(formData.get("tourId") ?? "").trim();
  if (!tourId) throw new Error("TOUR_REQUIRED");

  const existing = await prisma.tour.findFirst({
    where: { id: tourId, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const name = String(formData.get("name") ?? "").trim() || existing.name;
  let slug = String(formData.get("slug") ?? "").trim() || existing.slug;
  if (!slug) slug = slugify(name);
  const description = String(formData.get("description") ?? "").trim() || null;
  const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim() || null;
  const visibility = String(formData.get("visibility") ?? existing.visibility);
  if (visibility !== "draft" && visibility !== "published") throw new Error("INVALID_VISIBILITY");
  const startsOn = parseDateOnly(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateOnly(String(formData.get("endsOn") ?? ""));

  const taken = await prisma.tour.findFirst({
    where: {
      organizationId: membership.organizationId,
      slug,
      NOT: { id: existing.id },
    },
  });
  if (taken) throw new Error("SLUG_TAKEN");

  await prisma.tour.update({
    where: { id: existing.id },
    data: {
      name,
      slug,
      description,
      coverImageUrl,
      startsOn,
      endsOn,
      visibility,
    },
  });

  await syncTourCoverToEvents({
    tourId: existing.id,
    previousCoverUrl: existing.coverImageUrl,
    nextCoverUrl: coverImageUrl,
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "tour.updated",
    entityType: "tour",
    entityId: existing.id,
    before: {
      name: existing.name,
      slug: existing.slug,
      visibility: existing.visibility,
      coverImageUrl: existing.coverImageUrl,
    },
    after: { name, slug, visibility, coverImageUrl },
  });

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${existing.id}`);
  revalidatePath("/");
  revalidatePath("/events");
  if (existing.slug !== slug) revalidatePath(`/tour/${existing.slug}`);
  revalidatePath(`/tour/${slug}`);
  redirect(`/admin/tours/${existing.id}?saved=1`);
}
