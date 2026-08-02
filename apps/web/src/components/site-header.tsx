import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { CartNavButton } from "@/components/cart-nav-button";
import { Search, Ticket, HelpCircle, User } from "lucide-react";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

export async function SiteHeader() {
  const session = await getServerSession(authOptions);
  let canAdmin = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      canAdmin = await userHasPermission(
        session.user.id,
        membership.organizationId,
        "events:read",
      );
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.94)] backdrop-blur-xl">
      <div className="tf-container flex h-[76px] items-center justify-between gap-3 md:gap-4">
        <BrandLogo variant="app" priority />

        <form action="/events" className="relative hidden min-w-0 flex-1 max-w-lg lg:block">
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

        <nav className="flex flex-wrap items-center gap-0.5 text-base text-[var(--tf-text-secondary)] md:gap-1">
          <Link
            href="/events"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-2 transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)]"
          >
            <Ticket className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            <span className="hidden font-medium sm:inline">Events</span>
          </Link>
          <CartNavButton />
          <Link
            href="/hilfe"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-2 transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)]"
          >
            <HelpCircle className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            <span className="hidden md:inline">Hilfe</span>
          </Link>
          <Link
            href="/hilfe/ticket-vergessen"
            className="hidden min-h-11 items-center rounded-[14px] px-3 py-2 transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)] lg:inline-flex"
          >
            Ticket vergessen
          </Link>
          {session?.user ? (
            <>
              <Link
                href="/konto"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-2 transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)]"
              >
                <User className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
                <span className="hidden md:inline">Konto</span>
              </Link>
              {canAdmin ? (
                <Link
                  href="/admin"
                  className="hidden min-h-11 items-center rounded-[14px] px-3 py-2 transition hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)] md:inline-flex"
                >
                  Admin
                </Link>
              ) : null}
              <Link href="/api/auth/signout" className="tf-btn tf-btn-secondary !min-h-11 !px-3 text-sm">
                Abmelden
              </Link>
            </>
          ) : (
            <Link href="/login" className="tf-btn tf-btn-primary !min-h-11 !px-4 text-sm">
              Anmelden
            </Link>
          )}
        </nav>
      </div>
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
    </header>
  );
}
