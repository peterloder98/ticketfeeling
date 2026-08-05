import type { Prisma } from "@prisma/client";
import {
  allocateUniqueArtistSlug,
  normalizeHomepageUrl,
  normalizeYoutubeInput,
  type ArtistLineupDraft,
} from "@/lib/admin/artist-form";

type Tx = Prisma.TransactionClient;

async function resolveArtistId(
  tx: Tx,
  organizationId: string,
  draft: ArtistLineupDraft,
): Promise<string> {
  const name = draft.name.trim();
  if (!name) throw new Error("ARTIST_NAME_REQUIRED");

  const homepage = normalizeHomepageUrl(draft.homepage);
  if (draft.homepage?.trim() && !homepage) throw new Error("INVALID_HOMEPAGE");
  const youtube = normalizeYoutubeInput(draft.youtube);

  const bio = String(draft.bio ?? "").trim() || null;
  const shortBio = bio ? bio.slice(0, 280) : null;

  if (draft.id) {
    const existing = await tx.artist.findFirst({
      where: { id: draft.id, organizationId },
    });
    if (!existing) throw new Error("ARTIST_NOT_FOUND");

    const patch: Prisma.ArtistUpdateInput = {};
    if (name !== existing.name) patch.name = name;
    if (homepage && homepage !== existing.homepage) patch.homepage = homepage;
    if (youtube && youtube !== existing.youtube) patch.youtube = youtube;
    if (bio && bio !== existing.biography) {
      patch.biography = bio;
      patch.shortBio = shortBio;
    }
    if (Object.keys(patch).length > 0) {
      await tx.artist.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }

  const nameMatch = await tx.artist.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (nameMatch) {
    const patch: Prisma.ArtistUpdateInput = {};
    if (homepage && !nameMatch.homepage) patch.homepage = homepage;
    if (youtube && !nameMatch.youtube) patch.youtube = youtube;
    if (bio && !nameMatch.biography) {
      patch.biography = bio;
      patch.shortBio = shortBio;
    }
    if (Object.keys(patch).length > 0) {
      await tx.artist.update({ where: { id: nameMatch.id }, data: patch });
    }
    return nameMatch.id;
  }

  const slug = await allocateUniqueArtistSlug(tx, organizationId, name);
  const created = await tx.artist.create({
    data: {
      organizationId,
      name,
      slug,
      artistType: "solo",
      homepage,
      youtube,
      biography: bio,
      shortBio,
      visibility: "published",
      publishedAt: new Date(),
    },
  });
  return created.id;
}

/** Create/update org artists and link them to an event (order = array index). */
export async function syncEventArtistsInTx(
  tx: Tx,
  organizationId: string,
  eventId: string,
  drafts: ArtistLineupDraft[],
) {
  const artistIds: string[] = [];
  for (const draft of drafts) {
    artistIds.push(await resolveArtistId(tx, organizationId, draft));
  }

  const existing = await tx.eventArtist.findMany({
    where: { eventId },
    select: { id: true, artistId: true },
  });
  const keep = new Set(artistIds);
  const toRemove = existing.filter((e) => !keep.has(e.artistId));
  if (toRemove.length > 0) {
    await tx.eventArtist.deleteMany({
      where: { id: { in: toRemove.map((e) => e.id) } },
    });
  }

  for (let i = 0; i < artistIds.length; i += 1) {
    const artistId = artistIds[i]!;
    await tx.eventArtist.upsert({
      where: { eventId_artistId: { eventId, artistId } },
      update: {
        sortOrder: i,
        role: i === 0 ? "headliner" : "artist",
        isHeadliner: i === 0,
        announced: true,
      },
      create: {
        eventId,
        artistId,
        sortOrder: i,
        role: i === 0 ? "headliner" : "artist",
        isHeadliner: i === 0,
        announced: true,
      },
    });
  }
}
