import sharp from "sharp";

/** Square cover for cards/hero — small enough for DB/CDN, sharp enough for retina. */
export const COVER_SIZE_PX = 480;

/**
 * Normalize uploads: strip EXIF, crop centre square, WebP.
 * Typical output ~25–60 KB instead of multi‑MB phone photos.
 */
export async function optimizeCoverImage(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}> {
  const buffer = await sharp(input)
    .rotate()
    .resize(COVER_SIZE_PX, COVER_SIZE_PX, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .webp({
      quality: 72,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  return {
    buffer,
    width: COVER_SIZE_PX,
    height: COVER_SIZE_PX,
    mimeType: "image/webp",
  };
}
