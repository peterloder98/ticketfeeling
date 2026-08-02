import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { CookieSettingsButton } from "@/components/cookie-settings-button";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-white/10 bg-[var(--tf-navy)] text-white">
      <div className="tf-container grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-sm space-y-4">
          <div className="inline-flex rounded-2xl bg-white px-3 py-2">
            <BrandLogo variant="full" href="/" className="!w-[132px]" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--tf-teal)]">
            Mehr als ein Ticket.
          </p>
          <p className="text-base leading-relaxed text-white/80">
            Events persönlich, sicher und direkt beim Veranstalter buchen.
          </p>
        </div>

        <div>
          <p className="text-base font-semibold">Entdecken</p>
          <ul className="mt-3 space-y-2 text-base text-white/75">
            <li>
              <Link href="/events" className="hover:text-[var(--tf-teal)]">
                Alle Events
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold">Hilfe</p>
          <ul className="mt-3 space-y-2 text-base text-white/75">
            <li>
              <Link href="/hilfe" className="hover:text-[var(--tf-teal)]">
                Hilfe & FAQ
              </Link>
            </li>
            <li>
              <Link href="/hilfe/ticket-vergessen" className="hover:text-[var(--tf-teal)]">
                Ticket vergessen
              </Link>
            </li>
            <li>
              <Link href="/hilfe#kontakt" className="hover:text-[var(--tf-teal)]">
                Kontakt
              </Link>
            </li>
            <li>
              <Link href="/konto" className="hover:text-[var(--tf-teal)]">
                Bestellung prüfen
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold">Rechtliches</p>
          <ul className="mt-3 space-y-2 text-base text-white/75">
            <li>
              <Link href="/recht/impressum" className="hover:text-[var(--tf-teal)]">
                Impressum
              </Link>
            </li>
            <li>
              <Link href="/recht/datenschutz" className="hover:text-[var(--tf-teal)]">
                Datenschutz
              </Link>
            </li>
            <li>
              <Link href="/recht/agb" className="hover:text-[var(--tf-teal)]">
                AGB
              </Link>
            </li>
            <li>
              <Link href="/recht/veranstaltungsbedingungen" className="hover:text-[var(--tf-teal)]">
                Veranstaltungsbedingungen
              </Link>
            </li>
            <li>
              <Link href="/recht/widerruf" className="hover:text-[var(--tf-teal)]">
                Widerruf
              </Link>
            </li>
            <li>
              <Link href="/recht/rueckerstattung" className="hover:text-[var(--tf-teal)]">
                Rückerstattung
              </Link>
            </li>
            <li>
              <Link href="/recht/cookies" className="hover:text-[var(--tf-teal)]">
                Cookies
              </Link>
            </li>
            <li>
              <CookieSettingsButton className="hover:text-[var(--tf-teal)]" />
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="tf-container flex flex-wrap items-center justify-between gap-2 py-4 text-sm text-white/55">
          <p>© {new Date().getFullYear()} Ticketfeeling</p>
          <p>Direkter Ticketverkauf vom Veranstalter</p>
        </div>
      </div>
    </footer>
  );
}
