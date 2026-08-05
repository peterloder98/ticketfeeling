/**
 * Rasterize SVG *mark/app icons* → PNG (optional).
 *
 * Full lockup PNGs come from the original artwork via make-logo-master.ts —
 * do NOT overwrite logo-ticketfeeling.png from the SVG recreation.
 *
 * Usage: npx tsx scripts/render-brand-logos.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "public/brand");
const repoRoot = path.join(root, "../..");

function findFontCandidates(): { family: string; bold: string; semibold: string } {
  const prismaAssets = path.join(repoRoot, "node_modules/prisma/build/public/assets");
  const inter600 = path.join(prismaAssets, "inter-all-600-normal.d0a7c8a9.woff");
  const inter400 = path.join(prismaAssets, "inter-all-400-normal.4c1f8a0d.woff");
  if (fs.existsSync(inter600)) {
    return {
      family: "Inter",
      bold: inter600,
      semibold: fs.existsSync(inter400) ? inter600 : inter600,
    };
  }

  const arialBold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
  const arial = "/System/Library/Fonts/Supplemental/Arial.ttf";
  if (fs.existsSync(arialBold)) {
    console.warn("Inter WOFF not found — falling back to Arial for PNG raster");
    return { family: "Arial", bold: arialBold, semibold: fs.existsSync(arial) ? arial : arialBold };
  }

  throw new Error("No usable font found for SVG→PNG (need Inter WOFF or Arial)");
}

function pathToFileUrl(p: string) {
  return `file://${path.resolve(p)}`;
}

function svgWithEmbeddedFonts(
  svg: string,
  fonts: { family: string; bold: string; semibold: string },
) {
  const boldUri = pathToFileUrl(fonts.bold);
  const semiUri = pathToFileUrl(fonts.semibold);
  const face = `
  <defs>
    <style type="text/css"><![CDATA[
      @font-face {
        font-family: '${fonts.family}';
        font-weight: 600;
        src: url('${semiUri}');
      }
      @font-face {
        font-family: '${fonts.family}';
        font-weight: 700;
        src: url('${boldUri}');
      }
      .wm, .tg, text {
        font-family: '${fonts.family}', Inter, system-ui, sans-serif !important;
      }
    ]]></style>
  </defs>`;
  return svg.replace(/<svg([^>]*)>/, `<svg$1>${face}`);
}

async function writePng(
  svgPath: string,
  outPath: string,
  width: number,
  fonts: { family: string; bold: string; semibold: string },
) {
  let svg = fs.readFileSync(svgPath, "utf8");
  if (svg.includes("<text")) {
    svg = svgWithEmbeddedFonts(svg, fonts);
  }
  await sharp(Buffer.from(svg), { density: 288 })
    .resize({ width, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log("wrote", path.relative(root, outPath), `${meta.width}x${meta.height}`, meta.size, "bytes");
}

async function main() {
  const fonts = findFontCandidates();
  console.log("using font", fonts.family, fonts.bold);

  const markSvg = path.join(brandDir, "icon-mark.svg");
  const appSvg = path.join(brandDir, "icon-app.svg");

  // Mark/app icons only — full lockup is make-logo-master.ts from original raster.
  await writePng(markSvg, path.join(brandDir, "icon-mark-clear.png"), 574, fonts);
  await writePng(appSvg, path.join(brandDir, "icon-app-clear.png"), 512, fonts);

  console.log("ok — mark/app PNGs updated (lockup untouched)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
