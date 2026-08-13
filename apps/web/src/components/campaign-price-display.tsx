"use client";

import { formatEuroFromCents } from "@/lib/money";
import {
  discountBadgeLabel,
  formatCampaignCountdown,
  formatCampaignPromoCallout,
} from "@/lib/commerce/campaign-price-ui";
import { PromotionBadge } from "@/components/promotion-badge";
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
 * Unit Aktionspreis: strike + action-accent sale price.
 * Order/unit promo messaging: one PromotionBadge (name + savings hierarchy).
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
  const badgeVariant = size === "sm" ? "compact" : "standard";

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
            showStrike ? "text-[var(--tf-action-accent)]" : "text-[var(--tf-navy)]"
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
        <PromotionBadge
          type="promotion"
          variant={badgeVariant}
          parts={callout}
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
