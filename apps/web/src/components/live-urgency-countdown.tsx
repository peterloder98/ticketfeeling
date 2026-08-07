"use client";

import { useEffect, useState } from "react";
import {
  getCountdownParts,
  resolveUrgencyCountdown,
  type CountdownParts,
  type UrgencyCountdownKind,
} from "@/lib/commerce/campaign-price-ui";

type Size = "md" | "sm";

function Unit({
  value,
  label,
  size,
}: {
  value: number;
  label: string;
  size: Size;
}) {
  const padded = String(Math.max(0, value)).padStart(2, "0");
  return (
    <div className="min-w-0 flex-1 text-center">
      <p
        className={`font-bold tabular-nums tracking-tight text-[var(--tf-navy)] ${
          size === "sm" ? "text-lg leading-none" : "text-2xl leading-none md:text-[1.75rem]"
        }`}
      >
        {padded}
      </p>
      <p
        className={`mt-1 font-medium uppercase tracking-[0.08em] text-[var(--tf-navy)]/70 ${
          size === "sm" ? "text-[9px]" : "text-[10px] md:text-[11px]"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

function Sep({ size }: { size: Size }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 self-start font-bold text-[var(--tf-teal)] ${
        size === "sm" ? "pt-0.5 text-base" : "pt-1 text-xl md:text-2xl"
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
  className,
}: {
  parts: CountdownParts;
  title: string;
  kind: UrgencyCountdownKind;
  size: Size;
  className: string;
}) {
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
        <Unit value={parts.days} label="Tage" size={size} />
        <Sep size={size} />
        <Unit value={parts.hours} label="Std" size={size} />
        <Sep size={size} />
        <Unit value={parts.minutes} label="Min" size={size} />
        <Sep size={size} />
        <Unit value={parts.seconds} label="Sek" size={size} />
      </div>
    </div>
  );
}

/**
 * Live countdown (Tage · Std · Min · Sek) for a known deadline.
 * High-contrast light surface + navy digits — readable on navy heroes and white panels.
 */
export function LiveUrgencyCountdown({
  endsAt,
  title,
  kind = "event",
  size = "md",
  className = "",
}: {
  endsAt: string;
  title: string;
  kind?: UrgencyCountdownKind;
  size?: Size;
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
  className = "",
}: {
  eventStartsAt?: string | Date | null;
  campaignValidUntils?: Array<string | Date | null | undefined>;
  size?: Size;
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
