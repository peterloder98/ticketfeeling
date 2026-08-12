"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  allocateUniqueArtistSlug,
  parseArtistProfileForm,
  parseArtistsJson,
} from "@/lib/admin/artist-form";
import {
  clearEventArtistOverrideInTx,
  syncEventArtistsInTx,
  syncTourArtistsInTx,
} from "@/lib/admin/artist-sync";

async function requireArtistWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "artists:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

async function requireEventOrArtistWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed =
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "artists:write",
    )) ||
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    )) ||
    (await userHasPermission(session.user.id, membership.organizationId, "tours:write"));
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

export async function createArtistAction(formData: FormData) {
  const { session, membership } = await requireArtistWrite();

  const fields = parseArtistProfileForm(formData);
  const slug = await allocateUniqueArtistSlug(
    prisma,
    membership.organizationId,
    fields.slug || fields.name,
  );

  const created = await prisma.artist.create({
    data: {
      organizationId: membership.organizationId,
      name: fields.name,
      legalName: fields.legalName,
      slug,
      artistType: fields.artistType,
      genre: fields.genre,
      origin: fields.origin,
      shortBio: fields.shortBio,
      biography: fields.biography,
      profileImageUrl: fields.profileImageUrl,
      headerImageUrl: fields.headerImageUrl,
      homepage: fields.homepage,
      instagram: fields.instagram,
      facebook: fields.facebook,
      tiktok: fields.tiktok,
      youtube: fields.youtube,
      spotify: fields.spotify,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      visibility: fields.visibility,
      sortOrder: fields.sortOrder,
      publishedAt: fields.visibility === "published" ? new Date() : null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "artist.created",
    entityType: "artist",
    entityId: created.id,
    after: { name: fields.name, slug, visibility: fields.visibility },
  });

  revalidatePath("/admin/artists");
  revalidatePath(`/kuenstler/${created.slug}`);
  redirect(`/admin/artists/${created.id}?neu=1`);
}

export async function updateArtistAction(formData: FormData) {
  const { session, membership } = await requireArtistWrite();

  const artistId = String(formData.get("artistId") ?? "").trim();
  if (!artistId) throw new Error("ARTIST_REQUIRED");

  const existing = await prisma.artist.findFirst({
    where: { id: artistId, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const fields = parseArtistProfileForm(formData, {
    name: existing.name,
    slug: existing.slug,
    visibility: existing.visibility,
  });

  let slug = fields.slug;
  const taken = await prisma.artist.findFirst({
    where: {
      organizationId: membership.organizationId,
      slug,
      NOT: { id: existing.id },
    },
  });
  if (taken) {
    slug = await allocateUniqueArtistSlug(
      prisma,
      membership.organizationId,
      slug,
      existing.id,
    );
  }

  await prisma.artist.update({
    where: { id: existing.id },
    data: {
      name: fields.name,
      legalName: fields.legalName,
      slug,
      artistType: fields.artistType,
      genre: fields.genre,
      origin: fields.origin,
      shortBio: fields.shortBio,
      biography: fields.biography,
      profileImageUrl: fields.profileImageUrl,
      headerImageUrl: fields.headerImageUrl,
      homepage: fields.homepage,
      instagram: fields.instagram,
      facebook: fields.facebook,
      tiktok: fields.tiktok,
      youtube: fields.youtube,
      spotify: fields.spotify,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      visibility: fields.visibility,
      sortOrder: fields.sortOrder,
      publishedAt:
        fields.visibility === "published" ? existing.publishedAt ?? new Date() : null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "artist.updated",
    entityType: "artist",
    entityId: existing.id,
    before: { name: existing.name, slug: existing.slug, visibility: existing.visibility },
    after: { name: fields.name, slug, visibility: fields.visibility },
  });

  revalidatePath("/admin/artists");
  revalidatePath(`/admin/artists/${existing.id}`);
  if (existing.slug !== slug) revalidatePath(`/kuenstler/${existing.slug}`);
  revalidatePath(`/kuenstler/${slug}`);
  redirect(`/admin/artists/${existing.id}?saved=1`);
}

export async function deleteArtistAction(formData: FormData) {
  const { session, membership } = await requireArtistWrite();

  const artistId = String(formData.get("artistId") ?? "").trim();
  if (!artistId) throw new Error("ARTIST_REQUIRED");

  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const forceUnlink = String(formData.get("forceUnlink") ?? "") === "1";

  const existing = await prisma.artist.findFirst({
    where: { id: artistId, organizationId: membership.organizationId },
    include: {
      _count: { select: { eventLinks: true, tourLinks: true } },
      eventLinks: {
        include: { event: { select: { id: true, name: true } } },
        take: 12,
      },
      tourLinks: {
        include: { tour: { select: { id: true, name: true } } },
        take: 12,
      },
    },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (confirmName !== existing.name) {
    redirect(`/admin/artists/${existing.id}?deleteError=name`);
  }

  const linkCount = existing._count.eventLinks + existing._count.tourLinks;
  if (linkCount > 0 && !forceUnlink) {
    redirect(`/admin/artists/${existing.id}?deleteError=in_use&count=${linkCount}`);
  }

  const linkedEventNames = existing.eventLinks.map((l) => l.event.name);
  const linkedTourNames = existing.tourLinks.map((l) => l.tour.name);

  await prisma.artist.delete({ where: { id: existing.id } });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "artist.deleted",
    entityType: "artist",
    entityId: existing.id,
    before: {
      name: existing.name,
      slug: existing.slug,
      eventLinkCount: existing._count.eventLinks,
      tourLinkCount: existing._count.tourLinks,
      eventNames: linkedEventNames,
      tourNames: linkedTourNames,
      unlinkedFromEvents: linkCount > 0,
    },
  });

  revalidatePath("/admin/artists");
  revalidatePath(`/kuenstler/${existing.slug}`);
  for (const link of existing.eventLinks) {
    revalidatePath(`/admin/events/${link.event.id}`);
  }
  for (const link of existing.tourLinks) {
    revalidatePath(`/admin/tours/${link.tour.id}`);
  }
  redirect(
    linkCount > 0
      ? `/admin/artists?deleted=1&unlinked=${linkCount}`
      : "/admin/artists?deleted=1",
  );
}

export async function updateEventLineupAction(formData: FormData) {
  const { session, membership } = await requireEventOrArtistWrite();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) throw new Error("EVENT_REQUIRED");

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: { id: true, slug: true, tourId: true },
  });
  if (!event) throw new Error("NOT_FOUND");

  const drafts = parseArtistsJson(formData.get("artistsJson"));

  await prisma.$transaction(async (tx) => {
    await syncEventArtistsInTx(tx, membership.organizationId, event.id, drafts, {
      asTourOverride: Boolean(event.tourId),
    });
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.lineup_updated",
    entityType: "event",
    entityId: event.id,
    after: {
      artistCount: drafts.length,
      names: drafts.map((d) => d.name),
      artistsUseTourDefaults: false,
    },
  });

  // Soft save: no redirect / no admin-detail remount (avoids blank flash).
  revalidatePath(`/event/${event.slug}`);
  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath("/admin/artists");
  if (event.tourId) revalidatePath(`/admin/tours/${event.tourId}`);
  return { ok: true as const, eventId: event.id };
}

/** Revert a tour date to the central tour line-up. */
export async function clearEventLineupOverrideAction(formData: FormData) {
  const { session, membership } = await requireEventOrArtistWrite();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) throw new Error("EVENT_REQUIRED");

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: { id: true, slug: true, tourId: true },
  });
  if (!event) throw new Error("NOT_FOUND");
  if (!event.tourId) throw new Error("NOT_ON_TOUR");

  await prisma.$transaction(async (tx) => {
    await clearEventArtistOverrideInTx(tx, event.id);
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.lineup_override_cleared",
    entityType: "event",
    entityId: event.id,
    after: { artistsUseTourDefaults: true, tourId: event.tourId },
  });

  revalidatePath(`/event/${event.slug}`);
  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath(`/admin/tours/${event.tourId}`);
  revalidatePath("/admin/artists");
  return { ok: true as const, eventId: event.id };
}

