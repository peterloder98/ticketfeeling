import sharp from "sharp";

/** Square cover for cards / cinema poster hero — sharp on retina. */
export const COVER_SIZE_PX = 1920;
export const COVER_WEBP_QUALITY = 90;

/**
 * Normalize uploads: strip EXIF, crop centre square, WebP.
 * Sized for poster hero + retina cards; still far smaller than phone originals.
 */
export async function optimizeCoverImage(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(COVER_SIZE_PX, COVER_SIZE_PX, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({
      quality: COVER_WEBP_QUALITY,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mimeType: "image/webp",
  };
}
