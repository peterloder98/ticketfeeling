import type { OrganizationSettings, Event } from "@prisma/client";

export type TrackingConfig = {
  enabled: boolean;
  ga4MeasurementId: string | null;
  gtmContainerId: string | null;
  metaPixelId: string | null;
  googleAdsId: string | null;
  source: "organization" | "event";
};

export function resolveTrackingConfig(
  settings: OrganizationSettings | null | undefined,
  event?: Pick<
    Event,
    | "trackingUseOrgDefaults"
    | "trackingGa4MeasurementId"
    | "trackingGtmContainerId"
    | "trackingMetaPixelId"
    | "trackingGoogleAdsId"
    | "trackingReviewedAt"
  > | null,
): TrackingConfig {
  if (event && event.trackingUseOrgDefaults === false) {
    return {
      enabled: Boolean(
        event.trackingGa4MeasurementId ||
          event.trackingGtmContainerId ||
          event.trackingMetaPixelId ||
          event.trackingGoogleAdsId,
      ),
      ga4MeasurementId: event.trackingGa4MeasurementId,
      gtmContainerId: event.trackingGtmContainerId,
      metaPixelId: event.trackingMetaPixelId,
      googleAdsId: event.trackingGoogleAdsId,
      source: "event",
    };
  }

  return {
    enabled: Boolean(settings?.trackingEnabled),
    ga4MeasurementId: settings?.trackingGa4MeasurementId ?? null,
    gtmContainerId: settings?.trackingGtmContainerId ?? null,
    metaPixelId: settings?.trackingMetaPixelId ?? null,
    googleAdsId: settings?.trackingGoogleAdsId ?? null,
    source: "organization",
  };
}
