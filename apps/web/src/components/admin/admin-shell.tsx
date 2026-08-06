"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TOP_NAV, isAdminNavActive } from "@/lib/admin/nav";

const BOX_OFFICE_NAV: { href: string; label: string; match?: string[] }[] = [
  { href: "/kasse", label: "Tageskasse", match: ["/kasse"] },
];

const SCANNER_ONLY_NAV: { href: string; label: string; match?: string[] }[] = [
  { href: "/scanner", label: "Scanner", match: ["/scanner"] },
];

export function AdminShell({
  email,
  children,
  fullBleedMobile = false,
  /** Vorverkaufsstelle: only Tageskasse in the sidebar. */
  boxOfficeOnly = false,
  /** Scannerpersonal: only Scanner in the sidebar. */
  scannerOnly = false,
}: {
  email: string;
  children: React.ReactNode;
  /** Mobile: no sidebar / padding (e.g. scanner fullscreen). Desktop unchanged. */
  fullBleedMobile?: boolean;
  boxOfficeOnly?: boolean;
  scannerOnly?: boolean;
}) {
  const pathname = usePathname();
  const navItems = boxOfficeOnly
    ? BOX_OFFICE_NAV
    : scannerOnly
      ? SCANNER_ONLY_NAV
      : ADMIN_TOP_NAV;
  const restricted = boxOfficeOnly || scannerOnly;

  return (
    <div
      className={
        fullBleedMobile
          ? "min-h-[100dvh] bg-[#0B1220] text-white md:min-h-[calc(100vh-72px)] md:border-t md:border-[var(--tf-line)] md:bg-[rgba(248,250,252,0.65)] md:text-[var(--tf-text)]"
          : "min-h-[calc(100vh-72px)] border-t border-[var(--tf-line)] bg-[rgba(248,250,252,0.65)]"
      }
    >
      <div
        className={
          fullBleedMobile
            ? "tf-scanner-bleed grid w-full gap-0 md:mx-auto md:w-[min(1400px,calc(100%-48px))] md:gap-6 md:py-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8"
            : "tf-container grid gap-6 py-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8"
        }
      >
        <aside
          className={
            fullBleedMobile
              ? "hidden md:block lg:sticky lg:top-[88px] lg:self-start"
              : "lg:sticky lg:top-[88px] lg:self-start"
          }
        >
          <div className="tf-card !p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-text-secondary)]">
              {boxOfficeOnly ? "Vorverkauf" : scannerOnly ? "Einlass" : "Betrieb"}
            </p>
            <p className="mt-1 truncate text-sm text-[var(--tf-text-secondary)]">{email}</p>

            <nav className="mt-5 space-y-0.5" aria-label="Admin-Navigation">
              {navItems.map((item) => {
                const active = isAdminNavActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-[12px] px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-[rgba(20,184,166,0.12)] font-semibold text-[var(--tf-teal-hover)]"
                        : "text-[var(--tf-text)] hover:bg-[var(--tf-overlay)] hover:text-[var(--tf-navy)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {!restricted ? (
              <div className="mt-6 border-t border-[var(--tf-line)] pt-4">
                <Link
                  href="/"
                  className="block rounded-[12px] px-3 py-2 text-sm text-[var(--tf-text-secondary)] hover:bg-[var(--tf-overlay)] hover:text-[var(--tf-navy)]"
                >
                  Zur Website
                </Link>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
