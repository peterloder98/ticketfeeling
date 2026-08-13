"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useCartCountdown } from "@/hooks/use-cart-countdown";

function toneClasses(countdown: {
  expired: boolean;
  critical: boolean;
  urgent: boolean;
}) {
  if (countdown.expired || countdown.critical) {
    return {
      shell: "border-[var(--tf-action-border)] bg-[var(--tf-action-bg)]",
      icon: "text-[var(--tf-action-accent)]",
      timer: "text-[var(--tf-navy)]",
      bar: "bg-[var(--tf-action-accent)]",
      compact: "bg-[var(--tf-action-bg)] text-[var(--tf-navy)]",
      inline: "text-[var(--tf-navy)]",
    };
  }
  if (countdown.urgent) {
    return {
      shell: "border-[rgba(15,39,71,0.14)] bg-[rgba(15,39,71,0.04)]",
      icon: "text-[var(--tf-navy)]",
      timer: "text-[var(--tf-navy)]",
      bar: "bg-[var(--tf-navy)]",
      compact: "bg-[rgba(15,39,71,0.06)] text-[var(--tf-navy)]",
      inline: "text-[var(--tf-navy)]",
    };
  }
  return {
    shell: "border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)]",
    icon: "text-[var(--tf-teal)]",
    timer: "text-[var(--tf-navy)]",
    bar: "bg-[var(--tf-teal)]",
    compact: "bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]",
    inline: "text-[var(--tf-navy)]",
  };
}

function statusCopy(countdown: {
  expired: boolean;
  critical: boolean;
  urgent: boolean;
}) {
  if (countdown.expired) return "Abgelaufen — bitte Tickets erneut wählen.";
  if (countdown.critical) return "Noch kurze Zeit — am besten bald abschließen.";
  if (countdown.urgent) return "Noch etwas Zeit — am besten bald abschließen.";
  return "Deine Tickets sind für den Moment für dich gesichert.";
}

export function CartCountdownDisplay({
  expiresAt,
  variant = "page",
  eventHref,
}: {
  expiresAt: string | Date | null | undefined;
  variant?: "page" | "compact" | "inline";
  /** When reservation expired — link back to event / saalplan */
  eventHref?: string | null;
}) {
  const countdown = useCartCountdown(expiresAt);
  if (!countdown || !expiresAt) return null;

  const tone = toneClasses(countdown);

  if (variant === "inline") {
    return (
      <span className={`tabular-nums font-semibold ${tone.inline}`} aria-live="polite">
        {countdown.expired ? "abgelaufen" : countdown.label}
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone.compact}`}
        aria-live="polite"
      >
        <Clock className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={2} aria-hidden />
        {countdown.expired ? "00:00" : countdown.label}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${tone.shell}`}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className={`h-5 w-5 shrink-0 ${tone.icon}`} strokeWidth={2} aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
              Reservierung
            </p>
            <p className="text-sm text-[var(--tf-navy)]">{statusCopy(countdown)}</p>
            {countdown.expired && eventHref ? (
              <Link
                href={eventHref}
                className="tf-btn tf-btn-primary mt-2 inline-flex !min-h-9 text-sm"
              >
                Plätze neu wählen
              </Link>
            ) : null}
          </div>
        </div>
        <p className={`text-3xl font-bold tabular-nums tracking-tight ${tone.timer}`}>
          {countdown.label}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${tone.bar}`}
          style={{ width: `${Math.max(2, (1 - countdown.elapsedRatio) * 100)}%` }}
        />
      </div>
    </div>
  );
}
