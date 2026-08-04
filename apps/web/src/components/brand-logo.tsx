import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  className?: string;
  priority?: boolean;
};

/** Cache-bust so browsers pick up the latest artwork. */
const V = "20260804a";

/**
 * Intrinsic pixel sizes match cleaned PNG masters (object-contain, never stretch).
 * Full lockup is height-driven so aspect ratio stays correct in nav/footer/hero.
 */
const ASSETS = {
  full: {
    src: `/brand/logo-ticketfeeling.png?v=${V}`,
    width: 455,
    height: 309,
    /** Height-driven — keep w-auto so AR never stretches. */
    className: "h-14 w-auto sm:h-16 md:h-[4.5rem]",
  },
  mark: {
    src: `/brand/icon-mark-clear.png?v=${V}`,
    width: 574,
    height: 232,
    className: "h-8 w-auto md:h-9",
  },
  app: {
    src: `/brand/icon-app-clear.png?v=${V}`,
    width: 512,
    height: 512,
    className: "h-9 w-auto md:h-10",
  },
} as const;

/** Official Ticketfeeling artwork — never distort/recolor/outline. */
export function BrandLogo({
  href = "/",
  variant = "full",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const asset = ASSETS[variant];
  const img = (
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

  if (!href) return img;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Ticketfeeling Startseite">
      {img}
    </Link>
  );
}
