"use client";

import { useEffect, useState } from "react";
import { formatEuroFromCents } from "@/lib/money";
import {
  discountBadgeLabel,
  formatCampaignCountdown,
} from "@/lib/commerce/campaign-price-ui";

export { discountBadgeLabel, formatCampaignCountdown };

type Props = {
  listCents: number;
  unitCents: number;
  /** Campaign name, or accessibility label when that discount is active */
  promoLabel?: string | null;
  /** Campaign end (ISO) — countdown when ≤7 days left */
  validUntil?: string | null;
  feeNote?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Inline row only (no promo under price) — e.g. seat selection summary */
  inline?: boolean;
};

/**
 * Campaign / accessibility discounted price.
 *
 * Sale attention: badge + sale price use `--tf-sale` (warm coral) — punchier than teal
 * for „Achtung Rabatt“, but not VIP gold (`--tf-gold`) and not purple. Primary CTAs stay teal.
 */
export function CampaignPriceDisplay({
  listCents,
  unitCents,
  promoLabel = null,
  validUntil = null,
  feeNote = null,
  size = "md",
  className = "",
  inline = false,
}: Props) {
  const showStrike = listCents > unitCents;
  const badge = showStrike ? discountBadgeLabel(listCents, unitCents) : null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!validUntil || !showStrike) return;
    const end = Date.parse(validUntil);
    if (!Number.isFinite(end)) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [validUntil, showStrike]);

  const countdown =
    showStrike && validUntil && !inline
      ? formatCampaignCountdown(validUntil, nowMs)
      : null;

  const priceSize =
    size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-lg";
  const strikeSize = size === "sm" ? "text-xs" : "text-sm";
  const feeBesidePrice = Boolean(feeNote) && !inline && size !== "sm";

  return (
    <div className={className}>
      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${priceSize}`}>
        {showStrike ? (
          <span
            className={`${strikeSize} font-normal tabular-nums text-[var(--tf-text-secondary)] line-through`}
          >
            {formatEuroFromCents(listCents)}
          </span>
        ) : null}
        {badge ? (
          <span className="tf-badge tf-badge-sale !px-1.5 !py-0.5 text-[10px] font-semibold leading-none">
            {badge}
          </span>
        ) : null}
        <span
          className={`font-bold tabular-nums ${
            showStrike ? "text-[var(--tf-sale)]" : "text-[var(--tf-navy)]"
          }`}
        >
          {formatEuroFromCents(unitCents)}
        </span>
        {feeBesidePrice ? (
          <span className="text-[11px] font-normal text-[var(--tf-text-secondary)]">{feeNote}</span>
        ) : null}
      </div>
      {!inline && promoLabel ? (
        <p className="mt-0.5 text-[11px] font-medium text-[var(--tf-navy)]">{promoLabel}</p>
      ) : null}
      {!inline && countdown ? (
        <p
          className="mt-0.5 text-[11px] font-semibold tabular-nums text-[var(--tf-sale)]"
          aria-live="polite"
        >
          {countdown}
        </p>
      ) : null}
      {!inline && feeNote && size === "sm" ? (
        <p className="text-[10px] text-[var(--tf-text-secondary)]">{feeNote}</p>
      ) : null}
    </div>
  );
}
