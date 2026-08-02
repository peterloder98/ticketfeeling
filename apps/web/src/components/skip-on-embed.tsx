"use client";

import { usePathname } from "next/navigation";

/** Hides children on /embed/* so embed layout can mount its own tracking/consent. */
export function SkipOnEmbed({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed")) return null;
  return <>{children}</>;
}
