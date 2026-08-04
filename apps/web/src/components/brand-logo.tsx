import Link from "next/link";
import { BrandLogoLockup, BrandLogoMark } from "@/components/brand-logo-mark";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  className?: string;
  /** Kept for API compat with former next/image usage; SVG needs no preload. */
  priority?: boolean;
};

const FULL_CLASS = "aspect-[520/360] h-14 w-auto sm:h-16 md:h-[4.5rem]";
const MARK_CLASS = "aspect-[520/220] h-8 w-auto md:h-9";
const APP_CLASS = "aspect-[520/220] h-9 w-auto md:h-10";

/**
 * Official Ticketfeeling artwork — vector lockup/mark (sharp at any size).
 * Never distort / recolor / outline / shadow / 3D.
 */
export function BrandLogo({
  href = "/",
  variant = "full",
  className = "",
  priority: _priority = false,
}: BrandLogoProps) {
  const graphic =
    variant === "full" ? (
      <BrandLogoLockup
        className={`block max-w-full object-contain ${FULL_CLASS} ${className}`}
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
