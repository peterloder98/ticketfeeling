import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";
import {
  optimizeSponsorLogo,
  parseUploadedAssetId,
  type SponsorLogoCropPx,
} from "@/lib/uploads/optimize-sponsor-logo";
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

function urlSelect(field: SponsorField) {
  return field === "ticketSponsorLogoAboveUrl"
    ? ({ ticketSponsorLogoAboveUrl: true } as const)
    : ({ ticketSponsorLogoBelowUrl: true } as const);
}

function currentUrl(field: SponsorField, event: {
  ticketSponsorLogoAboveUrl?: string | null;
  ticketSponsorLogoBelowUrl?: string | null;
}): string | null {
  return field === "ticketSponsorLogoAboveUrl"
    ? event.ticketSponsorLogoAboveUrl ?? null
    : event.ticketSponsorLogoBelowUrl ?? null;
}

function revalidateSponsorPaths(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  // Ticketvorschau + PDF HTML share loadTicketPresentation scales.
  revalidatePath("/ticket", "layout");
  revalidatePath("/api/v1/tickets", "layout");
}

function parseCropFromForm(form: FormData): SponsorLogoCropPx | null {
  const left = Number(form.get("cropLeft"));
  const top = Number(form.get("cropTop"));
  const width = Number(form.get("cropWidth"));
  const height = Number(form.get("cropHeight"));
  if (
    ![left, top, width, height].every((n) => Number.isFinite(n)) ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }
  return { left, top, width, height };
}

async function loadSourceBuffer(url: string, organizationId: string): Promise<Buffer | null> {
  const assetId = parseUploadedAssetId(url);
  if (assetId) {
    const asset = await prisma.uploadedAsset.findFirst({
      where: {
        id: assetId,
        organizationId,
        kind: { in: ["cover", "image"] },
      },
      select: { data: true },
    });
    if (asset?.data) return Buffer.from(asset.data);
  }

  // Fallback for absolute/public URLs (rare).
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
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
      select: {
        id: true,
        ...urlSelect(field),
      },
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
    const trim = String(form.get("trim") ?? "") === "1";
    const crop = parseCropFromForm(form);
    const file = form.get("file");
    const hasFile = file instanceof File;
    const hasScaleOnly =
      !hasFile &&
      !trim &&
      !crop &&
      scaleRaw != null &&
      String(scaleRaw).trim() !== "";

    if (hasScaleOnly) {
      const scale = clampSponsorLogoScale(scaleRaw);
      await prisma.event.update({
        where: { id: eventId },
        data: scaleData(field, scale),
      });
      revalidateSponsorPaths(eventId);
      return NextResponse.json({ ok: true, scale });
    }

    let buffer: Buffer;
    if (hasFile) {
      if (file.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (trim || crop) {
      const existing = currentUrl(field, event);
      if (!existing) {
        return NextResponse.json({ error: { code: "NO_LOGO" } }, { status: 400 });
      }
      const loaded = await loadSourceBuffer(existing, membership.organizationId);
      if (!loaded) {
        return NextResponse.json({ error: { code: "SOURCE_UNAVAILABLE" } }, { status: 400 });
      }
      buffer = loaded;
    } else {
      return NextResponse.json({ error: { code: "FILE_REQUIRED" } }, { status: 400 });
    }

    const optimized = await optimizeSponsorLogo(buffer, {
      trim: trim || undefined,
      crop: crop ?? undefined,
    });
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

    // Keep existing scale when re-processing (trim/crop) unless client sent one.
    const preserveScale =
      !hasFile &&
      (trim || crop) &&
      (scaleRaw == null || String(scaleRaw).trim() === "");

    const updateData = {
      ...urlData(field, stored.url),
      ...(preserveScale ? {} : scaleData(field, scale)),
    };

    await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });
    revalidateSponsorPaths(eventId);

    const eventAfter = preserveScale
      ? await prisma.event.findUnique({
          where: { id: eventId },
          select: {
            ticketSponsorLogoAboveScale: true,
            ticketSponsorLogoBelowScale: true,
          },
        })
      : null;
    const returnedScale = preserveScale
      ? clampSponsorLogoScale(
          field === "ticketSponsorLogoAboveUrl"
            ? eventAfter?.ticketSponsorLogoAboveScale
            : eventAfter?.ticketSponsorLogoBelowScale,
        )
      : scale;

    return NextResponse.json({
      ok: true,
      url: stored.url,
      scale: returnedScale,
      width: optimized.width,
      height: optimized.height,
      bytes: stored.byteSize,
      trimmed: trim,
      cropped: Boolean(crop),
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
