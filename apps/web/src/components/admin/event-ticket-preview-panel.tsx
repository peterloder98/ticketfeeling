"use client";

import { useState } from "react";
import { TicketFace } from "@/components/ticket-face";
import type { TicketFaceEmbed } from "@/lib/commerce/ticket-document";

export type TicketPreviewVariant = {
  key: "standard" | "vip";
  label: string;
  categoryName: string;
  face: TicketFaceEmbed;
};

type Props = {
  variants: TicketPreviewVariant[];
};

export function EventTicketPreviewPanel({ variants }: Props) {
  const [activeKey, setActiveKey] = useState(variants[0]?.key ?? "standard");
  const active =
    variants.find((v) => v.key === activeKey) ?? variants[0] ?? null;

  if (!active) return null;

  const showToggle = variants.length > 1;

  return (
    <section className="tf-card !p-5" id="ticketvorschau">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
            Ticketvorschau
          </h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            So wirkt Cover, Sponsorenlogos und Kategorie auf dem Ticket — mit
            Beispieldaten, ohne echte Bestellung. Der QR-Code ist{" "}
            <strong className="font-semibold text-[var(--tf-navy)]">
              nicht einlösbar
            </strong>
            .
          </p>
        </div>
        {showToggle ? (
          <div
            className="inline-flex rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.04)] p-1"
            role="group"
            aria-label="Ticketvorschau Variante"
          >
            {variants.map((v) => {
              const selected = v.key === active.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setActiveKey(v.key)}
                  className={
                    selected
                      ? "rounded-lg bg-[var(--tf-teal)] px-3 py-1.5 text-sm font-semibold text-white transition"
                      : "rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--tf-navy)] transition hover:bg-white"
                  }
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--tf-text-secondary)]">
        <span className="tf-badge">Vorschau</span>
        <span>
          Kategorie: <span className="text-[var(--tf-navy)]">{active.categoryName}</span>
        </span>
        <span aria-hidden>·</span>
        <span>Bestellung TF-B-PREVIEW · QR: TF-PREVIEW-INVALID</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--tf-line)] bg-[rgba(248,250,252,0.9)] p-3 sm:p-4">
        <TicketFace face={active.face} />
      </div>
    </section>
  );
}
