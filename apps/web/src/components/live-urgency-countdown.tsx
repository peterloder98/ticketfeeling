"use client";

import { useEffect, useState } from "react";
import {
  getCountdownParts,
  resolveUrgencyCountdown,
  type CountdownParts,
  type UrgencyCountdownKind,
} from "@/lib/commerce/campaign-price-ui";

type Size = "md" | "sm";
/** `card` = bordered light panel (tickets column). `heroText` = digits on navy. */
type Variant = "card" | "heroText";

function Unit({
  value,
  label,
  size,
  variant,
}: {
  value: number;
  label: string;
  size: Size;
  variant: Variant;
}) {
  const padded = String(Math.max(0, value)).padStart(2, "0");
  const digitClass =
    variant === "heroText"
      ? "text-white"
      : "text-[var(--tf-navy)]";
  const labelClass =
    variant === "heroText"
      ? "text-white/65"
      : "text-[var(--tf-navy)]/70";

  return (
    <div className="min-w-0 flex-1 text-center">
      <p
        className={`font-bold tabular-nums tracking-tight ${digitClass} ${
          variant === "heroText"
            ? size === "sm"
              ? "text-2xl leading-none"
              : "text-3xl leading-none md:text-4xl"
            : size === "sm"
              ? "text-lg leading-none"
              : "text-2xl leading-none md:text-[1.75rem]"
        }`}
      >
        {padded}
      </p>
      <p
        className={`mt-1 font-medium uppercase tracking-[0.08em] ${labelClass} ${
          size === "sm" ? "text-[9px]" : "text-[10px] md:text-[11px]"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

function Sep({ size, variant }: { size: Size; variant: Variant }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 self-start font-bold text-[var(--tf-teal)] ${
        variant === "heroText"
          ? size === "sm"
            ? "pt-0.5 text-xl"
            : "pt-1 text-2xl md:text-3xl"
          : size === "sm"
            ? "pt-0.5 text-base"
            : "pt-1 text-xl md:text-2xl"
      }`}
    >
      :
    </span>
  );
}

function CountdownFace({
  parts,
  title,
  kind,
  size,
  variant,
  className,
}: {
  parts: CountdownParts;
  title: string;
  kind: UrgencyCountdownKind;
  size: Size;
  variant: Variant;
  className: string;
}) {
  if (variant === "heroText") {
    const titleColor =
      kind === "campaign" ? "text-[var(--tf-sale)]" : "text-[var(--tf-teal)]";

    return (
      <div
        className={className}
        role="timer"
        aria-live="polite"
        aria-label={`${title} ${parts.days} Tage ${parts.hours} Stunden ${parts.minutes} Minuten ${parts.seconds} Sekunden`}
      >
        <p
          className={`font-semibold ${titleColor} ${
            size === "sm" ? "mb-1.5 text-[11px]" : "mb-2 text-sm md:text-base"
          }`}
        >
          {title}
        </p>
        <div className="flex max-w-md items-start gap-1.5 sm:gap-2">
          <Unit value={parts.days} label="Tage" size={size} variant={variant} />
          <Sep size={size} variant={variant} />
          <Unit value={parts.hours} label="Std" size={size} variant={variant} />
          <Sep size={size} variant={variant} />
          <Unit value={parts.minutes} label="Min" size={size} variant={variant} />
          <Sep size={size} variant={variant} />
          <Unit value={parts.seconds} label="Sek" size={size} variant={variant} />
        </div>
      </div>
    );
  }

  const accent =
    kind === "campaign"
      ? "border-[rgba(228,90,74,0.35)] bg-[rgba(228,90,74,0.08)]"
      : "border-[rgba(20,184,166,0.4)] bg-white";

  const titleColor =
    kind === "campaign" ? "text-[var(--tf-sale)]" : "text-[var(--tf-teal)]";

  return (
    <div
      className={`rounded-2xl border shadow-[0_8px_24px_rgba(15,39,71,0.08)] ${accent} ${
        size === "sm" ? "px-2.5 py-2" : "px-3.5 py-3"
      } ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={`${title} ${parts.days} Tage ${parts.hours} Stunden ${parts.minutes} Minuten ${parts.seconds} Sekunden`}
    >
      <p
        className={`font-semibold ${titleColor} ${
          size === "sm" ? "mb-1.5 text-[11px]" : "mb-2 text-xs md:text-sm"
        }`}
      >
        {title}
      </p>
      <div className="flex items-start justify-between gap-1">
        <Unit value={parts.days} label="Tage" size={size} variant={variant} />
        <Sep size={size} variant={variant} />
        <Unit value={parts.hours} label="Std" size={size} variant={variant} />
        <Sep size={size} variant={variant} />
        <Unit value={parts.minutes} label="Min" size={size} variant={variant} />
        <Sep size={size} variant={variant} />
        <Unit value={parts.seconds} label="Sek" size={size} variant={variant} />
      </div>
    </div>
  );
}

/**
 * Live countdown (Tage · Std · Min · Sek) for a known deadline.
 * `card` = high-contrast light panel; `heroText` = digits on navy heroes.
 */
export function LiveUrgencyCountdown({
  endsAt,
  title,
  kind = "event",
  size = "md",
  variant = "card",
  className = "",
}: {
  endsAt: string;
  title: string;
  kind?: UrgencyCountdownKind;
  size?: Size;
  variant?: Variant;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const end = Date.parse(endsAt);
    if (!Number.isFinite(end)) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const parts = getCountdownParts(endsAt, nowMs);
  if (!parts) return null;

  return (
    <CountdownFace
      parts={parts}
      title={title}
      kind={kind}
      size={size}
      variant={variant}
      className={className}
    />
  );
}

/**
 * Resolves Aktion vs Event priority and ticks every second
 * (switches from Aktion → Event when the campaign window ends).
 */
export function EventPageUrgencyCountdown({
  eventStartsAt,
  campaignValidUntils,
  size = "md",
  variant = "card",
  className = "",
}: {
  eventStartsAt?: string | Date | null;
  campaignValidUntils?: Array<string | Date | null | undefined>;
  size?: Size;
  variant?: Variant;
  className?: string;
}) {
  const eventIso =
    typeof eventStartsAt === "string"
      ? eventStartsAt
      : eventStartsAt
        ? eventStartsAt.toISOString()
        : null;
  const campaignKey = (campaignValidUntils ?? [])
    .map((u) => (typeof u === "string" ? u : u ? u.toISOString() : ""))
    .join("|");

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [eventIso, campaignKey]);

  const campaignIsos = campaignKey
    ? campaignKey.split("|").map((s) => (s.length > 0 ? s : null))
    : [];

  const target = resolveUrgencyCountdown({
    eventStartsAt: eventIso,
    campaignValidUntils: campaignIsos,
    nowMs,
  });
  if (!target) return null;

  const parts = getCountdownParts(target.endsAt, nowMs);
  if (!parts) return null;

  return (
    <CountdownFace
      parts={parts}
      title={target.title}
      kind={target.kind}
      size={size}
      variant={variant}
      className={className}
    />
  );
}

/** @deprecated Use EventPageUrgencyCountdown / LiveUrgencyCountdown */
export function EventUrgencyCountdown({
  eventStartsAt,
  compact = false,
}: {
  eventStartsAt: string | Date;
  compact?: boolean;
}) {
  const iso =
    typeof eventStartsAt === "string" ? eventStartsAt : eventStartsAt.toISOString();
  return (
    <EventPageUrgencyCountdown
      eventStartsAt={iso}
      campaignValidUntils={[]}
      size={compact ? "sm" : "md"}
    />
  );
}
