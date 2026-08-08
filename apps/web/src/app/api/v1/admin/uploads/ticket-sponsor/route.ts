import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";
import { optimizeSponsorLogo } from "@/lib/uploads/optimize-sponsor-logo";
import { ensureTicketSponsorLogoColumns } from "@/lib/commerce/ensure-ticket-sponsor-logos";
import { clampSponsorLogoScale } from "@/lib/commerce/ticket-presentation-shared";

export const runtime = "nodejs";

const FIELDS = [
  "ticketSponsorLogoAboveUrl",
  "ticketSponsorLogoBelowUrl",
] as const;

type SponsorField = (typeof FIELDS)[number];

function parseField(raw: FormDataEntryValue | null): SponsorField | null {
  const value = String(raw ?? "").trim();
  return FIELDS.includes(value as SponsorField) ? (value as SponsorField) : null;
}

function urlData(field: SponsorField, url: string | null) {
  return field === "ticketSponsorLogoAboveUrl"
    ? { ticketSponsorLogoAboveUrl: url }
    : { ticketSponsorLogoBelowUrl: url };
}

function scaleData(field: SponsorField, scale: number | null) {
  return field === "ticketSponsorLogoAboveUrl"
    ? { ticketSponsorLogoAboveScale: scale }
    : { ticketSponsorLogoBelowScale: scale };
}

function revalidateSponsorPaths(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  // Ticketvorschau + PDF HTML share loadTicketPresentation scales.
  revalidatePath("/ticket", "layout");
  revalidatePath("/api/v1/tickets", "layout");
}

export async function POST(request: Request) {
  try {
    await ensureTicketSponsorLogoColumns();

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
      "events:write",
    );
    if (!canWrite) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const form = await request.formData();
    const field = parseField(form.get("field"));
    if (!field) {
      return NextResponse.json({ error: { code: "FIELD_REQUIRED" } }, { status: 400 });
    }

    const eventId = String(form.get("eventId") ?? "").trim();
    if (!eventId) {
      return NextResponse.json({ error: { code: "EVENT_REQUIRED" } }, { status: 400 });
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    const clear = String(form.get("clear") ?? "") === "1";
    if (clear) {
      await prisma.event.update({
        where: { id: eventId },
        data: { ...urlData(field, null), ...scaleData(field, null) },
      });
      revalidateSponsorPaths(eventId);
      return NextResponse.json({ ok: true, url: null, scale: null });
    }

    const scaleRaw = form.get("scale");
    const hasScaleOnly =
      scaleRaw != null &&
      String(scaleRaw).trim() !== "" &&
      !(form.get("file") instanceof File);

    if (hasScaleOnly) {
      const scale = clampSponsorLogoScale(scaleRaw);
      await prisma.event.update({
        where: { id: eventId },
        data: scaleData(field, scale),
      });
      revalidateSponsorPaths(eventId);
      return NextResponse.json({ ok: true, scale });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "FILE_REQUIRED" } }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await optimizeSponsorLogo(buffer);
    const stored = await storeCoverAsset({
      organizationId: membership.organizationId,
      buffer: optimized.buffer,
      mimeType: optimized.mimeType,
      kind: "image",
    });

    const scale =
      scaleRaw != null && String(scaleRaw).trim() !== ""
        ? clampSponsorLogoScale(scaleRaw)
        : 1;

    await prisma.event.update({
      where: { id: eventId },
      data: { ...urlData(field, stored.url), ...scaleData(field, scale) },
    });
    revalidateSponsorPaths(eventId);

    return NextResponse.json({
      ok: true,
      url: stored.url,
      scale,
      width: optimized.width,
      height: optimized.height,
      bytes: stored.byteSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    console.error("[ticket-sponsor upload]", message);
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
