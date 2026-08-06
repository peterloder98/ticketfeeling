"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function readPopupFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("popup") === "1";
  } catch {
    return false;
  }
}

/**
 * Hides site chrome on embed routes (full), scanner (mobile-only),
 * and Saalplan editor popups (?popup=1).
 */
export function HideSiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = Boolean(pathname?.startsWith("/embed"));
  const isScanner = Boolean(pathname?.startsWith("/scanner"));
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    setIsPopup(readPopupFlag());
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("tf-embed-route", isEmbed);
    document.documentElement.classList.toggle("tf-scanner-route", isScanner);
    document.documentElement.classList.toggle("tf-popup-route", isPopup);
    return () => {
      document.documentElement.classList.remove(
        "tf-embed-route",
        "tf-scanner-route",
        "tf-popup-route",
      );
    };
  }, [isEmbed, isScanner, isPopup]);

  if (isEmbed || isPopup) return null;
  if (isScanner) return <div className="max-md:hidden">{children}</div>;
  return <>{children}</>;
}
