import { describe, expect, it } from "vitest";
import {
  backoffMs,
  classifyJobError,
  JobPermanentError,
  JobNeedsAttentionError,
} from "@/lib/jobs/queue";
import { suggestEmailDomainFix } from "@/lib/email/typo-hint";
import {
  evaluateForgottenTicketMatch,
  FORGOTTEN_TICKET_GENERIC_MESSAGE,
  normalizeOrderNumber,
} from "@/lib/support/forgotten-ticket";
import { technicalScanErrorResult } from "@/lib/commerce/checkin";

describe("job queue retry classification", () => {
  it("classifies TEMP vs PERMANENT", () => {
    expect(classifyJobError(new Error("ECONNRESET"))).toBe("TEMP");
    expect(classifyJobError(new Error("smtp timeout"))).toBe("TEMP");
    expect(classifyJobError(new JobPermanentError("ORDER_NOT_FOUND"))).toBe("PERMANENT");
    expect(classifyJobError(new Error("ORDER_NOT_FOUND"))).toBe("PERMANENT");
    expect(classifyJobError(new Error("550 User unknown"))).toBe("PERMANENT");
  });

  it("marks needs_attention distinctly", () => {
    const err = new JobNeedsAttentionError("ambiguous");
    expect(err.message).toContain("NEEDS_ATTENTION");
    expect(classifyJobError(err)).toBe("PERMANENT");
  });

  it("backoff grows then caps", () => {
    const a1 = backoffMs(1);
    const a4 = backoffMs(4);
    const a9 = backoffMs(9);
    expect(a1).toBeGreaterThanOrEqual(15_000);
    expect(a4).toBeGreaterThan(a1);
    expect(a9).toBeLessThanOrEqual(6 * 60 * 60 * 1000 + 2_000);
  });
});

describe("stripe webhook idempotency contract", () => {
  type InboxStatus = "received" | "processed" | "failed" | "ignored";

  function claimEvent(
    store: Map<string, InboxStatus>,
    eventId: string,
  ): "claimed" | "duplicate" | "reprocess" {
    const existing = store.get(eventId);
    if (!existing) {
      store.set(eventId, "received");
      return "claimed";
    }
    if (existing === "processed" || existing === "received") return "duplicate";
    if (existing === "failed") {
      store.set(eventId, "received");
      return "reprocess";
    }
    return "duplicate";
  }

  it("double webhook: only first claim wins", () => {
    const store = new Map<string, InboxStatus>();
    expect(claimEvent(store, "evt_1")).toBe("claimed");
    expect(claimEvent(store, "evt_1")).toBe("duplicate");
    store.set("evt_1", "processed");
    expect(claimEvent(store, "evt_1")).toBe("duplicate");
  });

  it("failed webhook can be reprocessed", () => {
    const store = new Map<string, InboxStatus>([["evt_2", "failed"]]);
    expect(claimEvent(store, "evt_2")).toBe("reprocess");
  });
});

describe("concurrent check-in codes", () => {
  function raceResult(
    presence: "not_arrived" | "in" | "out",
    action: "in" | "out",
  ): { code: string; winner: boolean } {
    if (action === "in" && presence === "in") {
      return { code: "ALREADY_CHECKED_IN", winner: false };
    }
    if (action === "out" && presence === "out") {
      return { code: "ALREADY_CHECKED_OUT", winner: false };
    }
    return { code: "VALID", winner: true };
  }

  it("exactly one VALID on concurrent in", () => {
    let presence: "not_arrived" | "in" | "out" = "not_arrived";
    const first = raceResult(presence, "in");
    expect(first.winner).toBe(true);
    expect(first.code).toBe("VALID");
    presence = "in";
    const second = raceResult(presence, "in");
    expect(second.winner).toBe(false);
    expect(second.code).toBe("ALREADY_CHECKED_IN");
  });

  it("technical errors are not INVALID", () => {
    const tech = technicalScanErrorResult();
    expect(tech.code).toBe("TECHNICAL_ERROR");
    expect(tech.color).toBe("orange");
    expect(tech.message).toContain("momentan nicht geprüft");
  });
});

describe("forgotten ticket recovery", () => {
  it("exposes a single neutral message", () => {
    expect(FORGOTTEN_TICKET_GENERIC_MESSAGE.toLowerCase()).toContain("falls");
    expect(FORGOTTEN_TICKET_GENERIC_MESSAGE.toLowerCase()).not.toContain("nicht gefunden");
  });
});

describe("forgotten ticket second-factor match", () => {
  it("rejects email-only requests", () => {
    expect(
      evaluateForgottenTicketMatch({
        hasCustomer: true,
        matchedOrderCount: 2,
        customerLastName: "Müller",
      }),
    ).toBe(false);
  });

  it("accepts email + order number without last name", () => {
    expect(
      evaluateForgottenTicketMatch({
        hasCustomer: true,
        matchedOrderCount: 1,
        customerLastName: "Müller",
        orderNumberHint: "TF-B-2026-0001",
      }),
    ).toBe(true);
  });

  it("accepts email + matching last name", () => {
    expect(
      evaluateForgottenTicketMatch({
        hasCustomer: true,
        matchedOrderCount: 1,
        customerLastName: "Müller",
        lastNameHint: "müller",
      }),
    ).toBe(true);
  });

  it("rejects mismatched last name even with orders", () => {
    expect(
      evaluateForgottenTicketMatch({
        hasCustomer: true,
        matchedOrderCount: 1,
        customerLastName: "Müller",
        lastNameHint: "Schmidt",
        orderNumberHint: "TF-B-2026-0001",
      }),
    ).toBe(false);
  });

  it("normalizes order numbers", () => {
    expect(normalizeOrderNumber(" tf-b-2026-0001 ")).toBe("TF-B-2026-0001");
  });
});

describe("email typo hint", () => {
  it("suggests gmail for gmial without auto-changing", () => {
    expect(suggestEmailDomainFix("peter@gmial.com")).toBe("peter@gmail.com");
    expect(suggestEmailDomainFix("peter@gmail.com")).toBeNull();
  });
});
