import path from "path";
import { existsSync, readFileSync } from "fs";
import sharp from "sharp";

const ICON_CANDIDATES = [
  "public/brand/icon-app-clear.png",
  "public/brand/icon-app.png",
  "public/brand/icon-mark-clear.png",
  "public/brand/icon-mark.png",
];

const LOGO_CANDIDATES = [
  "public/brand/logo-lockup-1x.png",
  "public/brand/logo-email.png",
  "public/brand/logo-ticketfeeling.png",
];

function resolveAsset(relPaths: string[]): Buffer | null {
  const roots = [process.cwd(), path.join(process.cwd(), "apps/web")];
  for (const root of roots) {
    for (const rel of relPaths) {
      const full = path.join(root, rel);
      if (existsSync(full)) {
        try {
          return readFileSync(full);
        } catch {
          /* try next */
        }
      }
    }
  }
  return null;
}

/** Minimal solid navy PNG fallback if brand assets missing. */
async function solidPng(size: number, color = { r: 15, g: 39, b: 71, alpha: 1 }) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

export async function buildApplePassImageBuffers(): Promise<Record<string, Buffer>> {
  const iconSrc = resolveAsset(ICON_CANDIDATES);
  const logoSrc = resolveAsset(LOGO_CANDIDATES);
  const baseIcon = iconSrc ?? (await solidPng(87));
  const baseLogo = logoSrc ?? baseIcon;

  const [icon, icon2x, icon3x, logo, logo2x] = await Promise.all([
    sharp(baseIcon).resize(29, 29, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(baseIcon).resize(58, 58, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(baseIcon).resize(87, 87, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(baseLogo).resize(160, 50, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(baseLogo).resize(320, 100, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  ]);

  // Apple uses distinct base names (icon* vs logo*) with @2x/@3x suffixes.
  const out: Record<string, Buffer> = {};
  out["icon.png"] = icon;
  out[`icon${"@2x"}.png`] = icon2x;
  out[`icon${"@3x"}.png`] = icon3x;
  out["logo.png"] = logo;
  out[`logo${"@2x"}.png`] = logo2x;
  return out;
}
