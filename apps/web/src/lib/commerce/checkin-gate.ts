/**
 * Production check-in unlock rules.
 *
 * Real presence changes (in/out) are allowed when either:
 * 1. Effective doors open time is reached (category override or event `doorsOpenAt`), or
 * 2. Sale was closed early by admin (`saleClosedEarly`).
 *
 * Before that, only lookup / Testmodus (`info`) is allowed.
 * Events without doors stay locked until sale is closed early
 * (so organizers set Einlassbeginn or explicitly end sale).
 */

export type CheckinGateEvent = {
  doorsOpenAt?: Date | null;
  saleClosedEarly?: boolean | null;
};

export type CheckinGateResult =
  | { open: true; reason: "doors_open" | "sale_closed_early" }
  | { open: false; reason: "doors_not_open" | "doors_not_set" };

export function evaluateCheckinGate(
  event: CheckinGateEvent,
  now: Date = new Date(),
): CheckinGateResult {
  if (event.saleClosedEarly) {
    return { open: true, reason: "sale_closed_early" };
  }
  if (!event.doorsOpenAt) {
    return { open: false, reason: "doors_not_set" };
  }
  if (event.doorsOpenAt.getTime() <= now.getTime()) {
    return { open: true, reason: "doors_open" };
  }
  return { open: false, reason: "doors_not_open" };
}

export function isProductionCheckinOpen(
  event: CheckinGateEvent,
  now: Date = new Date(),
): boolean {
  return evaluateCheckinGate(event, now).open;
}

/** Calm German copy for locked scanner / blocked mutating scans. */
export function checkinLockedMessage(
  event: CheckinGateEvent,
  now: Date = new Date(),
): string {
  const gate = evaluateCheckinGate(event, now);
  if (gate.open) return "";
  if (gate.reason === "doors_not_set") {
    return "Einlass noch nicht geöffnet — Einlassbeginn ist nicht hinterlegt.";
  }
  return "NOCH ZU FRÜH";
}
