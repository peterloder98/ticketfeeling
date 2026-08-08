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
  TF_INK,
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
 * PDFKit mishandles many formats (WebP/AVIF/RGBA soft-masks). Always embed
 * flattened RGB PNG so covers/logos/QR never leave unrestored clips or invisible text.
 */
async function toPdfImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
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

async function loadCoverBuffer(url: string | null): Promise<Buffer | null> {
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
    return await toPdfImageBuffer(raw);
  } catch {
    return null;
  }
}

/** Prefer absolute URL when relative public/file load fails (covers + sponsors). */
async function loadTicketImageBuffer(
  relativeOrAbsolute: string | null,
  absoluteFallback: string | null,
): Promise<Buffer | null> {
  const primary = await loadCoverBuffer(relativeOrAbsolute);
  if (primary) return primary;
  if (
    absoluteFallback &&
    absoluteFallback !== relativeOrAbsolute
  ) {
    return loadCoverBuffer(absoluteFallback);
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

  // ── Zone B: info ─────────────────────────────────────────────────
  const bPadX = 12;
  const bPadY = 8;
  const bInnerW = zoneB - bPadX * 2;
  let by = ticketY + bPadY;

  // Brand lockup centered at top of middle zone — match TicketFace air before title
  const brandLogo = await prepareBrandLogo(logo, TICKET_BRAND_LOGO_H_PX);
  const logoH = brandLogo?.h ?? TICKET_BRAND_LOGO_H_PX;
  if (brandLogo) {
    try {
      doc.image(brandLogo.buf, bx + (zoneB - brandLogo.w) / 2, by, {
        width: brandLogo.w,
        height: brandLogo.h,
      });
    } catch {
      doc
        .font(fonts.bold)
        .fontSize(10)
        .fillColor(TF_NAVY)
        .text("Ticketfeeling", bx + bPadX, by + 4, {
          width: bInnerW,
          align: "center",
        });
    }
  } else {
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(TF_NAVY)
      .text("Ticketfeeling", bx + bPadX, by + 4, {
        width: bInnerW,
        align: "center",
      });
  }
  by += logoH + TICKET_BRAND_LOGO_GAP_PX;

  // Title then date — advance by measured height so lines never overlap
  const titleSize = 13.5;
  doc.font(fonts.bold).fontSize(titleSize);
  const titleMaxH = 32;
  const titleH = Math.min(
    titleMaxH,
    Math.ceil(doc.heightOfString(data.eventName, { width: bInnerW, lineGap: 0.5 })),
  );
  doc.fillColor(TF_NAVY).text(data.eventName, bx + bPadX, by, {
    width: bInnerW,
    height: titleH,
    ellipsis: true,
    lineGap: 0.5,
  });
  by += titleH + 3;

  if (data.dateLabel) {
    const dateSize = 8.5;
    doc.font(fonts.regular).fontSize(dateSize);
    const dateH = Math.min(
      12,
      Math.ceil(doc.heightOfString(data.dateLabel, { width: bInnerW })),
    );
    doc.fillColor(TF_NAVY).text(data.dateLabel, bx + bPadX, by, {
      width: bInnerW,
      height: dateH,
      ellipsis: true,
    });
    by += dateH + 2;
  }

  // Location: name + city/address
  doc
    .font(fonts.bold)
    .fontSize(8.5)
    .fillColor(TF_NAVY)
    .text(data.locationName, bx + bPadX, by, {
      width: bInnerW,
      height: 11,
      ellipsis: true,
    });
  by = doc.y + 0.5;
  if (data.locationDetail) {
    doc
      .font(fonts.regular)
      .fontSize(7)
      .fillColor(TF_MUTED)
      .text(data.locationDetail, bx + bPadX, by, {
        width: bInnerW,
        height: 9,
        ellipsis: true,
      });
    by = doc.y + 2;
  } else {
    by += 2;
  }

  // EINLASS | BEGINN side by side
  if (data.doors.headline || data.startLabel) {
    const colW = (bInnerW - 8) / 2;
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.6)
      .stroke();
    by += 3;

    const doorsColor =
      data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
    doc
      .font(fonts.regular)
      .fontSize(6)
      .fillColor(TF_MUTED)
      .text((data.doors.headlineLabel || "Einlass").toUpperCase(), bx + bPadX, by, {
        width: colW,
        characterSpacing: 0.6,
      });
    doc
      .font(fonts.regular)
      .fontSize(6)
      .fillColor(TF_MUTED)
      .text("BEGINN", bx + bPadX + colW + 8, by, {
        width: colW,
        characterSpacing: 0.6,
      });
    by += 8;

    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(data.doors.timeLabel ? doorsColor : TF_MUTED)
      .text(
        data.doors.timeLabel ? `${data.doors.timeLabel} Uhr` : "—",
        bx + bPadX,
        by,
        { width: colW, height: 12, ellipsis: true },
      );
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(TF_NAVY)
      .text(data.startLabel ?? "—", bx + bPadX + colW + 8, by, {
        width: colW,
        height: 12,
        ellipsis: true,
      });
    by += 12;
    if (data.doors.doorsNote) {
      doc
        .font(fonts.regular)
        .fontSize(6.5)
        .fillColor(TF_MUTED)
        .text(data.doors.doorsNote, bx + bPadX, by, {
          width: bInnerW,
          height: 9,
          ellipsis: true,
        });
      by = doc.y + 1;
    }
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.6)
      .stroke();
    by += 3;
  }

  // Category (VIP gold accent only)
  const catY = by;
  doc.font(fonts.regular).fontSize(7.5);
  const catLabelW = doc.widthOfString("Kategorie");
  doc.fillColor(TF_MUTED).text("Kategorie", bx + bPadX, catY, { continued: false });
  let catX = bx + bPadX + catLabelW + 6;
  if (data.isVip) {
    const badgeW = 22;
    const badgeH = 11;
    doc.save();
    try {
      doc.roundedRect(catX, catY - 1, badgeW, badgeH, 2).fillOpacity(0.12).fill(TF_GOLD);
    } finally {
      doc.fillOpacity(1);
      doc.restore();
    }
    doc
      .roundedRect(catX, catY - 1, badgeW, badgeH, 2)
      .strokeColor(TF_GOLD)
      .lineWidth(0.6)
      .stroke();
    doc
      .font(fonts.bold)
      .fontSize(6.5)
      .fillColor(TF_GOLD)
      .text("VIP", catX, catY + 1.5, { width: badgeW, align: "center" });
    catX += badgeW + 6;
    if (!/^vip$/i.test(data.categoryName.trim())) {
      doc
        .font(fonts.bold)
        .fontSize(8)
        .fillColor(TF_NAVY)
        .text(data.categoryName, catX, catY, {
          width: Math.max(24, bx + bPadX + bInnerW - catX),
          height: 12,
          ellipsis: true,
        });
    }
  } else {
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(TF_NAVY)
      .text(data.categoryName, catX, catY, {
        width: Math.max(24, bx + bPadX + bInnerW - catX),
        height: 12,
        ellipsis: true,
      });
  }
  by = catY + 14;

  // Seat highlight boxes / text
  if (seat.mode === "boxes" && seat.parts.length > 0) {
    const gap = 5;
    const n = seat.parts.length;
    const boxW = (bInnerW - gap * (n - 1)) / n;
    const boxH = 24;
    for (let i = 0; i < n; i += 1) {
      const part = seat.parts[i]!;
      const ox = bx + bPadX + i * (boxW + gap);
      doc.roundedRect(ox, by, boxW, boxH, 4).fill(TF_SOFT);
      doc
        .roundedRect(ox, by, boxW, boxH, 4)
        .strokeColor(TF_LINE)
        .lineWidth(0.7)
        .stroke();
      if (part.label) {
        doc
          .font(fonts.regular)
          .fontSize(6)
          .fillColor(TF_MUTED)
          .text(part.label, ox + 2, by + 2, {
            width: boxW - 4,
            align: "center",
          });
      }
      doc
        .font(fonts.bold)
        .fontSize(10)
        .fillColor(TF_NAVY)
        .text(part.value, ox + 2, by + (part.label ? 11 : 6), {
          width: boxW - 4,
          align: "center",
          height: 12,
          ellipsis: true,
        });
    }
    by += boxH + 3;
  } else {
    doc
      .font(fonts.bold)
      .fontSize(11)
      .fillColor(TF_NAVY)
      .text(seat.text, bx + bPadX, by, {
        width: bInnerW,
        height: 13,
        ellipsis: true,
      });
    by = doc.y + 3;
  }

  const footerMeta: { label: string; value: string }[] = [
    data.holderName ? { label: "Inhaber", value: data.holderName } : null,
    data.priceLabel ? { label: "Preis", value: data.priceLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Inhaber | Preis follow seat in the info flow (extra air above)
  if (footerMeta.length > 0) by += 8;
  for (const row of footerMeta) {
    if (by > ticketY + ticketH - 10) break;
    doc
      .font(fonts.regular)
      .fontSize(7)
      .fillColor(TF_MUTED)
      .text(`${row.label}  `, bx + bPadX, by, { continued: true });
    doc
      .font(fonts.bold)
      .fontSize(7.5)
      .fillColor(TF_INK)
      .text(row.value, { continued: false });
    by = doc.y + 1;
  }

  // ── Zone C: QR stub (soft fill already painted under rounded clip) ──
  doc
    .moveTo(cx, ticketY + 12)
    .lineTo(cx, ticketY + ticketH - 12)
    .strokeColor(TF_LINE)
    .lineWidth(0.8)
    .dash(3, { space: 3 })
    .stroke()
    .undash();

  const cPad = 8;
  const cInnerW = zoneC - cPad * 2;
  const stubPadY = 6;
  const aboveBox = sponsorLogoBoxForScale(data.sponsorLogoAboveScale);
  const belowBox = sponsorLogoBoxForScale(data.sponsorLogoBelowScale);

  // QR stays at current floor; logos use leftover air in above/below slots.
  const qrMax = Math.min(
    cInnerW - 2,
    hasSponsor ? Math.max(TICKET_QR_MIN_PX, 118) : 128,
  );
  const quiet = 5;
  const qrPlate = qrMax + quiet * 2;
  const admitBlockH = 11;
  const ticketNoH = 11;
  const hintH = 10;
  const coreGaps = 8;
  const coreH = admitBlockH + qrPlate + ticketNoH + hintH + coreGaps;
  const usableH = ticketH - stubPadY * 2;
  const slotAir = Math.max(0, usableH - coreH);
  // Prefer a generous slot for present logos; empty side keeps leftover for balance.
  let aboveSlotH: number;
  let belowSlotH: number;
  if (sponsorAbove && sponsorBelow) {
    aboveSlotH = belowSlotH = slotAir / 2;
  } else if (sponsorAbove) {
    aboveSlotH = Math.min(slotAir, aboveBox.maxH + 14);
    belowSlotH = slotAir - aboveSlotH;
  } else if (sponsorBelow) {
    belowSlotH = Math.min(slotAir, belowBox.maxH + 14);
    aboveSlotH = slotAir - belowSlotH;
  } else {
    aboveSlotH = belowSlotH = slotAir / 2;
  }

  const drawSponsorInSlot = (
    buf: Buffer,
    slotTop: number,
    slotHeight: number,
    box: { maxW: number; maxH: number },
  ) => {
    const logoH = Math.min(box.maxH, Math.max(16, slotHeight - 4));
    const logoW = Math.min(cInnerW, box.maxW);
    const imgY = slotTop + Math.max(0, (slotHeight - logoH) / 2);
    const imgX = cx + (zoneC - logoW) / 2;
    try {
      doc.image(buf, imgX, imgY, {
        fit: [logoW, logoH],
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
    .fontSize(7.5)
    .fillColor(accent)
    .text(admitLabel, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      characterSpacing: 1.1,
    });
  cy = doc.y + 3;

  const qrPlateX = cx + (zoneC - qrPlate) / 2;

  doc.roundedRect(qrPlateX, cy, qrPlate, qrPlate, 4).fill("#FFFFFF");

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
        .fontSize(8)
        .fillColor("#B91C1C")
        .text("Kein QR", cx + cPad, cy + qrPlate / 2, {
          width: cInnerW,
          align: "center",
        });
    }
  } else {
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#B91C1C")
      .text("Kein gültiger QR-Code", cx + cPad, cy + qrPlate / 2, {
        width: cInnerW,
        align: "center",
      });
  }
  cy += qrPlate + 3;

  doc
    .font(fonts.bold)
    .fontSize(6.5)
    .fillColor(TF_NAVY)
    .text(data.ticketNumber, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      height: 10,
      ellipsis: true,
    });
  cy = doc.y + 1;

  doc
    .font(fonts.regular)
    .fontSize(6.5)
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
  const notchR = 6;
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
    .lineWidth(1.25)
    .stroke();

  // Notes below strip (organizer name only — never street address)
  let notesY = ticketY + ticketH + 22;
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(TF_MUTED)
    .text(TF_PRINT_HINT, margin, notesY, {
      width: ticketW,
      align: "left",
    });
  notesY = doc.y + 8;

  if (data.organizerDisplayName) {
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(TF_MUTED)
      .text(`Veranstalter: ${data.organizerDisplayName}`, margin, notesY, {
        width: ticketW,
        height: 12,
        ellipsis: true,
      });
  }
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
  );
  const sponsorBelow = await loadTicketImageBuffer(
    data.sponsorLogoBelowUrl,
    data.sponsorLogoBelowAbsoluteUrl,
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
      );
      const sponsorBelow = await loadTicketImageBuffer(
        data.sponsorLogoBelowUrl,
        data.sponsorLogoBelowAbsoluteUrl,
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
