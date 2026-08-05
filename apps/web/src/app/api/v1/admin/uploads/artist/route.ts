import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";
import {
  optimizeArtistImage,
  type ArtistImageKind,
} from "@/lib/uploads/optimize-artist-image";

export const runtime = "nodejs";

function parseKind(raw: FormDataEntryValue | null): ArtistImageKind | null {
  const value = String(raw ?? "").trim();
  if (value === "profile" || value === "header") return value;
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (!membership) {
      return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
    }

    const canWrite = await userHasPermission(
      session.user.id,
      membership.organizationId,
      "artists:write",
    );
    if (!canWrite) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const form = await request.formData();
    const kind = parseKind(form.get("kind"));
    if (!kind) {
      return NextResponse.json({ error: { code: "KIND_REQUIRED" } }, { status: 400 });
    }

    const artistId = String(form.get("artistId") ?? "").trim();
    const clear = String(form.get("clear") ?? "") === "1";

    if (artistId) {
      const artist = await prisma.artist.findFirst({
        where: { id: artistId, organizationId: membership.organizationId },
        select: { id: true, slug: true },
      });
      if (!artist) {
        return NextResponse.json({ error: { code: "ARTIST_NOT_FOUND" } }, { status: 404 });
      }
    }

    if (clear) {
      if (!artistId) {
        return NextResponse.json({ error: { code: "ARTIST_REQUIRED" } }, { status: 400 });
      }
      const data =
        kind === "profile" ? { profileImageUrl: null } : { headerImageUrl: null };
      const artist = await prisma.artist.update({
        where: { id: artistId },
        data,
        select: { slug: true },
      });
      revalidatePath(`/admin/artists/${artistId}`);
      revalidatePath(`/kuenstler/${artist.slug}`);
      return NextResponse.json({ ok: true, url: null });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "FILE_REQUIRED" } }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await optimizeArtistImage(buffer, kind);
    const stored = await storeCoverAsset({
      organizationId: membership.organizationId,
      buffer: optimized.buffer,
      mimeType: optimized.mimeType,
      kind: "image",
    });

    if (artistId) {
      const data =
        kind === "profile"
          ? { profileImageUrl: stored.url }
          : { headerImageUrl: stored.url };
      const artist = await prisma.artist.update({
        where: { id: artistId },
        data,
        select: { slug: true },
      });
      revalidatePath(`/admin/artists/${artistId}`);
      revalidatePath(`/kuenstler/${artist.slug}`);
    }

    return NextResponse.json({
      ok: true,
      url: stored.url,
      width: optimized.width,
      height: optimized.height,
      bytes: stored.byteSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    console.error("[artist upload]", message);
    return NextResponse.json(
      {
        error: {
          code:
            message === "COVER_STORAGE_UNAVAILABLE"
              ? "COVER_STORAGE_UNAVAILABLE"
              : message,
        },
      },
      { status: 400 },
    );
  }
}
