"use client";

import { useEffect, useState } from "react";

type ConsentState = {
  necessary: true;
  statistics: boolean;
  marketing: boolean;
  externalMedia: boolean;
  version: string;
  at: string;
};

const KEY = "tf_consent_v1";
const VERSION = "2026-07-31";

function saveConsent(partial: Omit<ConsentState, "necessary" | "version" | "at">) {
  const value: ConsentState = {
    necessary: true,
    ...partial,
    version: VERSION,
    at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("tf:consent", { detail: value }));
  return value;
}

/**
 * Compact consent for iframe embeds.
 * Also accepts parent postMessage: { type: "tf:consent", statistics, marketing }.
 */
export function EmbedConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        setVisible(true);
      } else {
        const parsed = JSON.parse(raw) as ConsentState;
        if (parsed.version !== VERSION) setVisible(true);
      }
    } catch {
      setVisible(true);
    }

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "tf:consent") return;
      saveConsent({
        statistics: Boolean(data.statistics),
        marketing: Boolean(data.marketing),
        externalMedia: Boolean(data.externalMedia ?? data.marketing),
      });
      setVisible(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!visible) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-[var(--tf-line)] bg-white/95 px-3 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-snug text-[var(--tf-text-secondary)]">
          Cookies für Statistik & Marketing helfen uns, Tickets sicher zu verkaufen.{" "}
          <a href="/datenschutz" target="_top" className="underline">
            Datenschutz
          </a>
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className="rounded-lg border border-[var(--tf-line)] px-2.5 py-1.5 text-xs font-medium"
            onClick={() => {
              saveConsent({ statistics: false, marketing: false, externalMedia: false });
              setVisible(false);
            }}
          >
            Nur nötig
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--tf-navy)] px-2.5 py-1.5 text-xs font-medium text-white"
            onClick={() => {
              saveConsent({ statistics: true, marketing: true, externalMedia: true });
              setVisible(false);
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
