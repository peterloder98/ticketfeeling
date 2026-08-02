"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";

export function EmbedCodeModalButton({
  buttonLabel = "iframe codes des Events anzeigen",
  title = "iframe-Code dieses Events",
  description,
  previewUrl,
  snippet,
}: {
  buttonLabel?: string;
  title?: string;
  description?: string;
  previewUrl: string;
  snippet: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        className="tf-btn tf-btn-secondary !min-h-10 text-sm"
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
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
            className="relative w-full max-w-lg rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_20px_50px_rgba(15,39,71,0.25)]"
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
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{description}</p>
            ) : null}

            <pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[var(--tf-navy)]">
              {snippet}
            </pre>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
              >
                Vorschau
              </a>
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                onClick={() => void copy()}
              >
                {copied ? "Kopiert" : "Kopieren"}
              </button>
              <button
                type="button"
                className="tf-btn !min-h-10 text-sm"
                onClick={() => setOpen(false)}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
