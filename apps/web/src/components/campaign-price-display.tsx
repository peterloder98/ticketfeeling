import { formatEuroFromCents } from "@/lib/money";

export function discountBadgeLabel(listCents: number, unitCents: number): string | null {
  if (unitCents >= listCents || listCents <= 0) return null;
  const pct = Math.round(((listCents - unitCents) / listCents) * 100);
  if (pct >= 1) return `−${pct}%`;
  return "Aktion";
}

type Props = {
  listCents: number;
  unitCents: number;
  /** Campaign name, or accessibility label when that discount is active */
  promoLabel?: string | null;
  feeNote?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Inline row only (no promo under price) — e.g. seat selection summary */
  inline?: boolean;
};

/**
 * Campaign / accessibility discounted price: strikethrough list, teal badge, bold sale price, promo name.
 */
export function CampaignPriceDisplay({
  listCents,
  unitCents,
  promoLabel = null,
  feeNote = null,
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
          <span className="tf-badge tf-badge-teal !px-1.5 !py-0.5 text-[10px] font-semibold leading-none">
            {badge}
          </span>
        ) : null}
        <span
          className={`font-bold tabular-nums ${
            showStrike ? "text-[var(--tf-teal)]" : "text-[var(--tf-navy)]"
          }`}
        >
          {formatEuroFromCents(unitCents)}
        </span>
        {feeBesidePrice ? (
          <span className="text-[11px] font-normal text-[var(--tf-text-secondary)]">{feeNote}</span>
        ) : null}
      </div>
      {!inline && promoLabel ? (
        <p className="mt-0.5 text-[11px] font-medium text-[var(--tf-teal)]">{promoLabel}</p>
      ) : null}
      {!inline && feeNote && size === "sm" ? (
        <p className="text-[10px] text-[var(--tf-text-secondary)]">{feeNote}</p>
      ) : null}
    </div>
  );
}
