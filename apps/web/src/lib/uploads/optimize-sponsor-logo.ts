import sharp from "sharp";

/** Max stored size for ticket-stub logos (retina for ~140×42 CSS display). */
export const SPONSOR_LOGO_MAX_WIDTH = 480;
export const SPONSOR_LOGO_MAX_HEIGHT = 160;
const WEBP_QUALITY = 84;

/** Pixel crop in source-image coordinates (after auto-orient). */
export type SponsorLogoCropPx = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Optimize sponsor logos for the QR stub: auto-orient, optional crop/trim,
 * fit inside max box, WebP. Preserves aspect ratio (object-fit: contain at render).
 */
export async function optimizeSponsorLogo(
  input: Buffer,
  opts?: {
    /** Remove near-empty / near-white margins before resize. */
    trim?: boolean;
    /** Absolute pixel crop (applied after rotate, before trim). */
    crop?: SponsorLogoCropPx;
  },
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}> {
  const meta = await sharp(input).rotate().metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;

  let pipeline = sharp(input).rotate();

  if (opts?.crop && srcW > 0 && srcH > 0) {
    const left = Math.max(0, Math.min(srcW - 1, Math.round(opts.crop.left)));
    const top = Math.max(0, Math.min(srcH - 1, Math.round(opts.crop.top)));
    const width = Math.max(1, Math.min(srcW - left, Math.round(opts.crop.width)));
    const height = Math.max(1, Math.min(srcH - top, Math.round(opts.crop.height)));
    pipeline = pipeline.extract({ left, top, width, height });
  }

  if (opts?.trim) {
    // threshold: tolerate slight JPEG noise / off-white margins.
    // If trim would empty the image, sharp throws — fall back to untrimmed.
    try {
      const trimmed = await pipeline.clone().trim({ threshold: 18 }).toBuffer();
      pipeline = sharp(trimmed);
    } catch {
      // keep untrimmed pipeline
    }
  }

  const { data, info } = await pipeline
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

/** Parse `/api/assets/<uuid>` style URLs. */
export function parseUploadedAssetId(url: string | null | undefined): string | null {
  const value = String(url ?? "").trim();
  const match = value.match(/\/api\/assets\/([0-9a-f-]{36})(?:\?|$)/i);
  return match?.[1] ?? null;
}
