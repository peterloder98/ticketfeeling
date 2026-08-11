"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const atmosphereSrc = slide?.coverImageUrl ?? FALLBACK_COVER;

  function goTo(next: number) {
    if (count < 1) return;
    setIndex(((next % count) + count) % count);
    setPauseKey((k) => k + 1);
  }

  const poster = (
    <Link
      href={primaryHref}
      className="group relative block w-[min(92vw,28rem)] shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tf-teal)] sm:w-[min(82vw,30rem)] md:w-full md:max-w-[min(100%,28rem)] lg:max-w-[30rem] xl:max-w-[32rem]"
      aria-label={slide ? `Zum Event: ${slide.name}` : "Zu den Events"}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#0a1a30] shadow-[0_24px_64px_rgba(0,0,0,0.45)] ring-1 ring-white/15 transition duration-300 ease-out group-hover:ring-white/30">
        {hasSlides ? (
          slides.map((s, i) => (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            >
              <ResponsiveImage
                src={s.coverImageUrl}
                alt=""
                className="h-full w-full"
                fit="contain"
                fallback="event"
                priority={i === 0}
              />
            </div>
          ))
        ) : (
          <ResponsiveImage
            src={atmosphereSrc}
            alt=""
            className="h-full w-full"
            fit="contain"
            fallback="event"
            priority
          />
        )}
      </div>
    </Link>
  );

  return (
    <section
      className="relative isolate min-h-[min(100dvh,960px)] overflow-hidden bg-[#0F2747] text-white md:min-h-[min(88dvh,840px)]"
      aria-label="Ticketfeeling"
    >
      {/* Soft blurred covers — atmosphere only; never the sharp hero face */}
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
                className={`absolute left-1/2 top-1/2 h-[120%] w-[120%] max-w-none -translate-x-1/2 -translate-y-1/2 blur-2xl brightness-[0.85] saturate-[1.05] transition-transform duration-[9000ms] ease-out ${
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
            className="absolute left-1/2 top-1/2 h-[120%] w-[120%] max-w-none -translate-x-1/2 -translate-y-1/2 scale-110 blur-2xl brightness-[0.85]"
            fit="cover"
            fallback="event"
            priority
          />
        )}
      </div>

      {/* Navy wash — keeps copy readable over any cover */}
      <div
        className="absolute inset-0 bg-[linear-gradient(105deg,rgba(15,39,71,0.94)_0%,rgba(15,39,71,0.78)_46%,rgba(15,39,71,0.55)_100%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,39,71,0.35)_0%,transparent_28%,rgba(15,39,71,0.45)_72%,rgba(15,39,71,0.88)_100%)]"
        aria-hidden
      />

      <div className="tf-container relative z-[1] flex min-h-[min(100dvh,960px)] flex-col justify-center gap-8 py-10 md:min-h-[min(88dvh,840px)] md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-center md:gap-10 md:py-14 lg:gap-16">
        {/* Headline + CTAs — brand lives in the site header */}
        <div
          className={`order-1 max-w-xl space-y-4 transition-all duration-300 ease-out md:col-start-1 md:row-start-1 md:space-y-5 ${
            ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
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

          {/* Desktop CTAs sit with copy; mobile CTAs move below poster */}
          <div
            className={`hidden flex-wrap items-center gap-3 pt-1 transition-all delay-150 duration-300 ease-out md:flex ${
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

          {slide ? (
            <div
              className={`hidden flex-col gap-3 border-t border-white/20 pt-5 transition-all delay-200 duration-300 ease-out md:flex md:flex-row md:items-end md:justify-between ${
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

        {/* Sharp cinema poster — natural ratio, no aggressive face crop */}
        <div
          className={`order-2 flex items-center justify-center transition-all delay-100 duration-300 ease-out md:col-start-2 md:row-start-1 md:justify-end ${
            ready ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          {poster}
        </div>

        {/* Mobile CTAs + featured cue under the large poster */}
        <div
          className={`order-3 space-y-5 transition-all delay-150 duration-300 ease-out md:hidden ${
            ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
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

          {slide ? (
            <div className="flex flex-col gap-3 border-t border-white/20 pt-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                  Als Nächstes
                </p>
                <Link
                  href={primaryHref}
                  className="mt-1 block truncate text-base font-semibold text-white transition hover:text-[var(--tf-teal)]"
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
      </div>
    </section>
  );
}
