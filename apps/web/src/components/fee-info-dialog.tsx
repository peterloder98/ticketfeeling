"use client";

import { useEffect, useId, useState } from "react";
import { Info, X } from "lucide-react";
import {
  PLATFORM_FEE_INFO_BULLETS,
  buildDefaultPlatformFeeCustomerDescription,
  buildPlatformFeeInfoClosing,
} from "@/lib/commerce/platform-fee";

/**
 * Visible Verwaltungsgebühr explanation for buyers (cart / checkout / embed).
 * Always shows human prose + a calm dialog with the full list.
 */
export function FeeInfoDialog({
  feePercentageBasisPoints,
  description,
}: {
  feePercentageBasisPoints: number;
  /** Optional customer-facing prose; falls back to the default explanation. */
  description?: string | null;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const bps = Math.max(0, feePercentageBasisPoints);
  const closing = buildPlatformFeeInfoClosing(bps);
  const prose =
    typeof description === "string" && description.trim()
      ? description.trim()
      : buildDefaultPlatformFeeCustomerDescription(bps || 400);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="rounded-xl border border-[rgba(20,184,166,0.28)] bg-[rgba(20,184,166,0.06)] px-3 py-2.5">
      <p className="text-sm leading-relaxed text-[var(--tf-navy)]">{prose}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--tf-teal-hover)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        Was ist die Verwaltungsgebühr?
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,39,71,0.45)] p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_20px_50px_rgba(15,39,71,0.25)] md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)] hover:text-[var(--tf-navy)]"
              aria-label="Schließen"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>

            <h3 id={titleId} className="pr-10 text-lg font-semibold text-[var(--tf-navy)]">
              Was beinhaltet die Verwaltungsgebühr?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tf-text-secondary)]">
              Die Verwaltungsgebühr deckt den sicheren Betrieb Ihres Ticketkaufs ab:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--tf-navy)]">
              {PLATFORM_FEE_INFO_BULLETS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-[var(--tf-text-secondary)]">{closing}</p>
            <button
              type="button"
              className="tf-btn tf-btn-primary mt-5 w-full"
              onClick={() => setOpen(false)}
            >
              Verstanden
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