export async function updateTourLineupAction(formData: FormData) {
  const { session, membership } = await requireEventOrArtistWrite();

  const tourId = String(formData.get("tourId") ?? "").trim();
  if (!tourId) throw new Error("TOUR_REQUIRED");

  const tour = await prisma.tour.findFirst({
    where: { id: tourId, organizationId: membership.organizationId },
    select: { id: true, slug: true },
  });
  if (!tour) throw new Error("NOT_FOUND");

  const drafts = parseArtistsJson(formData.get("artistsJson"));

  await prisma.$transaction(async (tx) => {
    await syncTourArtistsInTx(tx, membership.organizationId, tour.id, drafts);
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "tour.lineup_updated",
    entityType: "tour",
    entityId: tour.id,
    after: { artistCount: drafts.length, names: drafts.map((d) => d.name) },
  });

  const inheritEvents = await prisma.event.findMany({
    where: {
      tourId: tour.id,
      organizationId: membership.organizationId,
      artistsUseTourDefaults: true,
    },
    select: { slug: true },
  });
  for (const ev of inheritEvents) {
    revalidatePath(`/event/${ev.slug}`);
  }
  revalidatePath(`/admin/tours/${tour.id}`);
  revalidatePath(`/tour/${tour.slug}`);
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/admin/artists");
  return { ok: true as const, tourId: tour.id };
}
