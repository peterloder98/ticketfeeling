"use client";

import { useEffect, useState } from "react";
import { resolveTrackingConfig } from "@/lib/tracking/config";
import { TrackingScripts } from "@/components/tracking-scripts";
import { getTrackingLinkerDomains } from "@/lib/embed/public-url";

type OrgSettings = Parameters<typeof resolveTrackingConfig>[0];
type EventTracking = Parameters<typeof resolveTrackingConfig>[1];

/**
 * Tracking must not block root-layout TTFB. Config is fetched after paint
 * (org settings are cached server-side for 60s on the API).
 */
export function OrgTracking({
  embedMode = false,
  eventSlug,
  eventTracking,
  orgSettings,
}: {
  embedMode?: boolean;
  eventSlug?: string | null;
  eventTracking?: EventTracking;
  /** When already loaded (embed event page), skip the extra fetch. */
  orgSettings?: OrgSettings;
} = {}) {
  const [settings, setSettings] = useState<OrgSettings | null | undefined>(
    orgSettings === undefined ? undefined : orgSettings,
  );

  useEffect(() => {
    if (orgSettings !== undefined) {
      setSettings(orgSettings);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/tracking/config", { credentials: "same-origin" });
        if (!res.ok || cancelled) {
          if (!cancelled) setSettings(null);
          return;
        }
        const data = (await res.json()) as { settings?: OrgSettings };
        if (!cancelled) setSettings(data.settings ?? null);
      } catch {
        if (!cancelled) setSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSettings]);

  if (settings === undefined || settings === null) return null;

  const config = resolveTrackingConfig(settings, eventTracking);
  if (!config.enabled) return null;

  return (
    <TrackingScripts
      enabled={config.enabled}
      ga4MeasurementId={config.ga4MeasurementId}
      gtmContainerId={config.gtmContainerId}
      metaPixelId={config.metaPixelId}
      googleAdsId={config.googleAdsId}
      linkerDomains={getTrackingLinkerDomains()}
      eventSlug={eventSlug}
      embedMode={embedMode}
    />
  );
}
