"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ResponsiveImage } from "@/components/responsive-image";

export type HeroSlide = {
  id: string;
  slug: string;
  /** Prefer over /event/[slug] when set (e.g. /tour/…) */
  href?: string;
  name: string;
  whenLabel: string | null;
  locationLabel: string | null;
  coverImageUrl: string | null;
};

const INTERVAL_MS = 8_000;
const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80";

export function HeroEventCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [pauseKey, setPauseKey] = useState(0);
  const [ready, setReady] = useState(false);
  const count = slides.length;
  const hasSlides = count > 0;

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, pauseKey]);

  const slide = hasSlides ? (slides[index] ?? slides[0]) : null;
  const meta = slide
    ? [slide.whenLabel, slide.locationLabel].filter(Boolean).join(" · ")
    : null;
  const primaryHref = slide?.href ?? (slide ? `/event/${slide.slug}` : "#aktuell");

  function goTo(next: number) {
    if (count < 1) return;
    setIndex(((next % count) + count) % count);
    setPauseKey((k) => k + 1);
  }

  return (
    <section
      className="relative isolate min-h-[min(92dvh,860px)] overflow-hidden bg-[#0F2747] text-white md:min-h-[min(88dvh,820px)]"
      aria-label="Ticketfeeling"
    >
      {/* Full-bleed event covers — real atmosphere, not abstract wash alone */}
      <div className="absolute inset-0" aria-hidden>
        {hasSlides ? (
          slides.map((s, i) => (
            <div
              key={s.id}
              className={`absolute inset-0 overflow-hidden transition-opacity duration-700 ease-out ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            >
              <ResponsiveImage
                src={s.coverImageUrl}
                alt=""
                className={`absolute inset-0 h-full w-full transition-transform duration-[9000ms] ease-out ${
                  i === index && ready ? "scale-100" : "scale-110"
                }`}
                fit="cover"
                fallback="event"
                priority={i === 0}
              />
            </div>
          ))
        ) : (
          <ResponsiveImage
            src={FALLBACK_COVER}
            alt=""
            className="absolute inset-0 h-full w-full"
            fit="cover"
            fallback="event"
            priority
          />
        )}
      </div>

      {/* Navy readability wash — lighter on the right so cover atmosphere remains */}
      <div
        className="absolute inset-0 bg-[linear-gradient(100deg,rgba(15,39,71,0.9)_0%,rgba(15,39,71,0.68)_42%,rgba(15,39,71,0.35)_100%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,39,71,0.3)_0%,transparent_32%,rgba(15,39,71,0.5)_78%,rgba(15,39,71,0.85)_100%)]"
        aria-hidden
      />

      <div className="tf-container relative z-[1] flex min-h-[min(92dvh,860px)] flex-col justify-end pb-10 pt-8 md:min-h-[min(88dvh,820px)] md:justify-center md:pb-16 md:pt-12">
        <div
          className={`max-w-xl space-y-5 transition-all duration-300 ease-out md:space-y-6 ${
            ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          {/* Light plate so navy lockup stays readable on dark atmosphere */}
          <div className="inline-flex rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.25)] sm:px-4 sm:py-3">
            <BrandLogo
              href={null}
              variant="full"
              priority
              className="!h-14 sm:!h-[4.75rem] md:!h-[5.5rem]"
            />
          </div>

          <h1 className="text-[1.85rem] font-bold leading-[1.08] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[3.35rem]">
            Die Nacht, auf die du wartest.
          </h1>

          <p
            className={`max-w-md text-base leading-relaxed text-white/90 transition-all delay-75 duration-300 ease-out md:text-lg ${
              ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            Tickets direkt beim Veranstalter — klar, sicher, ohne Umwege.
          </p>

          <div
            className={`flex flex-wrap items-center gap-3 pt-1 transition-all delay-150 duration-300 ease-out ${
              ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <a href="#aktuell" className="tf-btn tf-btn-primary !min-h-12 !px-7 text-base">
              Tickets sichern
            </a>
            <Link
              href="/events"
              className="tf-btn !min-h-12 !border-white/60 !bg-white/12 !px-5 text-base !text-white backdrop-blur-sm hover:!bg-white/20"
            >
              Alle Events
            </Link>
          </div>
        </div>

        {/* Featured event cue — conversion path without competing marketing blocks */}
        {slide ? (
          <div
            className={`mt-10 flex max-w-xl flex-col gap-3 border-t border-white/20 pt-5 transition-all delay-200 duration-300 ease-out md:mt-14 md:flex-row md:items-end md:justify-between ${
              ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                Als Nächstes
              </p>
              <Link
                href={primaryHref}
                className="mt-1 block truncate text-base font-semibold text-white transition hover:text-[var(--tf-teal)] md:text-lg"
              >
                {slide.name}
              </Link>
              {meta ? <p className="mt-0.5 truncate text-sm text-white/75">{meta}</p> : null}
            </div>

            {count > 1 ? (
              <div
                className="flex shrink-0 items-center gap-2"
                role="tablist"
                aria-label="Events im Wechsel"
              >
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Event ${i + 1}: ${s.name}`}
                    onClick={() => goTo(i)}
                    className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
                      i === index ? "w-7 bg-[var(--tf-teal)]" : "w-2.5 bg-white/45 hover:bg-white/75"
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
