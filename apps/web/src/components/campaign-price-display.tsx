"use client";

import { formatEuroFromCents } from "@/lib/money";
import {
  discountBadgeLabel,
  formatCampaignCountdown,
  formatCampaignPromoCallout,
} from "@/lib/commerce/campaign-price-ui";
import { CampaignPromoCallout } from "@/components/campaign-promo-callout";
import { FeeSurchargeNote } from "@/components/fee-info-dialog";

export { discountBadgeLabel, formatCampaignCountdown };

type Props = {
  listCents: number;
  unitCents: number;
  /** Campaign name, or accessibility label when that discount is active */
  promoLabel?: string | null;
  /** Explicit badge override e.g. „10 € sparen“ (order-threshold promos) */
  saleBadge?: string | null;
  /** Fair disclaimer e.g. „* beim Kauf von 2 Tickets“ */
  saleDisclaimer?: string | null;
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
 * Unit Aktionspreis: strike + coral sale price.
 * Order/unit promo messaging: one teal callout (name + benefit), not three weak lines.
 * Live Aktion/Event countdown is rendered once via EventPageUrgencyCountdown.
 */
export function CampaignPriceDisplay({
  listCents,
  unitCents,
  promoLabel = null,
  saleBadge = null,
  saleDisclaimer = null,
  feeNote = null,
  feePercentageBasisPoints,
  size = "md",
  className = "",
  inline = false,
}: Props) {
  const showStrike = listCents > unitCents;
  const derivedBadge =
    saleBadge?.trim() || (showStrike ? discountBadgeLabel(listCents, unitCents) : null);
  const callout = inline
    ? null
    : formatCampaignPromoCallout({
        campaignName: promoLabel,
        saleBadge: derivedBadge,
        saleDisclaimer,
      });

  const priceSize =
    size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-lg";
  const strikeSize = size === "sm" ? "text-xs" : "text-sm";
  const feeBesidePrice = Boolean(feeNote) && !inline && size !== "sm";
  const calloutSize = size === "sm" ? "sm" : "md";

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
      {callout ? (
        <CampaignPromoCallout
          parts={callout}
          size={calloutSize}
          className="mt-1.5"
        />
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
