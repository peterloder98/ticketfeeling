"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/responsive-image";

export type HeroSlide = {
  id: string;
  slug: string;
  name: string;
  whenLabel: string | null;
  locationLabel: string | null;
  coverImageUrl: string | null;
};

const INTERVAL_MS = 10_000;

export function HeroEventCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [pauseKey, setPauseKey] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, pauseKey]);

  if (count === 0) {
    return (
      <div className="relative mx-auto aspect-square w-full max-w-[444px] overflow-hidden rounded-[28px] border border-[var(--tf-line)] bg-[var(--tf-navy)] shadow-[0_12px_40px_rgba(15,39,71,0.12)]">
        <ResponsiveImage
          src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=80"
          alt="Live-Veranstaltung"
          className="h-full w-full"
          fallback="event"
        />
      </div>
    );
  }

  const slide = slides[index] ?? slides[0];

  function goTo(next: number) {
    if (count < 1) return;
    setIndex(((next % count) + count) % count);
    setPauseKey((k) => k + 1);
  }

  return (
    <div className="relative mx-auto w-full max-w-[444px]">
      <Link
        href={`/event/${slide.slug}`}
        className="relative block aspect-square w-full overflow-hidden rounded-[28px] border border-[var(--tf-line)] bg-[var(--tf-navy)] shadow-[0_12px_40px_rgba(15,39,71,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]"
        aria-label={`${slide.name} ansehen`}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={i !== index}
          >
            <ResponsiveImage
              src={
                s.coverImageUrl ||
                "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=80"
              }
              alt={`Cover: ${s.name}`}
              className="h-full w-full"
              fallback="event"
            />
          </div>
        ))}
      </Link>

      {count > 1 ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center"
          role="tablist"
          aria-label="Events im Wechsel"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/35 px-2.5 py-1.5 backdrop-blur-sm">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Event ${i + 1}: ${s.name}`}
                onClick={() => goTo(i)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  i === index ? "scale-110 bg-white" : "bg-white/45 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
