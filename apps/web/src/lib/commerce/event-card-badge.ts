export type EventCardBadgeKind = "promotion" | "status" | "availability";

export type EventCardBadge = {
  label: string;
  kind: EventCardBadgeKind;
  /** Status tone hint for PromotionBadge */
  statusTone?: "teal" | "neutral" | "vip";
};

/**
 * Cover badge only when there is real, useful info — never a generic „Tickets“.
 * Priority: sold out → VIP scarcity → general scarcity → Aktion → multi-date → Neu.
 */
export function resolveEventCardBadge(input: {
  status: string;
  remainingTickets?: number | null;
  capacity?: number | null;
  showRemainingAvailability?: boolean;
  /** Multi-date / tour listings */
  dateCount?: number | null;
  hasCampaign?: boolean;
  /** Short campaign title for cover, e.g. „Sommer-Rabatt“ */
  campaignLabel?: string | null;
  /** True when VIP inventory is near sold out (computed upstream from real pools). */
  vipNearlySoldOut?: boolean;
}): EventCardBadge | null {
  const {
    status,
    remainingTickets,
    capacity,
    showRemainingAvailability = false,
    dateCount = 1,
    hasCampaign = false,
    campaignLabel = null,
    vipNearlySoldOut = false,
  } = input;

  if (
    status === "sold_out" ||
    (remainingTickets != null && remainingTickets <= 0 && (capacity ?? 0) > 0)
  ) {
    return { label: "Ausverkauft", kind: "status", statusTone: "neutral" };
  }

  if (showRemainingAvailability && vipNearlySoldOut) {
    return { label: "VIP fast ausverkauft", kind: "availability" };
  }

  if (
    showRemainingAvailability &&
    remainingTickets != null &&
    capacity != null &&
    capacity > 0
  ) {
    const ratio = remainingTickets / capacity;
    if (remainingTickets <= 25 || ratio <= 0.12) {
      return { label: "Fast ausverkauft", kind: "availability" };
    }
    if (remainingTickets <= 80 || ratio <= 0.35) {
      return { label: "Nur noch wenige Tickets", kind: "availability" };
    }
  }

  if (hasCampaign) {
    const short = campaignLabel?.trim() ?? "";
    // Prefer a short human Aktion name; otherwise generic „Aktion“.
    const label =
      short &&
      short.length <= 22 &&
      !/^−?\d+%?$/.test(short) &&
      !/€/.test(short)
        ? short
        : "Aktion";
    return { label, kind: "promotion" };
  }

  if ((dateCount ?? 1) > 1) {
    return { label: "Mehrere Termine", kind: "status", statusTone: "teal" };
  }

  if (status === "announcement") {
    return { label: "Neu", kind: "status", statusTone: "teal" };
  }

  return null;
}
