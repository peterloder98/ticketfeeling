import Link from "next/link";
import { HeartHandshake, Route, PhoneCall, ShieldCheck } from "lucide-react";

const ITEMS = [
  {
    icon: HeartHandshake,
    title: "Persönlich",
    text: "Hinter Ticketfeeling stehen echte Veranstalter, die ihre Events mit Herz und Erfahrung organisieren.",
  },
  {
    icon: Route,
    title: "Direkt",
    text: "Du buchst deine Tickets ohne unnötige Umwege direkt über unsere Plattform.",
  },
  {
    icon: PhoneCall,
    title: "Erreichbar",
    text: "Bei Fragen hilft dir unser Team persönlich, verständlich und unkompliziert weiter.",
  },
  {
    icon: ShieldCheck,
    title: "Sicher",
    text: "Deine Bestellung und Zahlung werden zuverlässig und verschlüsselt verarbeitet.",
  },
];

export function WhyTicketfeeling() {
  return (
    <section id="warum-ticketfeeling" className="border-y border-[var(--tf-line)] bg-white py-10 md:py-12">
      <div className="tf-container">
        <div className="max-w-3xl">
          <h2 className="tf-display text-2xl md:text-4xl">Warum Ticketfeeling?</h2>
          <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-[var(--tf-text-secondary)]">
            Bei uns buchst du nicht über einen anonymen Ticketkonzern, sondern direkt und persönlich
            beim Veranstalter.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius-lg,24px)] border border-[var(--tf-line)] bg-[var(--tf-bg)] p-5"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(20,184,166,0.12)] text-[var(--tf-teal)]">
                <item.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[var(--tf-navy)]">{item.title}</h3>
              <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-[var(--tf-text-secondary)]">
                {item.text}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="#wer-steckt-dahinter" className="tf-link text-base">
            Wer steckt dahinter? →
          </Link>
        </div>
      </div>
    </section>
  );
}
