"use client";

import { useState } from "react";

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
  /** cover | contain */
  fit?: "cover" | "contain";
  fallback?: "event" | "person" | "none";
  initials?: string;
  priority?: boolean;
};

export function ResponsiveImage({
  src,
  alt = "",
  className = "",
  fit = "cover",
  fallback = "event",
  initials,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (!showImage) {
    if (fallback === "person") {
      return (
        <span
          className={`inline-flex items-center justify-center bg-[rgba(20,184,166,0.12)] text-sm font-semibold text-[var(--tf-teal-hover)] ${className}`}
          aria-hidden={alt ? undefined : true}
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
        >
          {(initials || "?").slice(0, 2).toUpperCase()}
        </span>
      );
    }
    if (fallback === "none") {
      return <span className={`bg-[var(--tf-overlay)] ${className}`} aria-hidden />;
    }
    return (
      <span
        className={`flex items-center justify-center bg-[linear-gradient(145deg,#0f2747_0%,#143556_55%,#0d9488_140%)] text-center text-xs font-semibold tracking-[0.14em] text-white/80 ${className}`}
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        TICKETFEELING
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt={alt}
      className={`${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  );
}
