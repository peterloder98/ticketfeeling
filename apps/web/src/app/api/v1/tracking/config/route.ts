import { NextResponse } from "next/server";
import { getDefaultOrganization } from "@/lib/commerce/org";

export const preferredRegion = "fra1";

/** Lightweight tracking settings for post-paint OrgTracking (avoids layout DB). */
export async function GET() {
  try {
    const org = await getDefaultOrganization();
    const s = org?.settings;
    if (!s) {
      return NextResponse.json({ settings: null }, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      });
    }
    return NextResponse.json(
      {
        settings: {
          trackingEnabled: s.trackingEnabled,
          trackingGa4MeasurementId: s.trackingGa4MeasurementId,
          trackingGtmContainerId: s.trackingGtmContainerId,
          trackingMetaPixelId: s.trackingMetaPixelId,
          trackingGoogleAdsId: s.trackingGoogleAdsId,
        },
      },
      {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("[tracking/config] failed", error);
    return NextResponse.json({ settings: null }, { status: 200 });
  }
}
