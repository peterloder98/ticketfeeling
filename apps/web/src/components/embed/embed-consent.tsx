"use client";

import { useEffect, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  readConsent,
  saveConsent,
} from "@/lib/consent";

/**
 * Compact consent chip for iframe embeds (not a full-width bar).
 * Also accepts parent postMessage: { type: "tf:consent", statistics, marketing }.
 */
export function EmbedConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!readConsent()) setVisible(true);

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
    <div className="px-1 pb-2 pt-1">
      <div className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-2 shadow-sm">
        <p className="text-[11px] leading-snug text-[var(--tf-text-secondary)]">
          Cookies für Statistik & Marketing.{" "}
          <a
            href="/recht/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
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
        <p className="mt-1 text-[9px] text-[var(--tf-text-secondary)]">
          v{CONSENT_VERSION} · {CONSENT_STORAGE_KEY}
        </p>
      </div>
    </div>
  );
}
