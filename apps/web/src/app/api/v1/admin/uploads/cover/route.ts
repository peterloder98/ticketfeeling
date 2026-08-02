import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

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
    const allowed = await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    );
    if (!allowed) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "FILE_REQUIRED" } }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 400 });
    }

    const eventId = String(form.get("eventId") ?? "").trim();
    if (eventId) {
      const event = await prisma.event.findFirst({
        where: { id: eventId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!event) {
        return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(buffer)
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 80, effort: 2 })
      .toBuffer();

    const dir = path.join(process.cwd(), "public", "uploads", "covers");
    await mkdir(dir, { recursive: true });
    const filename = `${eventId || "draft"}-${randomUUID()}.webp`;
    await writeFile(path.join(dir, filename), optimized);

    const url = `/uploads/covers/${filename}`;

    if (eventId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { coverImageUrl: url },
      });
    }

    return NextResponse.json({
      ok: true,
      url,
      width: SIZE,
      height: SIZE,
      bytes: optimized.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
