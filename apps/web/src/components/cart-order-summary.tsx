import type { ReactNode } from "react";
import { formatEuroFromCents } from "@/lib/money";
import { FeeInfoIconButton } from "@/components/fee-info-dialog";
import { PromotionBadge } from "@/components/promotion-badge";

type Props = {
  ticketsGrossCents: number;
  discountCents?: number;
  discountLabel?: string | null;
  orderCampaignDisclaimer?: string | null;
  feeGrossCents?: number;
  feeLabel?: string | null;
  /** @deprecated Kept for callers; explanation is icon/modal only. */
  feeCustomerDescription?: string | null;
  administrationFeePercentageBasisPoints?: number;
  giftCardAppliedCents?: number;
  grossCents: number;
  /** denser layout for embed */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

/** Customer summary line: name only — percent lives in the (i) dialog. */
function feeDisplayName(feeLabel?: string | null): string {
  const raw = feeLabel?.trim();
  if (!raw) return "Verwaltungsgebühr";
  return raw.replace(/\s*\d+([.,]\d+)?\s*%/g, "").trim() || "Verwaltungsgebühr";
}

/**
 * Ticket → Rabatt → Gebühr → Gesamt breakdown for cart / checkout summaries.
 */
export function CartOrderSummary({
  ticketsGrossCents,
  discountCents = 0,
  discountLabel = null,
  orderCampaignDisclaimer = null,
  feeGrossCents = 0,
  feeLabel = null,
  administrationFeePercentageBasisPoints,
  giftCardAppliedCents = 0,
  grossCents,
  compact = false,
  className = "",
  children,
}: Props) {
  const text = compact ? "text-xs" : "text-sm";
  const amountClass = "shrink-0 tabular-nums text-[var(--tf-navy)]";
  const rowClass = "flex items-baseline justify-between gap-4";
  const totalClass = compact
    ? "pt-2 text-base font-semibold text-[var(--tf-navy)]"
    : "pt-2 text-lg font-semibold text-[var(--tf-navy)]";

  return (
    <div className={`space-y-2.5 ${text} ${className}`}>
      <p className={`${rowClass} text-[var(--tf-text-secondary)]`}>
        <span>Tickets</span>
        <span className={amountClass}>{formatEuroFromCents(ticketsGrossCents)}</span>
      </p>
      {discountCents > 0 ? (
        <PromotionBadge
          type="promotion"
          variant="checkout"
          campaignName={discountLabel?.trim() || "Rabatt"}
          amountLabel={`−${formatEuroFromCents(discountCents)}`}
          saleDisclaimer={orderCampaignDisclaimer}
        />
      ) : null}
      {feeGrossCents > 0 ? (
        <p className={`${rowClass} text-[var(--tf-text-secondary)]`}>
          <span className="inline-flex min-w-0 items-center gap-1">
            <span>{feeDisplayName(feeLabel)}</span>
            {typeof administrationFeePercentageBasisPoints === "number" ? (
              <FeeInfoIconButton
                feePercentageBasisPoints={administrationFeePercentageBasisPoints}
                className="-m-0.5 p-0.5"
              />
            ) : null}
          </span>
          <span className={amountClass}>{formatEuroFromCents(feeGrossCents)}</span>
        </p>
      ) : null}
      {giftCardAppliedCents > 0 ? (
        <p className={`${rowClass} text-[var(--tf-teal-hover)]`}>
          <span>Gutschein</span>
          <span className="shrink-0 tabular-nums">−{formatEuroFromCents(giftCardAppliedCents)}</span>
        </p>
      ) : null}
      <p className={`${rowClass} border-t border-[var(--tf-line)] ${totalClass}`}>
        <span>Gesamt</span>
        <span className="shrink-0 tabular-nums">{formatEuroFromCents(grossCents)}</span>
      </p>
      {children}
    </div>
  );
}
