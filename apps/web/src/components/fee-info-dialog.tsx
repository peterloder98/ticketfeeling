"use client";

import { useEffect, useId, useState } from "react";
import { Info, X } from "lucide-react";
import {
  PLATFORM_FEE_INFO_BULLETS,
  buildPlatformFeeInfoClosing,
} from "@/lib/commerce/platform-fee";

/**
 * Small info icon under the Verwaltungsgebühr line → calm dialog for older users.
 */
export function FeeInfoDialog({
  feePercentageBasisPoints,
}: {
  feePercentageBasisPoints: number;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const closing = buildPlatformFeeInfoClosing(feePercentageBasisPoints);

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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-[var(--tf-teal-hover)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
    </>
  );
}
