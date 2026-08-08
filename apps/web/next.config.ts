import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // PDFKit loads Helvetica.afm via fs from its package dir — must not be webpack-bundled.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Monorepo: trace files from repo root (needed on Vercel with Root Directory apps/web).
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Inter TTFs + brand lockup are read via fs in ticket-pdf (not import-traced).
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./assets/fonts/Inter-Regular.ttf",
      "./assets/fonts/Inter-Bold.ttf",
      "./public/brand/logo-ticketfeeling.png",
    ],
  },
};

export default nextConfig;
