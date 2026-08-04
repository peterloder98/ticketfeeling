/**
 * @deprecated Prefer `render-brand-logos.ts` (SVG → crisp PNG).
 * Legacy: knock out solid black plate from ChatGPT/JPEG logo artwork → PNG+alpha.
 *
 * Usage: npx tsx scripts/make-logo-master.ts [sourcePath]
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "public/brand");

const defaultSrc =
  process.argv[2] ??
  path.join(brandDir, "logo-ticketfeeling.raw.png");

/** Reference solids from this JPEG plate (crushed vs true brand hex). */
const NAVY = { r: 0, g: 16, b: 44 };
const TEAL = { r: 20, g: 184, b: 166 };
const GOLD = { r: 214, g: 140, b: 40 };

function clamp8(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Treat pixel as brandColor × alpha over black; restore solid + alpha.
 * Returns null if not this family.
 */
function unpremultiplyBrand(
  r: number,
  g: number,
  b: number,
  ref: { r: number; g: number; b: number },
  /** Which channel best tracks coverage for this color. */
  key: "r" | "g" | "b",
): { r: number; g: number; b: number; a: number } | null {
  const refKey = ref[key];
  if (refKey < 8) return null;
  const coverage = Math.min(1, Math.max(0, ([r, g, b][["r", "g", "b"].indexOf(key)] as number) / refKey));
  if (coverage < 0.04) return { r: ref.r, g: ref.g, b: ref.b, a: 0 };
  const a = clamp8(coverage * 255);
  // Keep solid brand color (avoid muddy AA charcoal).
  return { r: ref.r, g: ref.g, b: ref.b, a };
}

/** Soft-knockout near-black while protecting / recovering navy / teal / gold. */
function processRgba(data: Buffer) {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const chroma = maxc - minc;

    // --- Gold family (orange tagline) ---
    if (r >= 55 && g >= 25 && r > b + 15 && g > b - 5 && r + g > b * 2.2) {
      // Solid-ish gold
      if (maxc >= 120 && chroma >= 40) {
        data[i + 3] = 255;
        continue;
      }
      const up = unpremultiplyBrand(r, g, b, GOLD, "r");
      if (up) {
        data[i] = up.r;
        data[i + 1] = up.g;
        data[i + 2] = up.b;
        data[i + 3] = up.a;
        continue;
      }
    }

    // --- Teal family ---
    if (g >= 35 && g > r + 12 && g + 40 >= b && b >= r) {
      if (g >= 90) {
        data[i + 3] = 255;
        continue;
      }
      // Dark teal AA / mosquito → alpha against TEAL
      const up = unpremultiplyBrand(r, g, b, TEAL, "g");
      if (up) {
        data[i] = up.r;
        data[i + 1] = up.g;
        data[i + 2] = up.b;
        data[i + 3] = up.a;
        continue;
      }
    }

    // --- Navy family (blue-dominant, including crushed JPEG navy) ---
    if (b >= 18 && b > r + 6 && b >= g - 1) {
      // Solid navy body in this asset sits ~b 40–55
      if (b >= 38 && g <= 55 && r <= 40) {
        data[i] = NAVY.r;
        data[i + 1] = NAVY.g;
        data[i + 2] = NAVY.b;
        data[i + 3] = 255;
        continue;
      }
      const up = unpremultiplyBrand(r, g, b, NAVY, "b");
      if (up) {
        data[i] = up.r;
        data[i + 1] = up.g;
        data[i + 2] = up.b;
        data[i + 3] = up.a;
        continue;
      }
    }

    // --- Low-chroma dark / gray plate & JPEG ringing ---
    if (chroma <= 18 && maxc <= 55) {
      const hard = 14;
      const soft = 48;
      let a: number;
      if (maxc <= hard) a = 0;
      else a = clamp8(((maxc - hard) / (soft - hard)) * 255);
      data[i + 3] = a;
      if (a > 0 && a < 255) {
        const f = 255 / a;
        data[i] = clamp8(r * f);
        data[i + 1] = clamp8(g * f);
        data[i + 2] = clamp8(b * f);
      }
      continue;
    }

    // Residual near-black / muddy mosquito (not brand-colored)
    if (maxc < 28 && chroma < 22) {
      data[i + 3] = 0;
      continue;
    }

    data[i + 3] = 255;
  }
}

async function writeTrimmedPng(
  data: Buffer,
  width: number,
  height: number,
  outPath: string,
  opts?: { width?: number; padding?: number },
) {
  const padding = opts?.padding ?? 14;
  let pipeline = sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 12 })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  if (opts?.width) {
    pipeline = pipeline.resize({ width: opts.width, withoutEnlargement: true });
  }

  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log("wrote", path.relative(root, outPath), meta.width, "x", meta.height, meta.size, "bytes");
  return meta;
}

async function main() {
  const src = path.resolve(defaultSrc);
  if (!fs.existsSync(src)) {
    console.error("Source not found:", src);
    process.exit(1);
  }

  const rawBackup = path.join(brandDir, "logo-ticketfeeling.raw.png");
  if (path.resolve(src) !== path.resolve(rawBackup)) {
    // Keep original bytes when already a jpeg/png plate.
    fs.copyFileSync(src, rawBackup);
    console.log("backed up raw →", path.relative(root, rawBackup));
  }

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  processRgba(data);

  const master = path.join(brandDir, "logo-ticketfeeling.png");
  const lockup = path.join(brandDir, "logo-lockup.png");
  const lockup1x = path.join(brandDir, "logo-lockup-1x.png");
  const email = path.join(brandDir, "logo-email.png");

  const masterMeta = await writeTrimmedPng(data, info.width, info.height, master, { padding: 14 });

  await sharp(master).png({ compressionLevel: 9 }).toFile(lockup);
  console.log("wrote", path.relative(root, lockup), masterMeta.width, "x", masterMeta.height);

  await sharp(master)
    .resize({ width: Math.round((masterMeta.width ?? 500) / 2), withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(lockup1x);
  const m1 = await sharp(lockup1x).metadata();
  console.log("wrote", path.relative(root, lockup1x), m1.width, "x", m1.height, m1.size, "bytes");

  await sharp(master)
    .resize({ width: 420, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(email);
  const me = await sharp(email).metadata();
  console.log("wrote", path.relative(root, email), me.width, "x", me.height, me.size, "bytes");

  const { data: check, info: ci } = await sharp(master).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let opaqueBlack = 0;
  let transparent = 0;
  for (let i = 0; i < check.length; i += 4) {
    if (check[i + 3]! === 0) transparent++;
    else if (check[i]! < 22 && check[i + 1]! < 22 && check[i + 2]! < 22 && check[i + 3]! > 200) {
      opaqueBlack++;
    }
  }
  console.log("master sanity", {
    size: `${ci.width}x${ci.height}`,
    cornerA: check[3],
    transparent,
    opaqueBlackRemaining: opaqueBlack,
  });
  if (check[3]! !== 0) {
    console.error("FAIL: corner is not transparent");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
