import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { storeCoverAsset } from "@/lib/uploads/store-cover";
import { optimizeSponsorLogo } from "@/lib/uploads/optimize-sponsor-logo";
import { ensureTicketSponsorLogoColumns } from "@/lib/commerce/ensure-ticket-sponsor-logos";

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

function prismaData(field: SponsorField, url: string | null) {
  return field === "ticketSponsorLogoAboveUrl"
    ? { ticketSponsorLogoAboveUrl: url }
    : { ticketSponsorLogoBelowUrl: url };
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
        data: prismaData(field, null),
      });
      revalidatePath(`/admin/events/${eventId}`);
      return NextResponse.json({ ok: true, url: null });
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

    await prisma.event.update({
      where: { id: eventId },
      data: prismaData(field, stored.url),
    });
    revalidatePath(`/admin/events/${eventId}`);

    return NextResponse.json({
      ok: true,
      url: stored.url,
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
