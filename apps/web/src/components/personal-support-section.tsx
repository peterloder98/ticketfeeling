import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";

export function PersonalSupportSection() {
  return (
    <section id="wer-steckt-dahinter" className="py-10 md:py-12">
      <div className="tf-container grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="overflow-hidden rounded-[28px] border border-[var(--tf-line)] bg-[var(--tf-navy)]">
          <ResponsiveImage
            src="https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=80"
            alt="Live-Publikum bei einer Veranstaltung"
            className="aspect-[4/3] w-full"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Ticketfeeling
          </p>
          <h2 className="tf-display mt-2 text-2xl md:text-4xl">Persönlich für dich da.</h2>
          <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-[var(--tf-text-secondary)]">
            Ticketfeeling wurde aus der Praxis heraus entwickelt. Wir veranstalten selbst Konzerte und
            wissen, wie wichtig ein einfacher Ticketkauf, klare Informationen und ein erreichbarer
            Ansprechpartner sind. Bei uns landest du nicht in einem anonymen Callcenter, sondern bei
            Menschen, die ihre Veranstaltungen und Besucher kennen.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/hilfe" className="tf-btn tf-btn-primary">
              Mehr über Ticketfeeling
            </Link>
            <Link href="/hilfe#kontakt" className="tf-btn tf-btn-secondary">
              Kontakt aufnehmen
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
