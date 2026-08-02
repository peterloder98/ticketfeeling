"use client";

import { openConsentSettings } from "@/lib/consent";

export function CookieSettingsButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => openConsentSettings()}>
      Cookie-Einstellungen
    </button>
  );
}
