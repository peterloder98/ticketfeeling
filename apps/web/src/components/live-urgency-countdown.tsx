"use client";

import { useEffect, useState } from "react";
import {
  getCountdownParts,
  resolveUrgencyCountdown,
  type CountdownParts,
  type UrgencyCountdownKind,
} from "@/lib/commerce/campaign-price-ui";

type Size = "md" | "sm";
/**
 * `card` = bordered light panel (tickets column).
 * `heroText` = digits on navy.
 * `compact` = inline listing-card strip (no heavy box).
 */
type Variant = "card" | "heroText" | "compact";

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

  const digitSize =
    variant === "compact"
      ? "text-sm leading-none"
      : variant === "heroText"
        ? size === "sm"
          ? "text-2xl leading-none"
          : "text-3xl leading-none md:text-4xl"
        : size === "sm"
          ? "text-lg leading-none"
          : "text-2xl leading-none md:text-[1.75rem]";

  const labelSize =
    variant === "compact"
      ? "text-[8px]"
      : size === "sm"
        ? "text-[9px]"
        : "text-[10px] md:text-[11px]";

  return (
    <div
      className={`min-w-0 text-center ${
        variant === "compact" ? "w-[2.35rem] shrink-0" : "flex-1"
      }`}
    >
      <p
        className={`font-bold tabular-nums tracking-tight ${digitClass} ${digitSize}`}
      >
        {padded}
      </p>
      <p
        className={`font-medium uppercase tracking-[0.08em] ${labelClass} ${labelSize} ${
          variant === "compact" ? "mt-0.5" : "mt-1"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

function Sep({
  size,
  variant,
  kind,
}: {
  size: Size;
  variant: Variant;
  kind: UrgencyCountdownKind;
}) {
  const sepColor =
    kind === "campaign" ? "text-[var(--tf-action-accent)]" : "text-[var(--tf-teal)]";
  return (
    <span
      aria-hidden
      className={`shrink-0 self-start font-bold ${sepColor} ${
        variant === "compact"
          ? "pt-px text-sm"
          : variant === "heroText"
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
  const titleColor =
    kind === "campaign" ? "text-[var(--tf-action-accent)]" : "text-[var(--tf-teal)]";
  const aria = `${title} ${parts.days} Tage ${parts.hours} Stunden ${parts.minutes} Minuten ${parts.seconds} Sekunden`;

  if (variant === "compact") {
    return (
      <div
        className={className}
        role="timer"
        aria-live="polite"
        aria-label={aria}
      >
        <p className={`mb-1 text-[11px] font-semibold leading-tight ${titleColor}`}>
          {title}
        </p>
        <div className="flex items-start gap-0.5">
          <Unit value={parts.days} label="Tage" size={size} variant={variant} />
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.hours} label="Std" size={size} variant={variant} />
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.minutes} label="Min" size={size} variant={variant} />
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.seconds} label="Sek" size={size} variant={variant} />
        </div>
      </div>
    );
  }

  if (variant === "heroText") {
    return (
      <div
        className={className}
        role="timer"
        aria-live="polite"
        aria-label={aria}
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
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.hours} label="Std" size={size} variant={variant} />
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.minutes} label="Min" size={size} variant={variant} />
          <Sep size={size} variant={variant} kind={kind} />
          <Unit value={parts.seconds} label="Sek" size={size} variant={variant} />
        </div>
      </div>
    );
  }

  const accent =
    kind === "campaign"
      ? "border-[var(--tf-action-border)] bg-[var(--tf-action-bg)]"
      : "border-[rgba(20,184,166,0.4)] bg-white";

  return (
    <div
      className={`rounded-2xl border shadow-[0_8px_24px_rgba(15,39,71,0.08)] ${accent} ${
        size === "sm" ? "px-2.5 py-2" : "px-3.5 py-3"
      } ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={aria}
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
        <Sep size={size} variant={variant} kind={kind} />
        <Unit value={parts.hours} label="Std" size={size} variant={variant} />
        <Sep size={size} variant={variant} kind={kind} />
        <Unit value={parts.minutes} label="Min" size={size} variant={variant} />
        <Sep size={size} variant={variant} kind={kind} />
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
  campaignName,
  size = "md",
  variant = "card",
  className = "",
}: {
  eventStartsAt?: string | Date | null;
  campaignValidUntils?: Array<string | Date | null | undefined>;
  /** Prefer „{name} endet in“ over generic „Aktion endet in“ */
  campaignName?: string | null;
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
  const campaignNameKey = campaignName?.trim() ?? "";

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [eventIso, campaignKey, campaignNameKey]);

  const campaignIsos = campaignKey
    ? campaignKey.split("|").map((s) => (s.length > 0 ? s : null))
    : [];

  const target = resolveUrgencyCountdown({
    eventStartsAt: eventIso,
    campaignValidUntils: campaignIsos,
    campaignName: campaignNameKey || null,
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
