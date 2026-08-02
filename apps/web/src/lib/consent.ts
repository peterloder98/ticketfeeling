export type ConsentState = {
  necessary: true;
  statistics: boolean;
  marketing: boolean;
  externalMedia: boolean;
  version: string;
  at: string;
};

export const CONSENT_STORAGE_KEY = "tf_consent_v1";
export const CONSENT_VERSION = "2026-08-02";
export const CONSENT_OPEN_EVENT = "tf:consent-open";

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(partial: Omit<ConsentState, "necessary" | "version" | "at">) {
  const value: ConsentState = {
    necessary: true,
    ...partial,
    version: CONSENT_VERSION,
    at: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("tf:consent", { detail: value }));
  return value;
}

export function openConsentSettings() {
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}
