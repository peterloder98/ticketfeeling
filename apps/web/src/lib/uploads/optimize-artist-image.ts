import sharp from "sharp";

export type ArtistImageKind = "profile" | "header";

const PROFILE_MAX_EDGE = 1000;
const HEADER_MAX_EDGE = 1800;
const WEBP_QUALITY = 82;

/**
 * Optimize artist uploads: auto-orient, shrink longest edge, WebP.
 * Profile ~800–1200px edge; header ~1600–2000px edge.
 */
export async function optimizeArtistImage(
  input: Buffer,
  kind: ArtistImageKind,
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}> {
  const maxEdge = kind === "profile" ? PROFILE_MAX_EDGE : HEADER_MAX_EDGE;

  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
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
