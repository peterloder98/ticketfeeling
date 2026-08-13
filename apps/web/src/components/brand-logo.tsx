import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BRAND_GOLD, BRAND_NAVY, BRAND_TEAL } from "@/components/brand-logo-mark";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  /** `dark` = light wordmark for navy/dark backgrounds (mark raster unchanged). */
  tone?: "light" | "dark";
  className?: string;
  priority?: boolean;
  /** When set (e.g. ticket face), overrides default responsive height classes. */
  style?: CSSProperties;
};

/** Cache-bust so browsers pick up the latest artwork. */
const V = "20260813-tfsharp";

/**
 * TF mark = soft-knockout from original icon plate (`make-icon-master.ts`).
 * Intrinsic matches `public/brand/icon-tf.png` / `icon-mark-clear.png` (535×329).
 */
const MARK = {
  src: `/brand/icon-tf.png?v=${V}`,
  width: 535,
  height: 329,
  className: "aspect-[535/329] h-8 w-auto md:h-9",
} as const;

const APP = {
  src: `/brand/icon-tf.png?v=${V}`,
  width: 535,
  height: 329,
  className: "aspect-[535/329] h-9 w-auto md:h-10",
} as const;

const LOCKUP_VB = { w: 520, h: 360 } as const;

/**
 * Full lockup: official sharp raster mark + crisp Inter wordmark/tagline in SVG.
 *
 * Root cause of blur: `/brand/logo-ticketfeeling.png` is a soft-knockout from a
 * JPEG plate (~544×381). Thin wordmark/tagline glyphs stay fuzzy at footer size.
 * Mark/app keep the same `icon-tf.png` path (already sharp).
 * Email headers use `icon-tf.png` + HTML wordmark (see ticket-mail), not the soft PNG.
 */
function FullLockup({
  className = "",
  style,
  tone = "light",
}: {
  className?: string;
  style?: CSSProperties;
  tone?: "light" | "dark";
}) {
  const sizedByStyle = style?.height != null || style?.width != null;
  const markHref = MARK.src;
  const ticketFill = tone === "dark" ? "#FFFFFF" : BRAND_NAVY;
  const feelingFill = BRAND_TEAL;
  const taglineFill = tone === "dark" ? BRAND_TEAL : BRAND_GOLD;

  return (
    <svg
      viewBox={`0 0 ${LOCKUP_VB.w} ${LOCKUP_VB.h}`}
      className={`${sizedByStyle ? "w-auto" : "h-14 w-auto sm:h-16 md:h-[4.5rem]"} ${className}`}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Ticketfeeling"
    >
      <title>Ticketfeeling</title>
      {/* Official mark raster — same asset as BrandLogo mark/app */}
      <image
        href={markHref}
        x={70}
        y={6}
        width={380}
        height={234}
        preserveAspectRatio="xMidYMid meet"
      />
      <text
        x={LOCKUP_VB.w / 2}
        y={268}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-body), Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: "-0.02em",
        }}
      >
        <tspan fill={ticketFill}>ticket</tspan>
        <tspan fill={feelingFill}>feeling</tspan>
      </text>
      <text
        x={LOCKUP_VB.w / 2}
        y={318}
        textAnchor="middle"
        fill={taglineFill}
        style={{
          fontFamily: "var(--font-body), Inter, system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: "0.14em",
        }}
      >
        MEHR ALS EIN TICKET.
      </text>
    </svg>
  );
}

/**
 * Official Ticketfeeling artwork — never distort / recolor / outline / shadow / 3D.
 * Full = sharp mark raster + Inter type; mark/app = icon-tf.png only.
 */
export function BrandLogo({
  href = "/",
  variant = "full",
  tone = "light",
  className = "",
  priority = false,
  style,
}: BrandLogoProps) {
  if (variant === "full") {
    const graphic = <FullLockup className={className} style={style} tone={tone} />;
    if (!href) return graphic;
    return (
      <Link href={href} className="inline-flex items-center" aria-label="Ticketfeeling Startseite">
        {graphic}
      </Link>
    );
  }

  const asset = variant === "app" ? APP : MARK;
  const sizedByStyle = style?.height != null || style?.width != null;

  const graphic = (
    <Image
      src={asset.src}
      alt="Ticketfeeling"
      width={asset.width}
      height={asset.height}
      priority={priority}
      quality={100}
      unoptimized
      style={style}
      className={`object-contain ${sizedByStyle ? "w-auto" : asset.className} ${className}`}
    />
  );

  if (!href) return graphic;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Ticketfeeling Startseite">
      {graphic}
    </Link>
  );
}
