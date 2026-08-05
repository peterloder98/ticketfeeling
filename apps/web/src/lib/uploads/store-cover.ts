import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

let ensuredTable = false;

/** Create uploaded_assets if a deploy raced ahead of migrate deploy. */
async function ensureUploadedAssetsTable() {
  if (ensuredTable) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "uploaded_assets" (
      "id" UUID NOT NULL,
      "organization_id" UUID NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'cover',
      "mime_type" TEXT NOT NULL,
      "byte_size" INTEGER NOT NULL,
      "data" BYTEA NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "uploaded_assets_organization_id_kind_idx"
    ON "uploaded_assets"("organization_id", "kind")
  `);
  ensuredTable = true;
}

/** Persist image bytes in Postgres and return a public URL that works on Vercel. */
export async function storeCoverAsset(input: {
  organizationId: string;
  buffer: Buffer;
  mimeType?: string;
  /** cover | image — assets GET allows both public kinds */
  kind?: "cover" | "image";
}): Promise<{ url: string; assetId: string; byteSize: number }> {
  const mimeType = input.mimeType ?? "image/webp";
  const kind = input.kind ?? "cover";

  try {
    await ensureUploadedAssetsTable();
    const asset = await prisma.uploadedAsset.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        kind,
        mimeType,
        byteSize: input.buffer.length,
        data: new Uint8Array(input.buffer),
      },
      select: { id: true, byteSize: true },
    });

    return {
      assetId: asset.id,
      byteSize: asset.byteSize,
      url: `/api/assets/${asset.id}`,
    };
  } catch (error) {
    // Never embed multi‑KB images as data-URLs in HTML — kills page weight.
    const message = error instanceof Error ? error.message : "STORE_FAILED";
    console.error("[storeCoverAsset] failed:", message);
    throw new Error("COVER_STORAGE_UNAVAILABLE");
  }
}
