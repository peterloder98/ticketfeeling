"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides site chrome on embed routes (full) and scanner (mobile-only).
 */
export function HideSiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = Boolean(pathname?.startsWith("/embed"));
  const isScanner = Boolean(pathname?.startsWith("/scanner"));

  useEffect(() => {
    document.documentElement.classList.toggle("tf-embed-route", isEmbed);
    document.documentElement.classList.toggle("tf-scanner-route", isScanner);
    return () => {
      document.documentElement.classList.remove("tf-embed-route", "tf-scanner-route");
    };
  }, [isEmbed, isScanner]);

  if (isEmbed) return null;
  if (isScanner) return <div className="max-md:hidden">{children}</div>;
  return <>{children}</>;
}
