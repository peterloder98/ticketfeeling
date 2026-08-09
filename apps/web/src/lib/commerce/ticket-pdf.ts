import { prisma } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr-server";
import {
  buildOrderTicketsHtmlDocument,
  buildTicketHtmlDocument,
} from "@/lib/commerce/ticket-document";
import { loadTicketPresentation } from "@/lib/commerce/ticket-presentation";

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
 * Print canonical ticket HTML to A4 PDF via Chromium.
 * Same markup as online TicketFace — permanent 1:1 parity.
 */
export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  // Dynamic imports keep local/dev flexible and avoid bundling Chromium into client.
  const puppeteer = await import("puppeteer-core");

  let executablePath: string | undefined;
  let args: string[] = ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"];

  if (isVercel) {
    const chromium = await import("@sparticuz/chromium");
    // v147: setter is assigned, not called; disables SwiftShader extract on Lambda.
    chromium.default.setGraphicsMode = false;
    executablePath = await chromium.default.executablePath();
    args = chromium.default.args;
  } else {
    // Local: prefer system Chrome / Chromium / Edge.
    const candidates = [
      process.env.CHROME_PATH,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].filter(Boolean) as string[];
    const { existsSync } = await import("fs");
    executablePath = candidates.find((p) => existsSync(p));
    if (!executablePath) {
      throw new Error(
        "No Chrome/Chromium found for ticket PDF. Set CHROME_PATH or deploy on Vercel.",
      );
    }
  }

  const browser = await puppeteer.default.launch({
    args,
    defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 2 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 45_000,
    });
    // Ensure webfonts (Inter) are applied before print.
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function renderTicketPdf(ticketId: string): Promise<{
  buffer: Buffer;
  ticketNumber: string;
  filename: string;
}> {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  const html = buildTicketHtmlDocument(data, qr, { absoluteAssets: true });
  const buffer = await htmlToPdfBuffer(html);
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

  const pages = await Promise.all(
    tickets.map(async (t) => {
      const data = await loadTicketPresentation(t.id);
      const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
      return { data, qr };
    }),
  );

  const html = buildOrderTicketsHtmlDocument(pages);
  const buffer = await htmlToPdfBuffer(html);
  const orderNumber = tickets[0]?.order.orderNumber ?? orderId;
  return {
    buffer,
    filename: `${orderNumber}-tickets.pdf`,
    ticketCount: tickets.length,
  };
}
