/**
 * DEPRECATED: mark/app PNGs come from original artwork via make-icon-master.ts.
 * Do NOT overwrite icon-*-clear.png from the SVG recreation.
 *
 * Full lockup PNGs: make-logo-master.ts
 * Mark/app icons:   make-icon-master.ts
 *
 * This script remains only as a no-op redirect reminder.
 *
 * Usage: npx tsx scripts/render-brand-logos.ts
 */
console.error(
  [
    "render-brand-logos.ts no longer rasterizes SVG mark/app icons.",
    "Use: npx tsx scripts/make-icon-master.ts [sourcePath]",
    "     npx tsx scripts/make-logo-master.ts [sourcePath]",
  ].join("\n"),
);
process.exit(1);
