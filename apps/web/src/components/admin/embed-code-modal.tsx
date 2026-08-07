"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { buildEventEmbedSnippet, getEmbedAppUrl } from "@/lib/embed/public-url";
import {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_WIDTH,
  EMBED_FIXED_HEIGHT_EVENT,
  embedPreviewWidthClass,
  type EmbedHeightMode,
  type EmbedWidthPreset,
} from "@/lib/embed/frame-size";
import { EmbedSizeControls } from "@/components/admin/embed-size-controls";

export function EmbedCodeModalButton({
  buttonLabel = "iframe codes des Events anzeigen",
  title = "iframe-Code dieses Events",
  description,
  slug,
  eventTitle,
}: {
  buttonLabel?: string;
  title?: string;
  description?: string;
  slug: string;
  eventTitle?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [widthPreset, setWidthPreset] = useState<EmbedWidthPreset>(DEFAULT_EMBED_WIDTH);
  const [heightMode, setHeightMode] = useState<EmbedHeightMode>(DEFAULT_EMBED_HEIGHT);

  const appUrl = getEmbedAppUrl();
  const previewUrl = `${appUrl}/embed/event/${encodeURIComponent(slug)}`;
  const snippet = useMemo(
    () =>
      buildEventEmbedSnippet({
        appUrl,
        slug,
        title: eventTitle,
        widthPreset,
        heightMode,
        minHeight: EMBED_FIXED_HEIGHT_EVENT,
      }),
    [appUrl, slug, eventTitle, widthPreset, heightMode],
  );
  const previewHeight =
    heightMode === "auto" ? Math.min(720, EMBED_FIXED_HEIGHT_EVENT + 120) : EMBED_FIXED_HEIGHT_EVENT;

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
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_20px_50px_rgba(15,39,71,0.25)]"
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
            ) : (
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                Breite und Höhe wählen, Code kopieren — fertig.
              </p>
            )}
            <p className="mt-2 break-all text-xs text-[var(--tf-text-secondary)]">
              src:{" "}
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--tf-navy)] underline"
              >
                {previewUrl}
              </a>
            </p>

            <div className="mt-4">
              <EmbedSizeControls
                widthPreset={widthPreset}
                heightMode={heightMode}
                onWidthChange={setWidthPreset}
                onHeightChange={setHeightMode}
              />
            </div>

            <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[var(--tf-navy)]">
              {snippet}
            </pre>
            <button
              type="button"
              className="tf-btn tf-btn-primary mt-3 w-full !min-h-11 text-sm"
              onClick={() => void copy()}
            >
              {copied ? "Kopiert!" : "Code kopieren"}
            </button>

            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--tf-line)]">
              <p className="border-b border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-xs font-medium text-[var(--tf-text-secondary)]">
                Live-Vorschau
              </p>
              <div className="bg-[#f8fafc] p-3">
                <iframe
                  src={previewUrl}
                  title="Embed-Vorschau"
                  className={`mx-auto block bg-transparent ${embedPreviewWidthClass(widthPreset)}`}
                  style={{ height: previewHeight }}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
              >
                In neuem Tab
              </a>
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
