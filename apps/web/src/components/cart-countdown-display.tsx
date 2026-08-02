"use client";

import { Clock } from "lucide-react";
import { useCartCountdown } from "@/hooks/use-cart-countdown";

export function CartCountdownDisplay({
  expiresAt,
  variant = "page",
}: {
  expiresAt: string | Date | null | undefined;
  variant?: "page" | "compact" | "inline";
}) {
  const countdown = useCartCountdown(expiresAt);
  if (!countdown || !expiresAt) return null;

  if (variant === "inline") {
    return (
      <span
        className={`tabular-nums font-semibold ${
          countdown.critical
            ? "text-[#b91c1c]"
            : countdown.urgent
              ? "text-[#c2410c]"
              : "text-[var(--tf-navy)]"
        }`}
        aria-live="polite"
      >
        {countdown.expired ? "abgelaufen" : countdown.label}
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
          countdown.critical
            ? "bg-[#fef2f2] text-[#b91c1c]"
            : countdown.urgent
              ? "bg-[#fff7ed] text-[#c2410c]"
              : "bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
        }`}
        aria-live="polite"
      >
        <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {countdown.expired ? "00:00" : countdown.label}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        countdown.critical
          ? "border-[#fecaca] bg-[#fef2f2]"
          : countdown.urgent
            ? "border-[#fed7aa] bg-[#fff7ed]"
            : "border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)]"
      }`}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock
            className={`h-5 w-5 ${
              countdown.critical
                ? "text-[#b91c1c]"
                : countdown.urgent
                  ? "text-[#c2410c]"
                  : "text-[var(--tf-teal)]"
            }`}
            strokeWidth={2}
            aria-hidden
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
              Reservierung
            </p>
            <p className="text-sm text-[var(--tf-navy)]">
              {countdown.expired
                ? "Abgelaufen — bitte Tickets erneut in den Warenkorb legen."
                : countdown.critical
                  ? "Gleich vorbei — jetzt zur Kasse!"
                  : countdown.urgent
                    ? "Noch etwas Zeit — am besten bald abschließen."
                    : "Deine Tickets sind für den Moment für dich gesichert… warte nicht zu lange!"}
            </p>
          </div>
        </div>
        <p
          className={`text-3xl font-bold tabular-nums tracking-tight ${
            countdown.critical
              ? "text-[#b91c1c]"
              : countdown.urgent
                ? "text-[#c2410c]"
                : "text-[var(--tf-navy)]"
          }`}
        >
          {countdown.label}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            countdown.critical
              ? "bg-[#ef4444]"
              : countdown.urgent
                ? "bg-[#f97316]"
                : "bg-[var(--tf-teal)]"
          }`}
          style={{ width: `${Math.max(2, (1 - countdown.elapsedRatio) * 100)}%` }}
        />
      </div>
    </div>
  );
}
