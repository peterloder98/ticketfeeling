"use client";

import { formatEuroFromCents } from "@/lib/money";
import {
  discountBadgeLabel,
  formatCampaignCountdown,
} from "@/lib/commerce/campaign-price-ui";
import { FeeSurchargeNote } from "@/components/fee-info-dialog";

export { discountBadgeLabel, formatCampaignCountdown };

type Props = {
  listCents: number;
  unitCents: number;
  /** Campaign name, or accessibility label when that discount is active */
  promoLabel?: string | null;
  /** @deprecated Countdown lives in EventPageUrgencyCountdown — kept for call-site compat */
  validUntil?: string | null;
  feeNote?: string | null;
  feePercentageBasisPoints?: number;
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
 * Live Aktion/Event countdown is rendered once via EventPageUrgencyCountdown.
 */
export function CampaignPriceDisplay({
  listCents,
  unitCents,
  promoLabel = null,
  feeNote = null,
  feePercentageBasisPoints,
  size = "md",
  className = "",
  inline = false,
}: Props) {
  const showStrike = listCents > unitCents;
  const badge = showStrike ? discountBadgeLabel(listCents, unitCents) : null;

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
        {feeBesidePrice && feeNote ? (
          <FeeSurchargeNote
            note={feeNote}
            feePercentageBasisPoints={feePercentageBasisPoints}
            textClassName="text-[11px] font-normal text-[var(--tf-text-secondary)]"
          />
        ) : null}
      </div>
      {!inline && promoLabel ? (
        <p className="mt-0.5 text-[11px] font-medium text-[var(--tf-navy)]">{promoLabel}</p>
      ) : null}
      {!inline && feeNote && size === "sm" ? (
        <FeeSurchargeNote
          as="p"
          note={feeNote}
          feePercentageBasisPoints={feePercentageBasisPoints}
          className="mt-0.5"
          textClassName="text-[10px] text-[var(--tf-text-secondary)]"
        />
      ) : null}
    </div>
  );
}
