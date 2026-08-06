import { describe, expect, it } from "vitest";

/**
 * Pure presence transition rules mirrored from scanTicket —
 * OUT must leave "in", re-IN must leave "out".
 */
function nextPresence(
  action: "in" | "out",
  current: "not_arrived" | "in" | "out",
): { ok: true; next: "in" | "out" } | { ok: false; reason: string } {
  if (action === "in" && current === "in") return { ok: false, reason: "already_in" };
  if (action === "out" && current === "out") return { ok: false, reason: "already_out" };
  if (action === "out" && current === "not_arrived") return { ok: false, reason: "not_arrived" };
  return { ok: true, next: action === "in" ? "in" : "out" };
}

function applyStats(
  tickets: Array<"not_arrived" | "in" | "out">,
): { currentlyIn: number; currentlyOut: number; notArrived: number; firstCheckedIn: number } {
  return {
    currentlyIn: tickets.filter((p) => p === "in").length,
    currentlyOut: tickets.filter((p) => p === "out").length,
    notArrived: tickets.filter((p) => p === "not_arrived").length,
    firstCheckedIn: tickets.filter((p) => p === "in" || p === "out").length,
  };
}

describe("checkin presence", () => {
  it("check-out decrements Im Haus and increments OUT", () => {
    let tickets: Array<"not_arrived" | "in" | "out"> = ["in", "in", "in", "not_arrived"];
    const before = applyStats(tickets);
    expect(before.currentlyIn).toBe(3);

    const flip = nextPresence("out", tickets[0]!);
    expect(flip.ok).toBe(true);
    if (flip.ok) tickets[0] = flip.next;

    const after = applyStats(tickets);
    expect(after.currentlyIn).toBe(2);
    expect(after.currentlyOut).toBe(1);
    expect(after.notArrived).toBe(1);
    expect(after.firstCheckedIn).toBe(3);
  });

  it("re-check-in after out increments Im Haus again", () => {
    let tickets: Array<"not_arrived" | "in" | "out"> = ["out", "in"];
    const flip = nextPresence("in", tickets[0]!);
    expect(flip.ok).toBe(true);
    if (flip.ok) tickets[0] = flip.next;
    expect(applyStats(tickets).currentlyIn).toBe(2);
    expect(applyStats(tickets).currentlyOut).toBe(0);
  });

  it("rejects duplicate in/out", () => {
    expect(nextPresence("in", "in").ok).toBe(false);
    expect(nextPresence("out", "out").ok).toBe(false);
    expect(nextPresence("out", "not_arrived").ok).toBe(false);
  });
});
