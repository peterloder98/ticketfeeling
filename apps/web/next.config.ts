import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // PDFKit (invoices) + Chromium ticket PDF must not be webpack-bundled.
  serverExternalPackages: [
    "pdfkit",
    "fontkit",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // Monorepo: trace files from repo root (needed on Vercel with Root Directory apps/web).
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@sparticuz/chromium/**/*",
      "./public/brand/logo-ticketfeeling.png",
    ],
  },
};

export default nextConfig;
