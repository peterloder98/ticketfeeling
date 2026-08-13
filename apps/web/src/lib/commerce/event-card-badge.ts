export type EventCardBadge = {
  label: string;
  className: string;
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
    return { label: "Ausverkauft", className: "bg-white text-[var(--tf-navy)]" };
  }

  if (showRemainingAvailability && vipNearlySoldOut) {
    return {
      label: "VIP fast ausverkauft",
      className: "bg-[var(--tf-gold)] text-[var(--tf-navy)]",
    };
  }

  if (
    showRemainingAvailability &&
    remainingTickets != null &&
    capacity != null &&
    capacity > 0
  ) {
    const ratio = remainingTickets / capacity;
    if (remainingTickets <= 25 || ratio <= 0.12) {
      return { label: "Fast ausverkauft", className: "bg-[#fff4e8] text-[#9a4d0a]" };
    }
    if (remainingTickets <= 80 || ratio <= 0.35) {
      return {
        label: "Nur noch wenige Tickets",
        className: "bg-[rgba(20,184,166,0.95)] text-white",
      };
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
    return { label, className: "bg-[var(--tf-sale)] text-white" };
  }

  if ((dateCount ?? 1) > 1) {
    return {
      label: "Mehrere Termine",
      className: "bg-white text-[var(--tf-navy)]",
    };
  }

  if (status === "announcement") {
    return { label: "Neu", className: "bg-white text-[var(--tf-navy)]" };
  }

  return null;
}
