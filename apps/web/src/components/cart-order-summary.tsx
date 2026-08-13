import type { ReactNode } from "react";
import { formatEuroFromCents } from "@/lib/money";
import { FeeInfoDialog, FeeInfoIconButton } from "@/components/fee-info-dialog";

type Props = {
  ticketsGrossCents: number;
  discountCents?: number;
  discountLabel?: string | null;
  orderCampaignDisclaimer?: string | null;
  feeGrossCents?: number;
  feeLabel?: string | null;
  feeCustomerDescription?: string | null;
  administrationFeePercentageBasisPoints?: number;
  giftCardAppliedCents?: number;
  grossCents: number;
  /** denser layout for embed */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

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
  feeCustomerDescription = null,
  administrationFeePercentageBasisPoints,
  giftCardAppliedCents = 0,
  grossCents,
  compact = false,
  className = "",
  children,
}: Props) {
  const text = compact ? "text-xs" : "text-sm";
  const totalClass = compact
    ? "pt-1 text-base font-semibold text-[var(--tf-navy)]"
    : "text-lg text-[var(--tf-navy)]";

  return (
    <div className={`space-y-1 ${text} ${className}`}>
      <p className="flex justify-between gap-3 text-[var(--tf-text-secondary)]">
        <span>Tickets</span>
        <span className="tabular-nums">{formatEuroFromCents(ticketsGrossCents)}</span>
      </p>
      {discountCents > 0 ? (
        <div className="space-y-0.5">
          <p className="flex justify-between gap-3 font-medium text-[var(--tf-teal-hover)]">
            <span>{discountLabel?.trim() || "Rabatt"}</span>
            <span className="tabular-nums">−{formatEuroFromCents(discountCents)}</span>
          </p>
          {orderCampaignDisclaimer ? (
            <p className="text-[11px] font-normal text-[var(--tf-text-secondary)]">
              {orderCampaignDisclaimer}
            </p>
          ) : null}
        </div>
      ) : null}
      {feeGrossCents > 0 ? (
        <div className="space-y-1">
          <p className="flex justify-between gap-3 text-[var(--tf-text-secondary)]">
            <span className="inline-flex items-center gap-1">
              <span>{feeLabel ?? "Gebühren"}</span>
              {typeof administrationFeePercentageBasisPoints === "number" ? (
                <FeeInfoIconButton
                  feePercentageBasisPoints={administrationFeePercentageBasisPoints}
                  className="-m-0.5 p-0.5"
                />
              ) : null}
            </span>
            <span className="tabular-nums">{formatEuroFromCents(feeGrossCents)}</span>
          </p>
          {typeof administrationFeePercentageBasisPoints === "number" ? (
            <FeeInfoDialog
              feePercentageBasisPoints={administrationFeePercentageBasisPoints}
              description={feeCustomerDescription}
            />
          ) : null}
        </div>
      ) : null}
      {giftCardAppliedCents > 0 ? (
        <p className="flex justify-between gap-3 text-[var(--tf-teal-hover)]">
          <span>Gutschein</span>
          <span className="tabular-nums">−{formatEuroFromCents(giftCardAppliedCents)}</span>
        </p>
      ) : null}
      <p className={`flex justify-between gap-3 ${totalClass}`}>
        <span>Gesamt</span>
        <span className="tabular-nums">
          <strong className="font-semibold">{formatEuroFromCents(grossCents)}</strong>
        </span>
      </p>
      {children}
    </div>
  );
}
