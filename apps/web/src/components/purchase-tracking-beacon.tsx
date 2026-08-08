"use client";

import { useEffect, useRef } from "react";
import { readConsent } from "@/lib/consent";
import { trackTfEvent } from "@/lib/tracking/client";

type Props = {
  orderId: string;
  accessToken?: string | null;
  embedMode?: boolean;
};

/**
 * Optional browser purchase mirror — uses same event_id as server webhook conversion.
 */
export function PurchaseTrackingBeacon({ orderId, accessToken, embedMode }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const consent = readConsent();
    const qs = accessToken ? `?t=${encodeURIComponent(accessToken)}` : "";
    void (async () => {
      try {
        const res = await fetch(`/api/v1/tracking/purchase/${orderId}${qs}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          eventId: string;
          transactionId: string;
          value: number;
          currency: string;
          items: unknown[];
        };
        await trackTfEvent("purchase", {
          eventId: data.eventId,
          orderId,
          transactionId: data.transactionId,
          valueCents: Math.round(data.value * 100),
          currency: data.currency,
          payload: { items: data.items, mirror: true },
          embedMode,
        });
        // trackTfEvent already fires gtag/fbq when consent; skip if no consent
        void consent;
      } catch {
        /* ignore */
      }
    })();
  }, [orderId, accessToken, embedMode]);

  return null;
}
