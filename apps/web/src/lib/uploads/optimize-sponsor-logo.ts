import sharp from "sharp";

/** Max stored size for ticket-stub logos (retina for ~140×42 CSS display). */
export const SPONSOR_LOGO_MAX_WIDTH = 480;
export const SPONSOR_LOGO_MAX_HEIGHT = 160;
const WEBP_QUALITY = 84;

/**
 * Optimize sponsor logos for the QR stub: auto-orient, fit inside max box, WebP.
 * Preserves aspect ratio (object-fit: contain at render time).
 */
export async function optimizeSponsorLogo(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: SPONSOR_LOGO_MAX_WIDTH,
      height: SPONSOR_LOGO_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: WEBP_QUALITY,
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
