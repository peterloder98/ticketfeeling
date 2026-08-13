import {
  formatCampaignPromoCallout,
  type CampaignPromoCalloutParts,
} from "@/lib/commerce/campaign-price-ui";

export type PromotionBadgeVariant = "compact" | "standard" | "checkout";
export type PromotionBadgeType = "promotion" | "status" | "availability";
export type PromotionBadgeStatusTone = "teal" | "neutral" | "vip";

type PromotionFields = {
  campaignName?: string | null;
  saleBadge?: string | null;
  saleDisclaimer?: string | null;
  parts?: CampaignPromoCalloutParts | null;
  /** Checkout confirmation: applied amount, e.g. „−10,00 €“ */
  amountLabel?: string | null;
};

type LabelFields = {
  label: string;
  statusTone?: PromotionBadgeStatusTone;
};

type Props = PromotionFields &
  Partial<LabelFields> & {
    type?: PromotionBadgeType;
    variant?: PromotionBadgeVariant;
    className?: string;
  };

function paddingClass(variant: PromotionBadgeVariant): string {
  if (variant === "checkout") return "";
  if (variant === "compact") return "px-2 py-1";
  return "px-2.5 py-1.5";
}

function nameSize(variant: PromotionBadgeVariant): string {
  return variant === "compact" ? "text-[11px] leading-snug" : "text-xs leading-snug";
}

function savingsSize(variant: PromotionBadgeVariant): string {
  if (variant === "compact") return "text-xs leading-snug";
  return "text-[13px] leading-snug";
}

function conditionSize(variant: PromotionBadgeVariant): string {
  return variant === "compact" ? "text-[11px] leading-snug" : "text-xs leading-snug";
}

function statusSurface(tone: PromotionBadgeStatusTone): string {
  if (tone === "vip") return "tf-promotion-badge--status-vip";
  if (tone === "neutral") return "tf-promotion-badge--status-neutral";
  return "tf-promotion-badge--status";
}

function resolveStatusTone(label: string, tone?: PromotionBadgeStatusTone): PromotionBadgeStatusTone {
  if (tone) return tone;
  if (/^vip\b/i.test(label.trim()) || /\bvip\b/i.test(label)) return "vip";
  return "teal";
}

/**
 * System-wide Aktion / Status / Availability badge.
 * Warm amber = savings; teal/neutral = status; cool navy = real scarcity.
 * Not clickable — do not style like a CTA.
 */
export function PromotionBadge({
  type = "promotion",
  variant = "standard",
  campaignName = null,
  saleBadge = null,
  saleDisclaimer = null,
  parts: partsProp,
  amountLabel = null,
  label,
  statusTone,
  className = "",
}: Props) {
  if (type === "status" || type === "availability") {
    const text = (label ?? "").trim();
    if (!text) return null;
    const tone = type === "status" ? resolveStatusTone(text, statusTone) : undefined;
    const surface =
      type === "availability"
        ? "tf-promotion-badge--availability"
        : statusSurface(tone ?? "teal");
    const pill =
      variant === "compact"
        ? "rounded-full px-2 py-0.5 text-[11px] font-semibold"
        : `${paddingClass(variant)} text-xs font-semibold`;

    return (
      <span
        className={`tf-promotion-badge ${surface} ${pill} ${className}`}
        role="status"
      >
        {text}
      </span>
    );
  }

  // Checkout / cart line: name (+ optional condition) left, amount right
  if (variant === "checkout") {
    const name =
      campaignName?.trim() ||
      partsProp?.name?.trim() ||
      partsProp?.title?.trim() ||
      label?.trim() ||
      "Rabatt";
    const amount = amountLabel?.trim();
    const condition =
      saleDisclaimer?.trim() ||
      partsProp?.condition?.trim() ||
      null;
    return (
      <div
        className={`tf-promotion-badge tf-promotion-badge--checkout text-sm font-medium ${className}`}
        role="status"
      >
        <div className="min-w-0">
          <p className="tf-promotion-badge__name">{name}</p>
          {condition ? (
            <p className="mt-0.5 text-[11px] font-normal text-[var(--tf-text-secondary)]">
              {condition}
            </p>
          ) : null}
        </div>
        {amount ? (
          <span className="tf-promotion-badge__savings shrink-0 tabular-nums">{amount}</span>
        ) : null}
      </div>
    );
  }

  // Cover / chip: short Aktion label only (e.g. EventCard overlay)
  const chipLabel = label?.trim();
  if (
    chipLabel &&
    !campaignName &&
    !saleBadge &&
    !saleDisclaimer &&
    partsProp === undefined
  ) {
    return (
      <span
        className={`tf-promotion-badge tf-promotion-badge--promotion rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--tf-action-accent)] ${className}`}
        role="status"
      >
        {chipLabel}
      </span>
    );
  }

  const parts =
    partsProp !== undefined
      ? partsProp
      : formatCampaignPromoCallout({
          campaignName: campaignName || chipLabel || null,
          saleBadge,
          saleDisclaimer,
        });
  if (!parts) return null;

  const name = parts.name?.trim() || "";
  const savings = parts.savings?.trim() || "";
  const condition = parts.condition?.trim() || "";

  return (
    <div
      className={`tf-promotion-badge tf-promotion-badge--promotion ${paddingClass(variant)} ${className}`}
      role="status"
    >
      {name && (savings || condition || parts.detail) ? (
        <p className={`tf-promotion-badge__name ${nameSize(variant)}`}>{name}</p>
      ) : null}

      {savings ? (
        <p className={`mt-0.5 ${savingsSize(variant)}`}>
          <span className="tf-promotion-badge__savings">{savings}</span>
          {condition ? (
            <>
              {" "}
              <span className={`tf-promotion-badge__condition ${conditionSize(variant)}`}>
                {condition}
              </span>
            </>
          ) : null}
        </p>
      ) : name && !parts.detail ? (
        <p className={`tf-promotion-badge__name ${savingsSize(variant)}`}>{name || parts.title}</p>
      ) : (
        <>
          {!name ? (
            <p className={`tf-promotion-badge__name ${nameSize(variant)} font-semibold`}>
              {parts.title}
            </p>
          ) : null}
          {parts.detail ? (
            <p
              className={`mt-0.5 tf-promotion-badge__condition ${conditionSize(variant)} ${
                variant === "standard" ? "font-semibold text-[var(--tf-action-accent)]" : ""
              }`}
            >
              {parts.detail}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
