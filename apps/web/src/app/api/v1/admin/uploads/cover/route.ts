import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";
import { syncTourCoverToEvents } from "@/lib/commerce/tour-cover-sync";
import { optimizeCoverImage } from "@/lib/uploads/optimize-cover";

export const runtime = "nodejs";

function revalidatePublic() {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/admin/tours");
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
        select: { id: true, tourId: true },
      });
      if (!event) {
        return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
      }
    }
    if (tourId) {
      const tour = await prisma.tour.findFirst({
        where: { id: tourId, organizationId: membership.organizationId },
        select: { id: true, coverImageUrl: true, slug: true },
      });
      if (!tour) {
        return NextResponse.json({ error: { code: "TOUR_NOT_FOUND" } }, { status: 404 });
      }
    }

    if (clear) {
      if (!eventId && !tourId) {
        return NextResponse.json({ error: { code: "TARGET_REQUIRED" } }, { status: 400 });
      }

      const field = String(form.get("field") ?? "coverImageUrl").trim();
      const isTicketHero = field === "ticketHeroImageUrl";

      // Event: revert to tour poster (not empty), unless tour has none
      // Ticket hero clear: set null (falls back to event/tour cover at render time)
      let clearedEventUrl: string | null = null;
      if (eventId) {
        if (isTicketHero) {
          await prisma.event.update({
            where: { id: eventId },
            data: { ticketHeroImageUrl: null },
          });
          clearedEventUrl = null;
        } else {
          const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { tourId: true },
          });
          let nextCover: string | null = null;
          if (event?.tourId) {
            const tour = await prisma.tour.findUnique({
              where: { id: event.tourId },
              select: { coverImageUrl: true },
            });
            nextCover = tour?.coverImageUrl?.trim() || null;
          }
          await prisma.event.update({
            where: { id: eventId },
            data: { coverImageUrl: nextCover },
          });
          clearedEventUrl = nextCover;
        }
        revalidatePath(`/admin/events/${eventId}`);
      }

      // Tour: clear poster and sync inheriting dates
      if (tourId) {
        if (isTicketHero) {
          return NextResponse.json({ error: { code: "INVALID_FIELD" } }, { status: 400 });
        }
        const existing = await prisma.tour.findUnique({
          where: { id: tourId },
          select: { coverImageUrl: true, slug: true },
        });
        await prisma.tour.update({
          where: { id: tourId },
          data: { coverImageUrl: null },
        });
        await syncTourCoverToEvents({
          tourId,
          previousCoverUrl: existing?.coverImageUrl ?? null,
          nextCoverUrl: null,
        });
        revalidatePath(`/admin/tours/${tourId}`);
        if (existing?.slug) revalidatePath(`/tour/${existing.slug}`);
      }

      revalidatePublic();
      return NextResponse.json({
        ok: true,
        url: eventId ? clearedEventUrl : null,
      });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "FILE_REQUIRED" } }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await optimizeCoverImage(buffer);

    const stored = await storeCoverAsset({
      organizationId: membership.organizationId,
      buffer: optimized.buffer,
      mimeType: optimized.mimeType,
    });

    if (eventId) {
      const field = String(form.get("field") ?? "coverImageUrl").trim();
      if (field === "ticketHeroImageUrl") {
        await prisma.event.update({
          where: { id: eventId },
          data: { ticketHeroImageUrl: stored.url },
        });
      } else {
        await prisma.event.update({
          where: { id: eventId },
          data: { coverImageUrl: stored.url },
        });
      }
      revalidatePath(`/admin/events/${eventId}`);
    }

    if (tourId) {
      const existing = await prisma.tour.findUnique({
        where: { id: tourId },
        select: { coverImageUrl: true, slug: true },
      });
      await prisma.tour.update({
        where: { id: tourId },
        data: { coverImageUrl: stored.url },
      });
      await syncTourCoverToEvents({
        tourId,
        previousCoverUrl: existing?.coverImageUrl ?? null,
        nextCoverUrl: stored.url,
      });
      revalidatePath(`/admin/tours/${tourId}`);
      if (existing?.slug) revalidatePath(`/tour/${existing.slug}`);
    }

    revalidatePublic();

    return NextResponse.json({
      ok: true,
      url: stored.url,
      width: optimized.width,
      height: optimized.height,
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
