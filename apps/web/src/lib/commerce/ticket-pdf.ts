import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr-server";
import {
  loadTicketPresentation,
  parseSeatHighlight,
  sponsorLogoBoxForScale,
  TF_GOLD,
  TF_LINE,
  TF_MUTED,
  TF_NAVY,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TF_SOFT,
  TF_TEAL,
  TICKET_ACCENT_H_PX,
  TICKET_BODY_ASPECT,
  TICKET_BRAND_LOGO_GAP_PX,
  TICKET_BRAND_LOGO_H_PX,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  TICKET_CORNER_RADIUS_PX,
  TICKET_FACE_REF_W_PX,
  TICKET_FACE_TYPE,
  TICKET_QR_MIN_PX,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";
import { parseUploadedAssetId } from "@/lib/uploads/optimize-sponsor-logo";

/** ~12 mm printer-safe margin on DIN A4 */
const PAGE_MARGIN = 34;

const FONT_REGULAR = "TF-Inter";
const FONT_BOLD = "TF-Inter-Bold";

function resolveFontPath(file: string): string | null {
  const candidates = [
    path.join(process.cwd(), "assets/fonts", file),
    path.join(process.cwd(), "apps/web/assets/fonts", file),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function registerTicketFonts(doc: PDFKit.PDFDocument) {
  const regular = resolveFontPath("Inter-Regular.ttf");
  const bold = resolveFontPath("Inter-Bold.ttf");
  if (regular) doc.registerFont(FONT_REGULAR, regular);
  if (bold) doc.registerFont(FONT_BOLD, bold);
  // Fallback names stay Helvetica if Inter files are missing in the runtime image.
  return {
    regular: regular ? FONT_REGULAR : "Helvetica",
    bold: bold ? FONT_BOLD : "Helvetica-Bold",
  };
}

type DrawOptions = {
  pageIndexLabel?: string | null;
};

/** Headers that force a browser download (not inline PDF viewer). */
export function ticketPdfDownloadHeaders(filename: string): HeadersInit {
  const safe = filename.replace(/["\\\r\n]/g, "_");
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Cache-Control": "private, no-store",
  };
}

/**
 * PDFKit mishandles many formats (WebP/AVIF/RGBA soft-masks) for large covers.
 * Default: flatten to white RGB PNG (covers, QR).
 */
async function toPdfImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}

/**
 * Sponsor logos on the soft QR stub — composite onto stub paper (#F8FAFC) so
 * freigestellte assets don't become a white rectangle (TicketFace uses alpha;
 * PDFKit soft-masks are unreliable here, so we bake the stub colour instead).
 */
async function toPdfSponsorLogoBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .ensureAlpha()
    .flatten({ background: { r: 248, g: 250, b: 252 } })
    .png()
    .toBuffer();
}

async function loadLogoBuffer(): Promise<Buffer | null> {
  // Same master as BrandLogo — prefer full lockup over email/1x derivatives.
  const candidates = [
    path.join(process.cwd(), "public/brand/logo-ticketfeeling.png"),
    path.join(process.cwd(), "apps/web/public/brand/logo-ticketfeeling.png"),
    path.join(process.cwd(), "public/brand/logo-email.png"),
    path.join(process.cwd(), "public/brand/logo-lockup-1x.png"),
    path.join(process.cwd(), "apps/web/public/brand/logo-email.png"),
    path.join(process.cwd(), "apps/web/public/brand/logo-lockup-1x.png"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        // Keep alpha until we size for PDF; flatten happens in prepareBrandLogo.
        return readFileSync(file);
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/**
 * Pre-rasterize brand lockup at 3× display size so PDFKit embeds crisp pixels,
 * then place at true aspect (avoids wide fit-box left-bias).
 */
async function prepareBrandLogo(
  logo: Buffer | null,
  displayH: number,
): Promise<{ buf: Buffer; w: number; h: number } | null> {
  if (!logo) return null;
  try {
    const meta = await sharp(logo).metadata();
    const srcW = meta.width || 544;
    const srcH = meta.height || 381;
    const h = displayH;
    const w = Math.max(1, Math.round(h * (srcW / srcH)));
    const scale = 3;
    const buf = await sharp(logo)
      .resize(w * scale, h * scale, {
        fit: "contain",
        kernel: sharp.kernel.lanczos3,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    return { buf, w, h };
  } catch {
    return null;
  }
}

async function loadUploadedAssetBuffer(url: string): Promise<Buffer | null> {
  const assetId = parseUploadedAssetId(url);
  if (!assetId) return null;
  try {
    const asset = await prisma.uploadedAsset.findUnique({
      where: { id: assetId },
      select: { data: true, kind: true },
    });
    if (!asset?.data) return null;
    if (asset.kind !== "cover" && asset.kind !== "image") return null;
    return Buffer.from(asset.data);
  } catch {
    return null;
  }
}

async function loadCoverBuffer(
  url: string | null,
  opts?: { kind?: "cover" | "sponsor" },
): Promise<Buffer | null> {
  if (!url) return null;
  try {
    let raw: Buffer | null = null;
    if (url.startsWith("data:")) {
      const base64 = url.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      raw = Buffer.from(base64, "base64");
    } else {
      // DB-backed uploads (/api/assets/:id) — never look on the local filesystem.
      const fromDb = await loadUploadedAssetBuffer(url);
      if (fromDb) raw = fromDb;
      else if (/^https?:\/\//i.test(url)) {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        raw = Buffer.from(await res.arrayBuffer());
      } else if (url.startsWith("/") || !/^https?:\/\//i.test(url)) {
        const rel = url.replace(/^\//, "").split("?")[0]!;
        const candidates = [
          path.join(process.cwd(), "public", rel),
          path.join(process.cwd(), "apps/web/public", rel),
        ];
        for (const file of candidates) {
          if (existsSync(file)) {
            raw = readFileSync(file);
            break;
          }
        }
      }
    }
    if (!raw) return null;
    return opts?.kind === "sponsor"
      ? await toPdfSponsorLogoBuffer(raw)
      : await toPdfImageBuffer(raw);
  } catch {
    return null;
  }
}

/** Prefer absolute URL when relative public/file load fails (covers + sponsors). */
async function loadTicketImageBuffer(
  relativeOrAbsolute: string | null,
  absoluteFallback: string | null,
  opts?: { kind?: "cover" | "sponsor" },
): Promise<Buffer | null> {
  const primary = await loadCoverBuffer(relativeOrAbsolute, opts);
  if (primary) return primary;
  if (
    absoluteFallback &&
    absoluteFallback !== relativeOrAbsolute
  ) {
    return loadCoverBuffer(absoluteFallback, opts);
  }
  return null;
}

/**
 * Draw clipped content and ALWAYS restore — a thrown doc.image() used to leave
 * the cover clip active, wiping the entire info/QR stub (TF-T-2026-00000052).
 */
function withClip(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  draw: () => void,
) {
  doc.save();
  try {
    doc.rect(x, y, w, h).clip();
    draw();
  } finally {
    doc.restore();
  }
}

async function withRoundedClipAsync(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  draw: () => void | Promise<void>,
) {
  doc.save();
  try {
    doc.roundedRect(x, y, w, h, r).clip();
    await draw();
  } finally {
    doc.restore();
  }
}

async function drawImageContainWithBlur(
  doc: PDFKit.PDFDocument,
  buffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Slightly larger inset so the sharp art fills more of the cover zone (~6% larger art)
  const inset = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;

  doc.rect(x, y, w, h).fill(TF_NAVY);

  let png: Buffer;
  try {
    png = await toPdfImageBuffer(buffer);
  } catch {
    return;
  }

  try {
    const meta = await sharp(png).metadata();
    const srcW = meta.width || iw;
    const srcH = meta.height || ih;

    // Soft blurred backdrop — calmer darker wash
    try {
      const blurScale = Math.max(w / srcW, h / srcH) * 1.35;
      const bw = Math.max(1, Math.round(srcW * blurScale));
      const bh = Math.max(1, Math.round(srcH * blurScale));
      const blurred = await sharp(png)
        .resize(bw, bh, { fit: "cover" })
        .blur(28)
        .modulate({ brightness: 0.62, saturation: 0.95 })
        .png()
        .toBuffer();
      withClip(doc, x, y, w, h, () => {
        doc.image(blurred, x + (w - bw) / 2, y + (h - bh) / 2, {
          width: bw,
          height: bh,
        });
      });
      doc.save();
      try {
        doc.rect(x, y, w, h).fillOpacity(0.48).fill(TF_NAVY);
      } finally {
        doc.fillOpacity(1);
        doc.restore();
      }
    } catch {
      /* navy fill already applied */
    }

    // Sharp square-safe contain — ~6% larger within inset, no rectangular frame
    const containScale = Math.min(iw / srcW, ih / srcH) * 1.06;
    const dw = srcW * containScale;
    const dh = srcH * containScale;
    const dx = ix + (iw - dw) / 2;
    const dy = iy + (ih - dh) / 2;

    withClip(doc, x, y, w, h, () => {
      doc.image(png, dx, dy, { width: dw, height: dh });
    });
  } catch {
    doc.rect(x, y, w, h).fill(TF_NAVY);
  }
}

function drawCoverFallback(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  console.warn("[ticket-pdf] missing cover — emergency navy fallback");
  doc.rect(x, y, w, h).fill(TF_NAVY);

  if (logo) {
    try {
      const plateW = Math.min(w - 24, 118);
      const plateH = 28;
      const px = x + (w - plateW) / 2;
      const py = y + h / 2 - 14;
      doc.roundedRect(px, py, plateW, plateH, 5).fill("#FFFFFF");
      doc.image(logo, px + 8, py + 5, {
        height: 18,
        fit: [plateW - 16, 18],
      });
    } catch {
      /* ignore */
    }
  }
}

async function drawTicketPage(
  doc: PDFKit.PDFDocument,
  data: TicketPresentation,
  qr: string | null,
  cover: Buffer | null,
  logo: Buffer | null,
  options?: DrawOptions & {
    sponsorAbove?: Buffer | null;
    sponsorBelow?: Buffer | null;
  },
) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = PAGE_MARGIN;
  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const admitLabel =
    options?.pageIndexLabel ?? (data.isVip ? "VIP-TICKET" : "EINLASSTICKET");
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const sponsorAbove = options?.sponsorAbove ?? null;
  const sponsorBelow = options?.sponsorBelow ?? null;
  const hasSponsor = Boolean(sponsorAbove || sponsorBelow);
  const fonts = registerTicketFonts(doc);

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  // Landscape ticket strip ~2:1 — never stretch to A4 height
  const ticketW = pageW - margin * 2;
  const ticketH = ticketW / TICKET_BODY_ASPECT;
  const ticketX = margin;
  // Center strip on page (slight bias up for notes below)
  const notesReserve = 72;
  const ticketY = Math.max(
    margin,
    (pageH - ticketH - notesReserve) / 2,
  );

  const zoneA = Math.round(ticketW * TICKET_COL_COVER);
  const zoneC = Math.round(ticketW * TICKET_COL_QR);
  const zoneB = ticketW - zoneA - zoneC;
  const ax = ticketX;
  const bx = ticketX + zoneA;
  const cx = ticketX + zoneA + zoneB;

  // Zone fills + cover under one rounded clip so navy never squares past the
  // ticket corners (left top/bottom). Text/images stay outside this clip so a
  // nested cover clip cannot wipe the info/QR stub.
  await withRoundedClipAsync(
    doc,
    ticketX,
    ticketY,
    ticketW,
    ticketH,
    TICKET_CORNER_RADIUS_PX,
    async () => {
      doc.rect(ticketX, ticketY, ticketW, ticketH).fill("#FFFFFF");
      if (cover) {
        await drawImageContainWithBlur(doc, cover, ax, ticketY, zoneA, ticketH);
      } else {
        drawCoverFallback(doc, logo, ax, ticketY, zoneA, ticketH);
      }
      doc.rect(bx, ticketY, zoneB, ticketH).fill("#FFFFFF");
      doc.rect(cx, ticketY, zoneC, ticketH).fill(TF_SOFT);
      // Accent painted last (after content) so it stays continuous over cover.
    },
  );

  // Scale CSS TicketFace px → PDF pts so proportions match the online strip.
  const u = ticketW / TICKET_FACE_REF_W_PX;
  const T = TICKET_FACE_TYPE;
  const sz = (n: number) => Math.max(5, n * u);
  const bPadX = sz(T.padX);
  const bPadY = sz(T.padY);
  const gap = sz(T.gap);
  const bInnerW = zoneB - bPadX * 2;
  const logoDisplayH = sz(TICKET_BRAND_LOGO_H_PX);
  const logoGap = sz(TICKET_BRAND_LOGO_GAP_PX);

  const brandLogo = await prepareBrandLogo(logo, Math.round(logoDisplayH));
  const logoH = brandLogo?.h ?? logoDisplayH;
  const logoW = brandLogo?.w ?? Math.round(logoDisplayH * (544 / 381));

  // Measure info-column height (TicketFace `justify-center`) then draw.
  const titleSize = sz(T.titleSize);
  doc.font(fonts.bold).fontSize(titleSize);
  const titleH = Math.min(
    titleSize * 2.3,
    Math.ceil(
      doc.heightOfString(data.eventName, { width: bInnerW, lineGap: 1 }),
    ),
  );
  const dateSize = sz(T.dateSize);
  const dateH = data.dateLabel ? dateSize + 2 : 0;
  const locSize = sz(T.locSize);
  const locDetailSize = sz(T.locDetailSize);
  const locH =
    locSize + 2 + (data.locationDetail ? locDetailSize + 2 : 0);
  const doorsLabelSize = sz(T.doorsLabelSize);
  const doorsTimeSize = sz(T.doorsTimeSize);
  const hasDoors = Boolean(data.doors.headline || data.startLabel);
  const doorsH = hasDoors
    ? 8 + doorsLabelSize + 2 + doorsTimeSize + (data.doors.doorsNote ? 10 : 0) + 8
    : 0;
  const categorySize = sz(T.categorySize);
  const catH = categorySize + 6;
  const seatTextSize = sz(T.seatTextSize);
  const seatBoxH = sz(28);
  const seatH =
    seat.mode === "boxes" && seat.parts.length > 0 ? seatBoxH + gap : seatTextSize + 4;
  const footerSize = sz(T.footerSize);
  const hasFooter = Boolean(data.holderName || data.priceLabel);
  const footerH = hasFooter ? sz(T.footerSize) + sz(12) : 0;

  const contentH =
    logoH +
    logoGap +
    titleH +
    gap +
    dateH +
    locH +
    doorsH +
    catH +
    seatH +
    footerH;
  let by =
    ticketY +
    Math.max(bPadY, (ticketH - contentH) / 2);

  // Brand lockup — same asset + height as TicketFace BrandLogo
  if (brandLogo) {
    try {
      doc.image(brandLogo.buf, bx + (zoneB - logoW) / 2, by, {
        width: logoW,
        height: logoH,
      });
    } catch {
      doc
        .font(fonts.bold)
        .fontSize(sz(10))
        .fillColor(TF_NAVY)
        .text("Ticketfeeling", bx + bPadX, by + 4, {
          width: bInnerW,
          align: "center",
        });
    }
  } else {
    doc
      .font(fonts.bold)
      .fontSize(sz(10))
      .fillColor(TF_NAVY)
      .text("Ticketfeeling", bx + bPadX, by + 4, {
        width: bInnerW,
        align: "center",
      });
  }
  by += logoH + logoGap;

  doc.font(fonts.bold).fontSize(titleSize).fillColor(TF_NAVY);
  doc.text(data.eventName, bx + bPadX, by, {
    width: bInnerW,
    height: titleH,
    ellipsis: true,
    lineGap: 1,
  });
  by += titleH + gap;

  if (data.dateLabel) {
    doc
      .font(fonts.bold)
      .fontSize(dateSize)
      .fillColor(TF_NAVY)
      .text(data.dateLabel, bx + bPadX, by, {
        width: bInnerW,
        height: dateSize + 2,
        ellipsis: true,
      });
    by += dateH;
  }

  doc
    .font(fonts.bold)
    .fontSize(locSize)
    .fillColor(TF_NAVY)
    .text(data.locationName, bx + bPadX, by, {
      width: bInnerW,
      height: locSize + 2,
      ellipsis: true,
    });
  by += locSize + 2;
  if (data.locationDetail) {
    doc
      .font(fonts.regular)
      .fontSize(locDetailSize)
      .fillColor(TF_MUTED)
      .text(data.locationDetail, bx + bPadX, by, {
        width: bInnerW,
        height: locDetailSize + 2,
        ellipsis: true,
      });
    by += locDetailSize + 2;
  }

  if (hasDoors) {
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.7)
      .stroke();
    by += 4;

    const colGap = sz(8);
    const colW = (bInnerW - colGap) / 2;
    const doorsColor =
      data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
    const labelTracking = doorsLabelSize * 0.12;

    doc
      .font(fonts.bold)
      .fontSize(doorsLabelSize)
      .fillColor(TF_MUTED)
      .text((data.doors.headlineLabel || "Einlass").toUpperCase(), bx + bPadX, by, {
        width: colW,
        characterSpacing: labelTracking,
      });
    doc
      .font(fonts.bold)
      .fontSize(doorsLabelSize)
      .fillColor(TF_MUTED)
      .text("BEGINN", bx + bPadX + colW + colGap, by, {
        width: colW,
        characterSpacing: labelTracking,
      });
    by += doorsLabelSize + 2;

    // Vertical divider between EINLASS | BEGINN (TicketFace border-l)
    doc
      .moveTo(bx + bPadX + colW + colGap / 2, by - doorsLabelSize)
      .lineTo(
        bx + bPadX + colW + colGap / 2,
        by + doorsTimeSize + (data.doors.doorsNote ? 8 : 0),
      )
      .strokeColor(TF_LINE)
      .lineWidth(0.7)
      .stroke();

    doc
      .font(fonts.bold)
      .fontSize(doorsTimeSize)
      .fillColor(data.doors.timeLabel ? doorsColor : TF_MUTED)
      .text(
        data.doors.timeLabel ? `${data.doors.timeLabel} Uhr` : "—",
        bx + bPadX,
        by,
        { width: colW, height: doorsTimeSize + 2, ellipsis: true },
      );
    doc
      .font(fonts.bold)
      .fontSize(doorsTimeSize)
      .fillColor(TF_NAVY)
      .text(data.startLabel ?? "—", bx + bPadX + colW + colGap, by, {
        width: colW,
        height: doorsTimeSize + 2,
        ellipsis: true,
      });
    by += doorsTimeSize + 2;
    if (data.doors.doorsNote) {
      doc
        .font(fonts.regular)
        .fontSize(sz(9))
        .fillColor(TF_MUTED)
        .text(data.doors.doorsNote, bx + bPadX, by, {
          width: bInnerW,
          height: 10,
          ellipsis: true,
        });
      by += 10;
    }
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.7)
      .stroke();
    by += 4;
  }

  // Kategorie + optional VIP badge
  const catY = by;
  doc.font(fonts.regular).fontSize(categorySize);
  const catLabelW = doc.widthOfString("Kategorie ");
  doc.fillColor(TF_MUTED).text("Kategorie ", bx + bPadX, catY, { continued: false });
  let catX = bx + bPadX + catLabelW;
  if (data.isVip) {
    const badgeH = sz(16);
    const badgeW = sz(28);
    const badgeY = catY + (categorySize - badgeH) / 2;
    doc.save();
    try {
      doc
        .roundedRect(catX, badgeY, badgeW, badgeH, 3)
        .fillOpacity(0.12)
        .fill(TF_GOLD);
    } finally {
      doc.fillOpacity(1);
      doc.restore();
    }
    doc
      .roundedRect(catX, badgeY, badgeW, badgeH, 3)
      .strokeColor(TF_GOLD)
      .lineWidth(0.7)
      .stroke();
    doc
      .font(fonts.bold)
      .fontSize(sz(T.vipBadgeSize))
      .fillColor(TF_GOLD)
      .text("VIP", catX, badgeY + (badgeH - sz(T.vipBadgeSize)) / 2, {
        width: badgeW,
        align: "center",
      });
    catX += badgeW + sz(6);
    if (!/^vip$/i.test(data.categoryName.trim())) {
      doc
        .font(fonts.bold)
        .fontSize(categorySize)
        .fillColor(TF_NAVY)
        .text(data.categoryName, catX, catY, {
          width: Math.max(24, bx + bPadX + bInnerW - catX),
          height: categorySize + 2,
          ellipsis: true,
        });
    }
  } else {
    doc
      .font(fonts.bold)
      .fontSize(categorySize)
      .fillColor(TF_NAVY)
      .text(data.categoryName, catX, catY, {
        width: Math.max(24, bx + bPadX + bInnerW - catX),
        height: categorySize + 2,
        ellipsis: true,
      });
  }
  by = catY + catH;

  if (seat.mode === "boxes" && seat.parts.length > 0) {
    const boxGap = sz(6);
    const n = seat.parts.length;
    const boxW = (bInnerW - boxGap * (n - 1)) / n;
    const boxH = seatBoxH;
    for (let i = 0; i < n; i += 1) {
      const part = seat.parts[i]!;
      const ox = bx + bPadX + i * (boxW + boxGap);
      doc.roundedRect(ox, by, boxW, boxH, 4).fill(TF_SOFT);
      doc
        .roundedRect(ox, by, boxW, boxH, 4)
        .strokeColor(TF_LINE)
        .lineWidth(0.7)
        .stroke();
      if (part.label) {
        doc
          .font(fonts.bold)
          .fontSize(sz(8))
          .fillColor(TF_MUTED)
          .text(part.label, ox + 2, by + 3, {
            width: boxW - 4,
            align: "center",
            characterSpacing: 0.8,
          });
      }
      doc
        .font(fonts.bold)
        .fontSize(sz(T.seatBoxValueSize))
        .fillColor(TF_NAVY)
        .text(part.value, ox + 2, by + (part.label ? boxH * 0.42 : boxH * 0.28), {
          width: boxW - 4,
          align: "center",
          height: sz(T.seatBoxValueSize) + 2,
          ellipsis: true,
        });
    }
    by += boxH + gap;
  } else {
    doc
      .font(fonts.bold)
      .fontSize(seatTextSize)
      .fillColor(TF_NAVY)
      .text(seat.text, bx + bPadX, by, {
        width: bInnerW,
        height: seatTextSize + 2,
        ellipsis: true,
        characterSpacing: 0.4,
      });
    by += seatTextSize + 4;
  }

  if (hasFooter) {
    by += sz(10);
    // One line: Inhaber …   Preis … (TicketFace flex-wrap gap-x-4)
    doc.font(fonts.regular).fontSize(footerSize).fillColor(TF_MUTED);
    if (data.holderName) {
      doc.text("Inhaber ", bx + bPadX, by, { continued: true });
      doc.font(fonts.bold).fillColor(TF_NAVY).text(data.holderName, {
        continued: Boolean(data.priceLabel),
      });
    }
    if (data.priceLabel) {
      doc
        .font(fonts.regular)
        .fillColor(TF_MUTED)
        .text(data.holderName ? "    Preis " : "Preis ", {
          continued: true,
        });
      doc.font(fonts.bold).fillColor(TF_NAVY).text(data.priceLabel);
    }
  }

  // ── Zone C: QR stub — same flex air + sizes as TicketFace ──────────
  doc
    .moveTo(cx, ticketY + sz(12))
    .lineTo(cx, ticketY + ticketH - sz(12))
    .strokeColor(TF_LINE)
    .lineWidth(0.8)
    .dash(3, { space: 3 })
    .stroke()
    .undash();

  const cPad = sz(T.stubPadX);
  const cInnerW = zoneC - cPad * 2;
  const stubPadY = sz(T.stubPadY);
  const aboveBox = sponsorLogoBoxForScale(data.sponsorLogoAboveScale);
  const belowBox = sponsorLogoBoxForScale(data.sponsorLogoBelowScale);

  const qrTarget = hasSponsor
    ? Math.max(TICKET_QR_MIN_PX, T.qrWithSponsor)
    : T.qrNoSponsor;
  const quiet = sz(T.qrPlatePad);
  const qrMax = Math.min(cInnerW - quiet * 2, sz(qrTarget));
  const qrPlate = qrMax + quiet * 2;
  const admitSize = sz(T.admitSize);
  const ticketNoSize = sz(T.ticketNoSize);
  const hintSize = sz(T.hintSize);
  const coreGap = sz(2); // gap-0.5 between stub core items
  const admitBlockH = admitSize + 4;
  const ticketNoH = ticketNoSize + 2;
  const hintH = hintSize + 2;
  const coreH = admitBlockH + qrPlate + ticketNoH + hintH + coreGap * 3;
  const usableH = ticketH - stubPadY * 2;
  const slotAir = Math.max(0, usableH - coreH);

  let aboveSlotH: number;
  let belowSlotH: number;
  if (sponsorAbove && sponsorBelow) {
    aboveSlotH = belowSlotH = slotAir / 2;
  } else if (sponsorAbove) {
    aboveSlotH = Math.min(slotAir, sz(aboveBox.maxH + 14));
    belowSlotH = slotAir - aboveSlotH;
  } else if (sponsorBelow) {
    belowSlotH = Math.min(slotAir, sz(belowBox.maxH + 14));
    aboveSlotH = slotAir - belowSlotH;
  } else {
    // Empty flex-1 slots — center QR block like TicketFace
    aboveSlotH = belowSlotH = slotAir / 2;
  }

  const drawSponsorInSlot = (
    buf: Buffer,
    slotTop: number,
    slotHeight: number,
    box: { maxW: number; maxH: number },
  ) => {
    const sH = Math.min(sz(box.maxH), Math.max(sz(16), slotHeight - 4));
    const sW = Math.min(cInnerW, sz(box.maxW));
    const imgY = slotTop + Math.max(0, (slotHeight - sH) / 2);
    const imgX = cx + (zoneC - sW) / 2;
    try {
      doc.image(buf, imgX, imgY, {
        fit: [sW, sH],
        align: "center",
        valign: "center",
      });
    } catch {
      /* skip broken sponsor asset */
    }
  };

  const aboveSlotTop = ticketY + stubPadY;
  if (sponsorAbove) {
    drawSponsorInSlot(sponsorAbove, aboveSlotTop, aboveSlotH, aboveBox);
  }

  let cy = aboveSlotTop + aboveSlotH;

  doc
    .font(fonts.bold)
    .fontSize(admitSize)
    .fillColor(accent)
    .text(admitLabel, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      characterSpacing: admitSize * 0.14,
    });
  cy += admitBlockH;

  const qrPlateX = cx + (zoneC - qrPlate) / 2;
  doc.roundedRect(qrPlateX, cy, qrPlate, qrPlate, 4).fill("#FFFFFF");
  // Soft plate edge like TicketFace shadow-sm plate
  doc
    .roundedRect(qrPlateX, cy, qrPlate, qrPlate, 4)
    .strokeColor(TF_LINE)
    .lineWidth(0.5)
    .stroke();

  if (qr) {
    try {
      const img = await toPdfImageBuffer(
        Buffer.from(qr.replace(/^data:image\/png;base64,/, ""), "base64"),
      );
      doc.image(img, qrPlateX + quiet, cy + quiet, {
        width: qrMax,
        height: qrMax,
      });
    } catch {
      doc
        .font(fonts.regular)
        .fontSize(sz(8))
        .fillColor("#B91C1C")
        .text("Kein QR", cx + cPad, cy + qrPlate / 2, {
          width: cInnerW,
          align: "center",
        });
    }
  } else {
    doc
      .font(fonts.regular)
      .fontSize(sz(8))
      .fillColor("#B91C1C")
      .text("Kein gültiger QR-Code", cx + cPad, cy + qrPlate / 2, {
        width: cInnerW,
        align: "center",
      });
  }
  cy += qrPlate + coreGap;

  doc
    .font(fonts.bold)
    .fontSize(ticketNoSize)
    .fillColor(TF_NAVY)
    .text(data.ticketNumber, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      height: ticketNoH,
      ellipsis: true,
      characterSpacing: 0.3,
    });
  cy += ticketNoH;

  doc
    .font(fonts.regular)
    .fontSize(hintSize)
    .fillColor(TF_MUTED)
    .text(TF_QR_HINT, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
    });

  const belowSlotTop = ticketY + ticketH - stubPadY - belowSlotH;
  if (sponsorBelow) {
    drawSponsorInSlot(sponsorBelow, belowSlotTop, belowSlotH, belowBox);
  }

  // Ticket notches on perforation
  const notchR = sz(6);
  doc.circle(cx, ticketY, notchR).fill("#FFFFFF");
  doc.circle(cx, ticketY + ticketH, notchR).fill("#FFFFFF");

  // Continuous accent on top — last paint inside rounded clip (matches TicketFace z-20)
  await withRoundedClipAsync(
    doc,
    ticketX,
    ticketY,
    ticketW,
    ticketH,
    TICKET_CORNER_RADIUS_PX,
    () => {
      doc
        .rect(ticketX, ticketY, ticketW, TICKET_ACCENT_H_PX)
        .fill(accent);
    },
  );

  // Outer stroke
  doc
    .roundedRect(ticketX, ticketY, ticketW, ticketH, TICKET_CORNER_RADIUS_PX)
    .strokeColor(TF_LINE)
    .lineWidth(1.1)
    .stroke();

  // Notes below strip — one line like TicketFace
  const notesY = ticketY + ticketH + sz(14);
  const notes =
    data.organizerDisplayName
      ? `${TF_PRINT_HINT} · Veranstalter: ${data.organizerDisplayName}`
      : TF_PRINT_HINT;
  doc
    .font(fonts.regular)
    .fontSize(sz(12))
    .fillColor(TF_MUTED)
    .text(notes, margin, notesY, {
      width: ticketW,
      align: "left",
    });
}

export async function renderTicketPdf(ticketId: string): Promise<{
  buffer: Buffer;
  ticketNumber: string;
  filename: string;
}> {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  const cover = await loadTicketImageBuffer(data.coverUrl, data.coverAbsoluteUrl);
  const sponsorAbove = await loadTicketImageBuffer(
    data.sponsorLogoAboveUrl,
    data.sponsorLogoAboveAbsoluteUrl,
    { kind: "sponsor" },
  );
  const sponsorBelow = await loadTicketImageBuffer(
    data.sponsorLogoBelowUrl,
    data.sponsorLogoBelowAbsoluteUrl,
    { kind: "sponsor" },
  );
  const logo = await loadLogoBuffer();

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    compress: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  await drawTicketPage(doc, data, qr, cover, logo, {
    sponsorAbove,
    sponsorBelow,
  });
  doc.end();
  const buffer = await done;
  return {
    buffer,
    ticketNumber: data.ticketNumber,
    filename: `${data.ticketNumber}.pdf`,
  };
}

/** One multi-page A4 PDF for all tickets of an order (e-mail / box office). */
export async function renderOrderTicketsPdf(orderId: string): Promise<{
  buffer: Buffer;
  filename: string;
  ticketCount: number;
}> {
  const tickets = await prisma.ticket.findMany({
    where: { orderId },
    orderBy: { ticketNumber: "asc" },
    select: { id: true, ticketNumber: true, order: { select: { orderNumber: true } } },
  });
  if (tickets.length === 0) throw new Error("NO_TICKETS");

  const presentations = await Promise.all(
    tickets.map(async (t) => {
      const data = await loadTicketPresentation(t.id);
      const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
      const cover = await loadTicketImageBuffer(data.coverUrl, data.coverAbsoluteUrl);
      const sponsorAbove = await loadTicketImageBuffer(
        data.sponsorLogoAboveUrl,
        data.sponsorLogoAboveAbsoluteUrl,
        { kind: "sponsor" },
      );
      const sponsorBelow = await loadTicketImageBuffer(
        data.sponsorLogoBelowUrl,
        data.sponsorLogoBelowAbsoluteUrl,
        { kind: "sponsor" },
      );
      return { data, qr, cover, sponsorAbove, sponsorBelow };
    }),
  );
  const logo = await loadLogoBuffer();

  const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (let i = 0; i < presentations.length; i += 1) {
    const { data, qr, cover, sponsorAbove, sponsorBelow } = presentations[i]!;
    if (i > 0) doc.addPage({ size: "A4", margin: 0 });
    await drawTicketPage(doc, data, qr, cover, logo, {
      pageIndexLabel:
        presentations.length > 1
          ? `${data.isVip ? "VIP-TICKET" : "EINLASSTICKET"}  ${i + 1}/${presentations.length}`
          : null,
      sponsorAbove,
      sponsorBelow,
    });
  }

  doc.end();
  const buffer = await done;
  const orderNumber = tickets[0]!.order.orderNumber;
  return {
    buffer,
    filename: `${orderNumber}-tickets.pdf`,
    ticketCount: presentations.length,
  };
}
