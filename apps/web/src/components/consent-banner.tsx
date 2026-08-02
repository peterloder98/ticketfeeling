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

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        setVisible(true);
        return;
      }
      const parsed = JSON.parse(raw) as ConsentState;
      if (parsed.version !== VERSION) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function save(partial: Omit<ConsentState, "necessary" | "version" | "at">) {
    const value: ConsentState = {
      necessary: true,
      ...partial,
      version: VERSION,
      at: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("tf:consent", { detail: value }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--tf-line)] bg-white p-4 shadow-[0_-8px_30px_rgba(15,39,71,0.08)]">
      <div className="tf-container flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          <p className="font-semibold text-[var(--tf-text)]">Datenschutz & Einwilligung</p>
          <p className="mt-1 leading-relaxed">
            Notwendige Funktionen (Login, Warenkorb, Checkout, Sicherheit) laufen immer. Statistik-
            und Marketing-Tools sowie externe Medien erst nach Einwilligung.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tf-btn tf-btn-secondary !min-h-11"
            onClick={() =>
              save({ statistics: false, marketing: false, externalMedia: false })
            }
          >
            Nur notwendig
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-11"
            onClick={() =>
              save({ statistics: true, marketing: true, externalMedia: true })
            }
          >
            Alle akzeptieren
          </button>
        </div>
      </div>
    </div>
  );
}
