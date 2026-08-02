import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

/** Persist cover bytes in Postgres and return a public URL that works on Vercel. */
export async function storeCoverAsset(input: {
  organizationId: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ url: string; assetId: string; byteSize: number }> {
  const mimeType = input.mimeType ?? "image/webp";
  const asset = await prisma.uploadedAsset.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      kind: "cover",
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
}
