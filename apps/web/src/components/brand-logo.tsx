import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  className?: string;
  priority?: boolean;
};

/** Cache-bust so browsers pick up the latest artwork. */
const V = "20260805-tfmark";

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

/**
 * TF mark = soft-knockout from original icon plate (`make-icon-master.ts`).
 * Intrinsic matches `public/brand/icon-tf.png` / `icon-mark-clear.png` (535×329).
 * Mark/app share the same raster; app chrome uses the same aspect for UI consistency.
 * Favicon/apple use square `icon-app-clear.png` separately.
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

/**
 * Official Ticketfeeling artwork — never distort / recolor / outline / shadow / 3D.
 * Full lockup + mark/app all use original rasters (not SVG recreations).
 */
export function BrandLogo({
  href = "/",
  variant = "full",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const asset = variant === "full" ? FULL : variant === "app" ? APP : MARK;

  const graphic = (
    <Image
      src={asset.src}
      alt="Ticketfeeling"
      width={asset.width}
      height={asset.height}
      priority={priority}
      quality={100}
      unoptimized
      className={`object-contain ${asset.className} ${className}`}
    />
  );

  if (!href) return graphic;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Ticketfeeling Startseite">
      {graphic}
    </Link>
  );
}
