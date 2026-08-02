import { getDefaultOrganization } from "@/lib/commerce/org";
import { resolveTrackingConfig } from "@/lib/tracking/config";
import { TrackingScripts } from "@/components/tracking-scripts";
import { getTrackingLinkerDomains } from "@/lib/embed/public-url";

export async function OrgTracking({
  embedMode = false,
  eventSlug,
  eventTracking,
}: {
  embedMode?: boolean;
  eventSlug?: string | null;
  eventTracking?: Parameters<typeof resolveTrackingConfig>[1];
} = {}) {
  let org: Awaited<ReturnType<typeof getDefaultOrganization>> = null;
  try {
    org = await getDefaultOrganization();
  } catch (error) {
    // Never break page render / SSG (e.g. /agb) when DB schema lags.
    console.error("[tracking] org load failed", error);
    return null;
  }
  const config = resolveTrackingConfig(org?.settings, eventTracking);

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
