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
 * Compact consent chip for iframe embeds (not a full-width bar).
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
    <div className="px-1 pb-2">
      <div className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-2 shadow-sm">
        <p className="text-[11px] leading-snug text-[var(--tf-text-secondary)]">
          Cookies für Statistik & Marketing.{" "}
          <a href="/datenschutz" target="_top" className="underline">
            Mehr
          </a>
        </p>
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            className="min-h-7 flex-1 rounded-md border border-[var(--tf-line)] bg-white px-2 text-[11px] font-medium text-[var(--tf-navy)]"
            onClick={() => {
              saveConsent({ statistics: false, marketing: false, externalMedia: false });
              setVisible(false);
            }}
          >
            Nur nötig
          </button>
          <button
            type="button"
            className="min-h-7 flex-1 rounded-md bg-[var(--tf-navy)] px-2 text-[11px] font-semibold text-white"
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
