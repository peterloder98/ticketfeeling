import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit loads Helvetica.afm via fs from its package dir — must not be webpack-bundled.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
