import {
  formatCampaignPromoCallout,
  type CampaignPromoCalloutParts,
} from "@/lib/commerce/campaign-price-ui";

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
 * One strong Aktion callout (teal tint) — campaign name + benefit in a single block.
 * Prefer this over stacking badge + tiny name + gray disclaimer.
 */
export function CampaignPromoCallout({
  campaignName = null,
  saleBadge = null,
  saleDisclaimer = null,
  parts: partsProp,
  size = "md",
  className = "",
}: Props) {
  const parts =
    partsProp !== undefined
      ? partsProp
      : formatCampaignPromoCallout({ campaignName, saleBadge, saleDisclaimer });
  if (!parts) return null;

  const pad = size === "sm" ? "px-2 py-1" : "px-2.5 py-1.5";
  const titleSize = size === "sm" ? "text-xs" : "text-[13px]";
  const detailSize = size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div
      className={`tf-promo-callout ${pad} ${className}`}
      role="status"
    >
      <p className={`${titleSize} font-semibold leading-snug text-[var(--tf-navy)]`}>
        {parts.title}
      </p>
      {parts.detail ? (
        <p
          className={`mt-0.5 ${detailSize} font-medium leading-snug text-[var(--tf-teal-hover)]`}
        >
          {parts.detail}
        </p>
      ) : null}
    </div>
  );
}
