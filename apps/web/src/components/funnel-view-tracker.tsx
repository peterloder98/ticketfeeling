"use client";

import { useEffect, useRef } from "react";
import { trackTfEvent } from "@/lib/tracking/client";

/** Fire Meta ViewContent + internal ticket_shop / event_page_view once per mount. */
export function FunnelViewTracker({
  kind,
  eventSlug,
  eventId,
  eventTitle,
  valueCents,
  embedMode,
}: {
  kind: "event_page_view" | "ticket_shop_view";
  eventSlug?: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
  valueCents?: number | null;
  embedMode?: boolean;
}) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void trackTfEvent(kind, {
      eventSlug,
      embedMode,
      valueCents: valueCents ?? null,
      currency: "EUR",
      payload: {
        contentIds: eventId ? [eventId] : [],
        contentName: eventTitle ?? eventSlug ?? null,
        content_type: "product",
        funnelStage: kind === "ticket_shop_view" ? "ticketshop_view" : "landing_event",
      },
    });
  }, [kind, eventSlug, eventId, eventTitle, valueCents, embedMode]);

  return null;
}
