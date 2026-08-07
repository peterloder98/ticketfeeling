"use client";

import { useEffect, useState } from "react";
import { FeeSurchargeNote } from "@/components/fee-info-dialog";

export function MobilePurchaseBar({
  fromPriceLabel,
  priceNote,
  targetId = "tickets",
}: {
  fromPriceLabel: string;
  priceNote?: string | null;
  targetId?: string;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px", threshold: 0.05 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tf-line)] bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,39,71,0.12)] md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--tf-navy)]">{fromPriceLabel}</p>
          {priceNote ? (
            <FeeSurchargeNote
              as="p"
              note={priceNote}
              textClassName="text-[11px] text-[var(--tf-text-secondary)]"
            />
          ) : null}
        </div>
        <a href={`#${targetId}`} className="tf-btn tf-btn-primary !min-h-11 !px-4 text-sm">
          Tickets sichern
        </a>
      </div>
    </div>
  );
}
