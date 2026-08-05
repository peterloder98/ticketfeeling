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
  normalizeHomepageUrl,
  normalizeYoutubeInput,
  parseArtistsJson,
} from "@/lib/admin/artist-form";
import { syncEventArtistsInTx } from "@/lib/admin/artist-sync";
import { slugify } from "@/lib/admin/event-form";

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

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");

  let slug = String(formData.get("slug") ?? "").trim() || slugify(name);
  const homepageRaw = String(formData.get("homepage") ?? "").trim();
  const youtubeRaw = String(formData.get("youtube") ?? "").trim();
  const bio = String(formData.get("biography") ?? "").trim() || null;
  const shortBio =
    String(formData.get("shortBio") ?? "").trim() || (bio ? bio.slice(0, 280) : null);
  const visibility = String(formData.get("visibility") ?? "published");
  if (visibility !== "draft" && visibility !== "published") throw new Error("INVALID_VISIBILITY");

  const homepage = homepageRaw
    ? normalizeHomepageUrl(homepageRaw) ??
      (() => {
        throw new Error("INVALID_HOMEPAGE");
      })()
    : null;
  let youtube: string | null = null;
  try {
    youtube = normalizeYoutubeInput(youtubeRaw);
  } catch {
    throw new Error("INVALID_YOUTUBE");
  }

  slug = await allocateUniqueArtistSlug(prisma, membership.organizationId, slug || name);

  const created = await prisma.artist.create({
    data: {
      organizationId: membership.organizationId,
      name,
      slug,
      artistType: "solo",
      homepage,
      youtube,
      biography: bio,
      shortBio,
      visibility,
      publishedAt: visibility === "published" ? new Date() : null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "artist.created",
    entityType: "artist",
    entityId: created.id,
    after: { name, slug, visibility },
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

  const name = String(formData.get("name") ?? "").trim() || existing.name;
  let slug = String(formData.get("slug") ?? "").trim() || existing.slug;
  if (!slug) slug = slugify(name);

  const homepageRaw = String(formData.get("homepage") ?? "").trim();
  const youtubeRaw = String(formData.get("youtube") ?? "").trim();
  const bio = String(formData.get("biography") ?? "").trim() || null;
  const shortBio =
    String(formData.get("shortBio") ?? "").trim() || (bio ? bio.slice(0, 280) : null);
  const visibility = String(formData.get("visibility") ?? existing.visibility);
  if (visibility !== "draft" && visibility !== "published") throw new Error("INVALID_VISIBILITY");

  const homepage = homepageRaw
    ? normalizeHomepageUrl(homepageRaw) ??
      (() => {
        throw new Error("INVALID_HOMEPAGE");
      })()
    : null;
  let youtube: string | null = null;
  try {
    youtube = normalizeYoutubeInput(youtubeRaw);
  } catch {
    throw new Error("INVALID_YOUTUBE");
  }

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
      name,
      slug,
      homepage,
      youtube,
      biography: bio,
      shortBio,
      visibility,
      publishedAt:
        visibility === "published"
          ? existing.publishedAt ?? new Date()
          : null,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "artist.updated",
    entityType: "artist",
    entityId: existing.id,
    before: { name: existing.name, slug: existing.slug, visibility: existing.visibility },
    after: { name, slug, visibility },
  });

  revalidatePath("/admin/artists");
  revalidatePath(`/admin/artists/${existing.id}`);
  if (existing.slug !== slug) revalidatePath(`/kuenstler/${existing.slug}`);
  revalidatePath(`/kuenstler/${slug}`);
  redirect(`/admin/artists/${existing.id}?saved=1`);
}

export async function updateEventLineupAction(formData: FormData) {
  const { session, membership } = await requireEventOrArtistWrite();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) throw new Error("EVENT_REQUIRED");

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: membership.organizationId },
    select: { id: true, slug: true },
  });
  if (!event) throw new Error("NOT_FOUND");

  const drafts = parseArtistsJson(formData.get("artistsJson"));

  await prisma.$transaction(async (tx) => {
    await syncEventArtistsInTx(tx, membership.organizationId, event.id, drafts);
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "event.lineup_updated",
    entityType: "event",
    entityId: event.id,
    after: { artistCount: drafts.length, names: drafts.map((d) => d.name) },
  });

  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath(`/event/${event.slug}`);
  revalidatePath("/admin/artists");
  redirect(`/admin/events/${event.id}?saved=1#lineup`);
}
