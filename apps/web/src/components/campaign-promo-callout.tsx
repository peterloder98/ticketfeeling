import { PromotionBadge } from "@/components/promotion-badge";
import type { CampaignPromoCalloutParts } from "@/lib/commerce/campaign-price-ui";

type Props = {
  campaignName?: string | null;
  saleBadge?: string | null;
  saleDisclaimer?: string | null;
  /** Precomputed parts — skips reformatting when already built */
  parts?: CampaignPromoCalloutParts | null;
  size?: "sm" | "md";
  className?: string;
};

/**
 * @deprecated Prefer `PromotionBadge` directly.
 * Thin wrapper kept for gradual call-site migration.
 */
export function CampaignPromoCallout({
  campaignName = null,
  saleBadge = null,
  saleDisclaimer = null,
  parts,
  size = "md",
  className = "",
}: Props) {
  return (
    <PromotionBadge
      type="promotion"
      variant={size === "sm" ? "compact" : "standard"}
      campaignName={campaignName}
      saleBadge={saleBadge}
      saleDisclaimer={saleDisclaimer}
      parts={parts}
      className={className}
    />
  );
}
