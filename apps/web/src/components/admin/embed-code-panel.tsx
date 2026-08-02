"use client";

import { useEffect, useMemo, useState } from "react";
import { buildEventEmbedSnippet, buildShopEmbedSnippet } from "@/lib/embed/public-url";

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

/** Legacy: absolute preview + prebuilt snippet from server */
type LegacyProps = {
  kind?: undefined;
  title: string;
  description: string;
  previewUrl: string;
  snippet: string;
};

type Props = ShopProps | EventProps | LegacyProps;

function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin.replace(/\/$/, ""));
  }, []);
  return origin;
}

export function EmbedCodePanel(props: Props) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);

  const { snippet, previewPath, absoluteSrc } = useMemo(() => {
    if (!props.kind) {
      return {
        snippet: props.snippet,
        previewPath: props.previewUrl.startsWith("http")
          ? new URL(props.previewUrl).pathname
          : props.previewUrl,
        absoluteSrc: props.previewUrl,
      };
    }
    if (!origin) {
      return { snippet: "Lade Embed-URL…", previewPath: "", absoluteSrc: "" };
    }
    if (props.kind === "shop") {
      return {
        snippet: buildShopEmbedSnippet({ appUrl: origin, minHeight: props.minHeight }),
        previewPath: "/embed/shop",
        absoluteSrc: `${origin}/embed/shop`,
      };
    }
    return {
      snippet: buildEventEmbedSnippet({
        appUrl: origin,
        slug: props.slug,
        title: props.eventTitle,
        minHeight: props.minHeight,
      }),
      previewPath: `/embed/event/${encodeURIComponent(props.slug)}`,
      absoluteSrc: `${origin}/embed/event/${encodeURIComponent(props.slug)}`,
    };
  }, [origin, props]);

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
          {absoluteSrc ? (
            <p className="mt-2 break-all text-xs text-[var(--tf-text-secondary)]">
              src: <span className="font-medium text-[var(--tf-navy)]">{absoluteSrc}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={previewPath || absoluteSrc || "#"}
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
            disabled={!origin && Boolean(props.kind)}
          >
            {copied ? "Kopiert" : "Code kopieren"}
          </button>
        </div>
      </div>
      <pre className="mt-4 max-h-56 overflow-auto rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[var(--tf-navy)]">
        {snippet}
      </pre>
      {previewPath ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--tf-line)] bg-[#f8fafc]">
          <p className="border-b border-[var(--tf-line)] px-3 py-2 text-xs font-medium text-[var(--tf-text-secondary)]">
            Live-Vorschau
          </p>
          <iframe
            src={previewPath}
            title="Embed-Vorschau"
            className="block h-[520px] w-full bg-white"
          />
        </div>
      ) : null}
    </div>
  );
}
