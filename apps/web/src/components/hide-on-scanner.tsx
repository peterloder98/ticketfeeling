"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * On /scanner: hide site chrome on mobile only (fullscreen app).
 * Desktop keeps header/footer — scanner sits in the AdminShell.
 */
export function HideOnScanner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onScanner = Boolean(pathname?.startsWith("/scanner"));

  useEffect(() => {
    document.documentElement.classList.toggle("tf-scanner-route", onScanner);
    return () => document.documentElement.classList.remove("tf-scanner-route");
  }, [onScanner]);

  if (!onScanner) return <>{children}</>;

  return <div className="max-md:hidden">{children}</div>;
}
