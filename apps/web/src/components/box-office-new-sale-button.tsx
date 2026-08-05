"use client";

import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { BoxOfficeForm } from "@/components/box-office-form";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  priceGrossCents: number;
  available: number;
  saleLabel?: string | null;
};

type EventOption = {
  id: string;
  name: string;
  whenLabel?: string | null;
  locationLabel?: string | null;
  categories: Category[];
};

type FeeConfig = {
  enabled: boolean;
  percentageBasisPoints: number;
  displayName: string;
};

/** Opens the Tageskasse sale wizard in a modal — list stays the primary page. */
export function BoxOfficeNewSaleButton({
  events,
  feeConfig,
}: {
  events: EventOption[];
  feeConfig: FeeConfig;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

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

  function openModal() {
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="tf-btn tf-btn-primary" onClick={openModal}>
        <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
        Neuer Verkauf
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,39,71,0.45)] p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--tf-line)] bg-white shadow-[0_20px_50px_rgba(15,39,71,0.25)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--tf-line)] px-5 py-4 md:px-6">
              <div>
                <h2 id={titleId} className="text-xl font-semibold text-[var(--tf-navy)]">
                  Neuer Verkauf
                </h2>
                <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">
                  Event wählen, Tickets und Zahlung — fertig.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)] hover:text-[var(--tf-navy)]"
                aria-label="Schließen"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 md:px-6 md:py-6">
              <BoxOfficeForm key={formKey} events={events} feeConfig={feeConfig} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
