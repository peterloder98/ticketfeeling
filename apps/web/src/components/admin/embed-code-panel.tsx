"use client";

import { useMemo, useState } from "react";
import {
  buildEventEmbedSnippet,
  buildShopEmbedSnippet,
  getEmbedAppUrl,
} from "@/lib/embed/public-url";
import {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_WIDTH,
  EMBED_FIXED_HEIGHT_EVENT,
  EMBED_FIXED_HEIGHT_SHOP,
  embedPreviewWidthClass,
  type EmbedHeightMode,
  type EmbedWidthPreset,
} from "@/lib/embed/frame-size";
import { EmbedSizeControls } from "@/components/admin/embed-size-controls";

type ShopProps = {
  kind: "shop";
  title: string;
  description: string;
  minHeight?: number;
};

type EventProps = {
  kind: "event";
  title: string;
  description: string;
  slug: string;
  eventTitle?: string;
  minHeight?: number;
};

type Props = ShopProps | EventProps;

export function EmbedCodePanel(props: Props) {
  const [copied, setCopied] = useState(false);
  const [widthPreset, setWidthPreset] = useState<EmbedWidthPreset>(DEFAULT_EMBED_WIDTH);
  const [heightMode, setHeightMode] = useState<EmbedHeightMode>(DEFAULT_EMBED_HEIGHT);
  const appUrl = getEmbedAppUrl();
  const defaultMin =
    props.minHeight ??
    (props.kind === "shop" ? EMBED_FIXED_HEIGHT_SHOP : EMBED_FIXED_HEIGHT_EVENT);

  const { snippet, previewUrl } = useMemo(() => {
    if (props.kind === "shop") {
      return {
        snippet: buildShopEmbedSnippet({
          appUrl,
          minHeight: defaultMin,
          widthPreset,
          heightMode,
        }),
        previewUrl: `${appUrl}/embed/shop`,
      };
    }
    return {
      snippet: buildEventEmbedSnippet({
        appUrl,
        slug: props.slug,
        title: props.eventTitle,
        minHeight: defaultMin,
        widthPreset,
        heightMode,
      }),
      previewUrl: `${appUrl}/embed/event/${encodeURIComponent(props.slug)}`,
    };
  }, [appUrl, props, widthPreset, heightMode, defaultMin]);

  const previewHeight =
    heightMode === "auto" ? Math.min(720, defaultMin + 120) : defaultMin;

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
          <h3 className="text-base font-semibold text-[var(--tf-navy)]">{props.title}</h3>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{props.description}</p>
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
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10 text-sm"
            onClick={() => void copy()}
          >
            {copied ? "Kopiert!" : "Code kopieren"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <EmbedSizeControls
          widthPreset={widthPreset}
          heightMode={heightMode}
          onWidthChange={setWidthPreset}
          onHeightChange={setHeightMode}
        />
      </div>

      <pre className="mt-4 max-h-56 overflow-auto rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[var(--tf-navy)]">
        {snippet}
      </pre>
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--tf-line)] bg-[#f8fafc]">
        <p className="border-b border-[var(--tf-line)] px-3 py-2 text-xs font-medium text-[var(--tf-text-secondary)]">
          Live-Vorschau
        </p>
        <div className="p-3">
          <iframe
            src={previewUrl}
            title="Embed-Vorschau"
            className={`mx-auto block bg-transparent ${embedPreviewWidthClass(widthPreset)}`}
            style={{ height: previewHeight }}
          />
        </div>
      </div>
    </div>
  );
}
