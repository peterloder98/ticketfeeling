import { NextResponse } from "next/server";
import sharp from "sharp";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";

export const runtime = "nodejs";

const SIZE = 444;

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

    const canEvents = await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    );
    const canTours = await userHasPermission(
      session.user.id,
      membership.organizationId,
      "tours:write",
    );
    if (!canEvents && !canTours) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const form = await request.formData();
    const eventId = String(form.get("eventId") ?? "").trim();
    const tourId = String(form.get("tourId") ?? "").trim();
    const clear = String(form.get("clear") ?? "") === "1";

    if (eventId) {
      const event = await prisma.event.findFirst({
        where: { id: eventId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!event) {
        return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
      }
    }
    if (tourId) {
      const tour = await prisma.tour.findFirst({
        where: { id: tourId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!tour) {
        return NextResponse.json({ error: { code: "TOUR_NOT_FOUND" } }, { status: 404 });
      }
    }

    if (clear) {
      if (!eventId && !tourId) {
        return NextResponse.json({ error: { code: "TARGET_REQUIRED" } }, { status: 400 });
      }
      if (eventId) {
        await prisma.event.update({
          where: { id: eventId },
          data: { coverImageUrl: null },
        });
      }
      if (tourId) {
        await prisma.tour.update({
          where: { id: tourId },
          data: { coverImageUrl: null },
        });
      }
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
    const optimized = await sharp(buffer)
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 80, effort: 2 })
      .toBuffer();

    const stored = await storeCoverAsset({
      organizationId: membership.organizationId,
      buffer: optimized,
      mimeType: "image/webp",
    });

    if (eventId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { coverImageUrl: stored.url },
      });
    }
    if (tourId) {
      await prisma.tour.update({
        where: { id: tourId },
        data: { coverImageUrl: stored.url },
      });
    }

    return NextResponse.json({
      ok: true,
      url: stored.url,
      width: SIZE,
      height: SIZE,
      bytes: stored.byteSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    console.error("[cover upload]", message);
    return NextResponse.json(
      {
        error: {
          code: message.includes("ENOENT") || message.includes("mkdir")
            ? "COVER_STORAGE_UNAVAILABLE"
            : message,
        },
      },
      { status: 400 },
    );
  }
}
