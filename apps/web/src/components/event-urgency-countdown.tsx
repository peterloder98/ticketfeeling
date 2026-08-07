"use client";

import { useEffect, useState } from "react";
import { formatEventStartCountdown } from "@/lib/commerce/campaign-price-ui";

/**
 * Calm teal urgency when the event starts within 7 days.
 * Hidden by parent when a campaign/Aktion countdown already applies.
 */
export function EventUrgencyCountdown({
  eventStartsAt,
  compact = false,
}: {
  eventStartsAt: string | Date;
  compact?: boolean;
}) {
  const iso =
    typeof eventStartsAt === "string" ? eventStartsAt : eventStartsAt.toISOString();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const end = Date.parse(iso);
    if (!Number.isFinite(end)) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [iso]);

  const label = formatEventStartCountdown(iso, nowMs);
  if (!label) return null;

  return (
    <p
      className={
        compact
          ? "text-[11px] font-semibold tabular-nums text-[var(--tf-teal)]"
          : "rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.1)] px-3 py-2 text-sm font-semibold tabular-nums text-[var(--tf-navy)]"
      }
      aria-live="polite"
    >
      {label}
    </p>
  );
}
