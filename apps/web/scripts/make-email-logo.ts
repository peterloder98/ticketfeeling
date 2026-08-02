import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public/brand/logo-lockup.png");
const out = path.join(root, "public/brand/logo-email.png");

async function main() {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    // Remove solid black plate from legacy artwork
    if (a > 0 && r < 22 && g < 22 && b < 22) data[i + 3] = 0;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize({ width: 420, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log("wrote", out, meta.width, "x", meta.height, meta.size, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
