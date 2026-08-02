import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string | null;
  variant?: "full" | "mark" | "app";
  className?: string;
  priority?: boolean;
};

/** Cache-bust so browsers pick up the latest artwork. */
const V = "20260731b";

const ASSETS = {
  full: {
    src: `/brand/logo-lockup.png?v=${V}`,
    width: 908,
    height: 650,
    className: "h-auto w-[200px] sm:w-[240px] md:w-[280px]",
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
    className: "h-9 w-9 md:h-10 md:w-10",
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
