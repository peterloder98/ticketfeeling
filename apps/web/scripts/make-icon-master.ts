/**
 * Soft-knockout solid black plate from original TF mark artwork → PNG+alpha.
 *
 * ONLY for black-plate JPEG/PNG sources. Prefer 1:1 artwork fidelity over SVG.
 *
 * Writes:
 *  - icon-tf.png          native trimmed mark (canonical)
 *  - icon-mark-clear.png  same as icon-tf (nav mark)
 *  - icon-app-clear.png   square-padded for favicon / app chrome
 *  - icon-mark.png / icon-app.png aliases
 *
 * Usage: npx tsx scripts/make-icon-master.ts [sourcePath]
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "public/brand");

const defaultSrc =
  process.argv[2] ??
  path.join(brandDir, "icon-tf.raw.png");

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
 * Brand pixels (navy/teal gradients) stay fully opaque — no color remapping.
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
      // Enclosed plate pockets in glyph counters → transparent.
      // Navy T stays (higher chroma/blue than plate).
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

  fs.mkdirSync(brandDir, { recursive: true });

  const rawBackup = path.join(brandDir, "icon-tf.raw.png");
  // Archive source as PNG plate (JPEG → PNG) for reproducibility.
  await sharp(src).png({ compressionLevel: 9 }).toFile(rawBackup);
  console.log("backed up raw plate →", path.relative(root, rawBackup));

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log("source", info.width, "x", info.height, info.format ?? "raw");
  processRgba(data, info.width, info.height);

  const PAD = 12;
  const nativePng = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const nativeMeta = await sharp(nativePng).metadata();
  const nativeW = nativeMeta.width!;
  const nativeH = nativeMeta.height!;
  console.log("native content", nativeW, "x", nativeH);

  const iconTf = path.join(brandDir, "icon-tf.png");
  const markClear = path.join(brandDir, "icon-mark-clear.png");
  const markAlias = path.join(brandDir, "icon-mark.png");
  const appClear = path.join(brandDir, "icon-app-clear.png");
  const appAlias = path.join(brandDir, "icon-app.png");

  await sharp(nativePng).png({ compressionLevel: 9 }).toFile(iconTf);
  await sharp(nativePng).png({ compressionLevel: 9 }).toFile(markClear);
  await sharp(nativePng).png({ compressionLevel: 9 }).toFile(markAlias);

  // Square app/favicon: contain mark on transparent canvas (no upscale beyond native).
  const side = Math.max(nativeW, nativeH);
  const appSide = Math.max(side, 512);
  await sharp(nativePng)
    .resize({
      width: appSide,
      height: appSide,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toFile(appClear);
  await sharp(appClear).png({ compressionLevel: 9 }).toFile(appAlias);

  for (const p of [iconTf, markClear, markAlias, appClear, appAlias]) {
    const m = await sharp(p).metadata();
    console.log("wrote", path.relative(root, p), `${m.width}x${m.height}`, m.size, "bytes");
  }

  const { data: check, info: ci } = await sharp(iconTf).ensureAlpha().raw().toBuffer({
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
  console.log("icon-tf sanity", {
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
    "\nBrandLogo MARK/APP intrinsic should be:",
    `width: ${nativeW}, height: ${nativeH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
