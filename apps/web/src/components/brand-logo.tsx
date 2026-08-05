import Image from "next/image";
import Link from "next/link";
import { BrandLogoMark } from "@/components/brand-logo-mark";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  className?: string;
  priority?: boolean;
};

/** Cache-bust so browsers pick up the latest artwork. */
const V = "20260805-plate2x";

/**
 * Full lockup = soft-knockout from black-plate JPEG, native content resolution.
 * Intrinsic pixels match `public/brand/logo-ticketfeeling.png`.
 * Height-driven `w-auto object-contain` — never stretch / never SVG lockup.
 *
 * Display guidance (2× screens): CSS height ≲ half of source height.
 * Master is 381px tall → keep CSS height ≤ ~190px (hero ≤88px / footer 56px are safe).
 */
const FULL = {
  src: `/brand/logo-ticketfeeling.png?v=${V}`,
  width: 544,
  height: 381,
  className: "h-14 w-auto sm:h-16 md:h-[4.5rem]",
} as const;

const MARK_CLASS = "aspect-[520/220] h-8 w-auto md:h-9";
const APP_CLASS = "aspect-[520/220] h-9 w-auto md:h-10";

/**
 * Official Ticketfeeling artwork — never distort / recolor / outline / shadow / 3D.
 * Full lockup uses the original raster; mark/app use crisp SVG monogram.
 */
export function BrandLogo({
  href = "/",
  variant = "full",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const graphic =
    variant === "full" ? (
      <Image
        src={FULL.src}
        alt="Ticketfeeling"
        width={FULL.width}
        height={FULL.height}
        priority={priority}
        quality={100}
        unoptimized
        className={`object-contain ${FULL.className} ${className}`}
      />
    ) : (
      <BrandLogoMark
        className={`block max-w-full object-contain ${
          variant === "app" ? APP_CLASS : MARK_CLASS
        } ${className}`}
      />
    );

  if (!href) return graphic;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Ticketfeeling Startseite">
      {graphic}
    </Link>
  );
}
