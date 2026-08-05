/**
 * Soft-knockout solid black plate from original ChatGPT/JPEG logo artwork → PNG+alpha.
 *
 * ONLY for black-plate JPEG/PNG sources. If the artwork is already freigestellt
 * (removebg / transparent RGBA), do NOT run this — soft-knockout fringes edges.
 * For removebg masters: copy 1:1 (optional light trim of empty transparent padding),
 * write logo-ticketfeeling.png, and lanczos-resize email/lockup derivatives only.
 *
 * Source is typically a 1024×682 JPEG *plate* (no alpha); logo content is much smaller
 * inside that frame (~500×350). We:
 *  1) flood-fill near-black from corners → transparency (protects navy wordmark)
 *  2) trim to content + pad
 *  3) write master at native content resolution (no invented upscale)
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

function clamp8(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Near-black, low-chroma plate pixel (JPEG ringing stays in range). */
function isPlatePixel(r: number, g: number, b: number) {
  const maxc = Math.max(r, g, b);
  const chroma = maxc - Math.min(r, g, b);
  return maxc <= 26 && chroma <= 12;
}

/**
 * Flood-fill plate from corners, then soft-alpha only on plate AA.
 * Brand pixels (navy/teal/gold/gradients) stay fully opaque — no color remapping.
 */
function processRgba(data: Buffer, width: number, height: number) {
  const n = width * height;
  const bg = new Uint8Array(n);

  const seeds: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  const stack: number[] = [];
  for (const [x, y] of seeds) {
    const i = y * width + x;
    const o = i * 4;
    if (isPlatePixel(data[o]!, data[o + 1]!, data[o + 2]!)) {
      bg[i] = 1;
      stack.push(i);
    }
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    const neighbors: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (bg[ni]) continue;
      const o = ni * 4;
      if (isPlatePixel(data[o]!, data[o + 1]!, data[o + 2]!)) {
        bg[ni] = 1;
        stack.push(ni);
      }
    }
  }

  const HARD = 8;
  const SOFT = 26;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    const maxc = Math.max(r, g, b);

    if (!bg[i]) {
      // Foreground: keep exact colors (gradients intact).
      // Enclosed plate pockets in glyph counters (JPEG islands) → transparent.
      // Threshold matches plate detection; navy wordmark stays (higher chroma/blue).
      if (maxc <= 22 && maxc - Math.min(r, g, b) <= 10) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      data[o + 3] = 255;
      continue;
    }

    // Plate / plate AA → soft transparency. No unpremultiply (avoids chalky halos).
    if (maxc <= HARD) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
      continue;
    }
    const a = clamp8(((maxc - HARD) / (SOFT - HARD)) * 90);
    data[o + 3] = a;
  }
}

async function main() {
  const src = path.resolve(defaultSrc);
  if (!fs.existsSync(src)) {
    console.error("Source not found:", src);
    process.exit(1);
  }

  const rawBackup = path.join(brandDir, "logo-ticketfeeling.raw.png");
  if (path.resolve(src) !== path.resolve(rawBackup)) {
    fs.copyFileSync(src, rawBackup);
    console.log("backed up raw →", path.relative(root, rawBackup));
  }

  // Real PNG archive of the plate (no knockout) for reference.
  const originalPng = path.join(brandDir, "logo-original.png");
  await sharp(src).png({ compressionLevel: 9 }).toFile(originalPng);
  console.log("wrote", path.relative(root, originalPng), "(plate archive)");

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log("source", info.width, "x", info.height);
  processRgba(data, info.width, info.height);

  const master = path.join(brandDir, "logo-ticketfeeling.png");
  const lockup = path.join(brandDir, "logo-lockup.png");
  const lockup1x = path.join(brandDir, "logo-lockup-1x.png");
  const email = path.join(brandDir, "logo-email.png");

  // Native trim (1× content) first.
  const nativePng = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .extend({
      top: 18,
      bottom: 18,
      left: 18,
      right: 18,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const nativeMeta = await sharp(nativePng).metadata();
  const nativeW = nativeMeta.width!;
  const nativeH = nativeMeta.height!;
  console.log("native content", nativeW, "x", nativeH);

  // Master = native content (no lanczos upscale — preserves real pixels only).
  await sharp(nativePng).png({ compressionLevel: 9 }).toFile(master);

  const masterMeta = await sharp(master).metadata();
  console.log(
    "wrote",
    path.relative(root, master),
    masterMeta.width,
    "x",
    masterMeta.height,
    masterMeta.size,
    "bytes",
  );

  await sharp(master).png({ compressionLevel: 9 }).toFile(lockup);
  console.log("wrote", path.relative(root, lockup), masterMeta.width, "x", masterMeta.height);

  // 1× alias (same as master when we ship native).
  await sharp(nativePng).png({ compressionLevel: 9 }).toFile(lockup1x);
  const m1 = await sharp(lockup1x).metadata();
  console.log("wrote", path.relative(root, lockup1x), m1.width, "x", m1.height);

  // Email/PDF: from native master, never enlarge beyond content.
  await sharp(master)
    .resize({ width: 840, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(email);
  const me = await sharp(email).metadata();
  console.log("wrote", path.relative(root, email), me.width, "x", me.height);

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

  console.log(
    "\nBrandLogo FULL intrinsic should be:",
    `width: ${masterMeta.width}, height: ${masterMeta.height}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
