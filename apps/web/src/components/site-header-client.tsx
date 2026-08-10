"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BrandLogo } from "@/components/brand-logo";
import { CartNavButton } from "@/components/cart-nav-button";
import { Search, Ticket, HelpCircle, User } from "lucide-react";

const navLinkClass =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-medium text-[var(--tf-navy)] transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)] md:px-3";

type StaffNav = {
  canAdmin: boolean;
  canKasse: boolean;
  boxOfficeOnly: boolean;
};

const STAFF_NAV_CACHE_KEY = "tf_staff_nav_v1";
const STAFF_NAV_TTL_MS = 5 * 60 * 1000;

function readStaffNavCache(): StaffNav | null {
  try {
    const raw = sessionStorage.getItem(STAFF_NAV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffNav & { at?: number };
    if (!parsed.at || Date.now() - parsed.at > STAFF_NAV_TTL_MS) return null;
    return {
      canAdmin: Boolean(parsed.canAdmin),
      canKasse: Boolean(parsed.canKasse),
      boxOfficeOnly: Boolean(parsed.boxOfficeOnly),
    };
  } catch {
    return null;
  }
}

function writeStaffNavCache(nav: StaffNav) {
  try {
    sessionStorage.setItem(STAFF_NAV_CACHE_KEY, JSON.stringify({ ...nav, at: Date.now() }));
  } catch {
    // ignore quota / private mode
  }
}

export function SiteHeaderClient({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const isAdminChrome =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/kasse") ||
    pathname.startsWith("/scanner");

  // Path-only defaults (SSR-safe). sessionStorage / API fill in after mount.
  const [staff, setStaff] = useState<StaffNav>(() => {
    if (!signedIn) return { canAdmin: false, canKasse: false, boxOfficeOnly: false };
    if (pathname.startsWith("/admin")) {
      return { canAdmin: true, canKasse: false, boxOfficeOnly: false };
    }
    if (pathname.startsWith("/kasse") || pathname.startsWith("/scanner")) {
      return { canAdmin: false, canKasse: true, boxOfficeOnly: true };
    }
    return { canAdmin: false, canKasse: false, boxOfficeOnly: false };
  });

  useEffect(() => {
    if (!signedIn) {
      setStaff({ canAdmin: false, canKasse: false, boxOfficeOnly: false });
      try {
        sessionStorage.removeItem(STAFF_NAV_CACHE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    const cached = readStaffNavCache();
    if (cached) {
      setStaff(cached);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/auth/nav", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as StaffNav;
        const next = {
          canAdmin: Boolean(data.canAdmin),
          canKasse: Boolean(data.canKasse),
          boxOfficeOnly: Boolean(data.boxOfficeOnly),
        };
        if (!cancelled) {
          setStaff(next);
          writeStaffNavCache(next);
        }
      } catch {
        // Keep optimistic/public defaults — never block chrome.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const { canAdmin, canKasse, boxOfficeOnly } = staff;
  // Admin logo → public homepage (leave admin). Vorverkaufsstelle stays on Tageskasse.
  const homeHref =
    boxOfficeOnly || (isAdminChrome && canKasse && !canAdmin) ? "/kasse" : "/";

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
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-11 shrink-0 !px-3 text-sm"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(STAFF_NAV_CACHE_KEY);
                  } catch {
                    // ignore
                  }
                  void signOut({ callbackUrl: "/" });
                }}
              >
                Abmelden
              </button>
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
