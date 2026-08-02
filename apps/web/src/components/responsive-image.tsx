"use client";

import { useEffect, useState } from "react";
import { normalizeCoverImageUrl } from "@/lib/commerce/event-cover";

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

function Fallback({
  fallback,
  initials,
  alt,
  className,
}: {
  fallback: NonNullable<Props["fallback"]>;
  initials?: string;
  alt: string;
  className: string;
}) {
  if (fallback === "person") {
    const letters = (initials || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?";
    return (
      <span
        className={`inline-flex items-center justify-center bg-[rgba(20,184,166,0.12)] text-sm font-semibold text-[var(--tf-teal-hover)] ${className}`}
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        {letters}
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

export function ResponsiveImage({
  src,
  alt = "",
  className = "",
  fit = "cover",
  fallback = "event",
  initials,
  priority = false,
}: Props) {
  const resolved = normalizeCoverImageUrl(src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [resolved]);

  const showImage = Boolean(resolved) && !failed;

  if (!showImage) {
    return (
      <Fallback fallback={fallback} initials={initials} alt={alt} className={className} />
    );
  }

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {/* Keep brand fallback under the img so Safari never flashes a lone "?" */}
      {!loaded ? (
        <Fallback
          fallback={fallback}
          initials={initials}
          alt=""
          className="absolute inset-0 h-full w-full"
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved!}
        alt={alt}
        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}
