"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  readConsent,
  saveConsent,
  type ConsentState,
} from "@/lib/consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [statistics, setStatistics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [externalMedia, setExternalMedia] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setVisible(true);
    } else {
      setStatistics(existing.statistics);
      setMarketing(existing.marketing);
      setExternalMedia(existing.externalMedia);
    }

    function onOpen() {
      const current = readConsent();
      if (current) {
        setStatistics(current.statistics);
        setMarketing(current.marketing);
        setExternalMedia(current.externalMedia);
      }
      setAdvanced(true);
      setVisible(true);
    }
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  function persist(partial: Omit<ConsentState, "necessary" | "version" | "at">) {
    saveConsent(partial);
    setVisible(false);
    setAdvanced(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--tf-line)] bg-white p-4 shadow-[0_-8px_30px_rgba(15,39,71,0.08)] md:inset-x-auto md:bottom-4 md:left-4 md:max-w-md md:rounded-2xl md:border md:border-[var(--tf-line)]">
      <div className="mx-auto max-w-3xl space-y-4 md:mx-0">
        <div className="flex flex-col gap-4">
          <div className="text-sm text-[var(--tf-text-secondary)]">
            <p className="font-semibold text-[var(--tf-text)]">Datenschutz & Cookies</p>
            <p className="mt-1 leading-relaxed">
              Technisch notwendige Cookies sind immer aktiv. Statistik, Marketing und externe Medien
              nur nach deiner Einwilligung. Details in der{" "}
              <Link href="/recht/datenschutz" className="font-medium text-[var(--tf-teal)] underline">
                Datenschutzerklärung
              </Link>{" "}
              und der{" "}
              <Link href="/recht/cookies" className="font-medium text-[var(--tf-teal)] underline">
                Cookie-Richtlinie
              </Link>
              .
            </p>
          </div>
          {!advanced ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-11"
                onClick={() =>
                  persist({ statistics: false, marketing: false, externalMedia: false })
                }
              >
                Nur notwendig
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-11"
                onClick={() => setAdvanced(true)}
              >
                Einstellungen
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-11"
                onClick={() =>
                  persist({ statistics: true, marketing: true, externalMedia: true })
                }
              >
                Alle akzeptieren
              </button>
            </div>
          ) : null}
        </div>

        {advanced ? (
          <div className="space-y-3 rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4">
            <ConsentToggle
              label="Technisch notwendig"
              description="Login, Warenkorb, Checkout, Sicherheit — immer aktiv."
              checked
              disabled
            />
            <ConsentToggle
              label="Statistik"
              description="Hilft uns, die Plattform zu verbessern (z. B. Reichweite)."
              checked={statistics}
              onChange={setStatistics}
            />
            <ConsentToggle
              label="Marketing"
              description="Messung und Aussteuerung von Werbung."
              checked={marketing}
              onChange={setMarketing}
            />
            <ConsentToggle
              label="Externe Medien"
              description="Eingebettete Inhalte wie Videos oder Karten."
              checked={externalMedia}
              onChange={setExternalMedia}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                onClick={() => persist({ statistics, marketing, externalMedia })}
              >
                Auswahl speichern
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                onClick={() =>
                  persist({ statistics: false, marketing: false, externalMedia: false })
                }
              >
                Nur notwendig
              </button>
            </div>
            <p className="text-[11px] text-[var(--tf-text-secondary)]">
              Consent-Version {CONSENT_VERSION} · Speicher {CONSENT_STORAGE_KEY}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--tf-teal)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-semibold text-[var(--tf-navy)]">{label}</span>
        <span className="block text-xs text-[var(--tf-text-secondary)]">{description}</span>
      </span>
    </label>
  );
}
