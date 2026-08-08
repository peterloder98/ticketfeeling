"use client";

import { useEffect } from "react";
import {
  storeParentAttribution,
  storeParentPixelCookies,
  syncTrackingSession,
  trackTfEvent,
} from "@/lib/tracking/client";
import { parseAttributionFromUnknown } from "@/lib/tracking/attribution";
import { isTrustedEmbedParentOrigin } from "@/lib/embed/post-message-target";
import { isOriginAllowed } from "@/lib/tracking/origins";
import { saveConsent } from "@/lib/consent";

const ALLOWLIST = (process.env.NEXT_PUBLIC_EMBED_FRAME_ANCESTORS || "")
  .split(/[\s,]+/)
  .filter(Boolean);

function originOk(origin: string): boolean {
  if (ALLOWLIST.length > 0 && !ALLOWLIST.includes("*")) {
    return isOriginAllowed(origin, ALLOWLIST);
  }
  // Fall back to referrer-based trust (existing embed behavior)
  return isTrustedEmbedParentOrigin(origin);
}

/**
 * Listen for parent attribution / consent; sync TF session; announce ready.
 */
export function EmbedTrackingBridge({ eventSlug }: { eventSlug?: string | null }) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (!originOk(event.origin)) return;

      if (data.type === "tf:attribution") {
        const attr = parseAttributionFromUnknown(data.attribution ?? {});
        storeParentAttribution(attr);
        // Parent-domain _fbp/_fbc are critical for iframe Meta matching
        storeParentPixelCookies({
          fbp: typeof data.fbp === "string" ? data.fbp : data.attribution?.fbp,
          fbc: typeof data.fbc === "string" ? data.fbc : data.attribution?.fbc,
        });
        if (data.consent && typeof data.consent === "object") {
          saveConsent({
            statistics: Boolean(data.consent.statistics),
            marketing: Boolean(data.consent.marketing),
            externalMedia: Boolean(
              data.consent.externalMedia ?? data.consent.marketing,
            ),
          });
        }
        void syncTrackingSession(true);
        return;
      }

      if (data.type === "tf:consent") {
        saveConsent({
          statistics: Boolean(data.statistics),
          marketing: Boolean(data.marketing),
          externalMedia: Boolean(data.externalMedia ?? data.marketing),
        });
        void syncTrackingSession(true);
        void trackTfEvent("consent_updated", {
          embedMode: true,
          eventSlug,
          payload: {
            statistics: Boolean(data.statistics),
            marketing: Boolean(data.marketing),
          },
        });
      }
    }

    window.addEventListener("message", onMessage);
    void syncTrackingSession(true);
    void trackTfEvent("embed_ready", { embedMode: true, eventSlug });

    return () => window.removeEventListener("message", onMessage);
  }, [eventSlug]);

  return null;
}
