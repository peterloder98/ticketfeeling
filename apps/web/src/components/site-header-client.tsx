"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { CartNavButton } from "@/components/cart-nav-button";
import { Search, Ticket, HelpCircle, User } from "lucide-react";

const navLinkClass =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-medium text-[var(--tf-navy)] transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)] md:px-3";

export function SiteHeaderClient({
  signedIn,
  canAdmin,
  canKasse = false,
  boxOfficeOnly = false,
}: {
  signedIn: boolean;
  canAdmin: boolean;
  canKasse?: boolean;
  boxOfficeOnly?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const isAdminChrome =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/kasse") ||
    pathname.startsWith("/scanner");
  const homeHref = boxOfficeOnly || (isAdminChrome && canKasse && !canAdmin) ? "/kasse" : isAdminChrome ? "/admin" : "/";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.96)] backdrop-blur-xl">
      <div className="tf-container flex min-h-[76px] items-center justify-between gap-3 py-2 md:gap-4">
        <div className="shrink-0">
          <BrandLogo variant="app" href={homeHref} priority />
        </div>

        {!isAdminChrome ? (
          <form action="/events" className="relative hidden min-w-0 flex-1 max-w-md xl:max-w-lg lg:block">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              name="q"
              type="search"
              placeholder="Künstler, Events oder Orte suchen"
              className="tf-input tf-input-search !min-h-11 text-base"
              aria-label="Suche"
            />
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--tf-navy)]">
              {boxOfficeOnly ? "Tageskasse" : "Admin"}
            </p>
            <p className="truncate text-xs text-[var(--tf-text-secondary)]">
              {boxOfficeOnly ? "Vorverkaufsstelle" : "Betrieb & Verkauf"}
            </p>
          </div>
        )}

        <nav
          className="flex shrink-0 flex-nowrap items-center gap-0.5 text-[var(--tf-navy)] md:gap-1"
          aria-label="Hauptnavigation"
        >
          {!isAdminChrome ? (
            <>
              <Link href="/events" className={navLinkClass}>
                <Ticket className="h-4 w-4 shrink-0 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Events</span>
              </Link>
              <CartNavButton />
              <Link href="/hilfe" className={navLinkClass}>
                <HelpCircle
                  className="h-4 w-4 shrink-0 text-[var(--tf-teal)]"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="hidden md:inline">Hilfe</span>
              </Link>
              <Link
                href="/hilfe/ticket-vergessen"
                className={`${navLinkClass} hidden xl:inline-flex`}
              >
                Ticket vergessen
              </Link>
            </>
          ) : null}

          {signedIn ? (
            <>
              {!isAdminChrome ? (
                <Link href="/konto" className={navLinkClass}>
                  <User
                    className="h-4 w-4 shrink-0 text-[var(--tf-teal)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="hidden md:inline">Konto</span>
                </Link>
              ) : null}
              {canAdmin ? (
                <Link
                  href="/admin"
                  className={`${navLinkClass} ${
                    isAdminChrome
                      ? "bg-[rgba(20,184,166,0.14)] text-[var(--tf-teal-hover)]"
                      : "hidden md:inline-flex"
                  }`}
                >
                  {isAdminChrome ? "Übersicht" : "Admin"}
                </Link>
              ) : null}
              {canKasse && !canAdmin ? (
                <Link
                  href="/kasse"
                  className={`${navLinkClass} ${
                    isAdminChrome
                      ? "bg-[rgba(20,184,166,0.14)] text-[var(--tf-teal-hover)]"
                      : ""
                  }`}
                >
                  Tageskasse
                </Link>
              ) : null}
              <Link
                href="/api/auth/signout"
                className="tf-btn tf-btn-secondary !min-h-11 shrink-0 !px-3 text-sm"
              >
                Abmelden
              </Link>
            </>
          ) : (
            <Link href="/login" className="tf-btn tf-btn-primary !min-h-11 shrink-0 !px-4 text-sm">
              Anmelden
            </Link>
          )}
        </nav>
      </div>

      {!isAdminChrome ? (
        <form action="/events" className="tf-container pb-3 lg:hidden">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              name="q"
              type="search"
              placeholder="Künstler, Events oder Orte suchen"
              className="tf-input tf-input-search !min-h-11 text-base"
              aria-label="Suche"
            />
          </div>
        </form>
      ) : null}
    </header>
  );
}
