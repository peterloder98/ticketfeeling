"use client";

import { useState } from "react";

export function EmbedCodePanel({
  title,
  description,
  previewUrl,
  snippet,
}: {
  title: string;
  description: string;
  previewUrl: string;
  snippet: string;
}) {
  const [copied, setCopied] = useState(false);

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
    <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--tf-navy)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          >
            Vorschau
          </a>
          <button type="button" className="tf-btn tf-btn-primary !min-h-10 text-sm" onClick={() => void copy()}>
            {copied ? "Kopiert" : "Code kopieren"}
          </button>
        </div>
      </div>
      <pre className="mt-4 max-h-56 overflow-auto rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[var(--tf-navy)]">
        {snippet}
      </pre>
    </div>
  );
}
