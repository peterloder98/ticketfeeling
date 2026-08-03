import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const asset = await prisma.uploadedAsset.findUnique({
    where: { id },
    select: { data: true, mimeType: true, byteSize: true, kind: true },
  });
  if (!asset) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  // Public bytes endpoint — only cover/public media kinds.
  if (asset.kind !== "cover" && asset.kind !== "image") {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
