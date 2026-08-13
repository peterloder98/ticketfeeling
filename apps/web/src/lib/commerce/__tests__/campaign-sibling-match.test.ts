import { describe, expect, it } from "vitest";
import { campaignsMatch } from "@/lib/commerce/campaign-sibling-match";

const base = {
  name: "Frühbucher",
  type: "fixed" as const,
  value: 1000,
  channels: "both",
  applyMode: "order" as const,
  minQuantity: 2,
  badgeLabel: "10 € sparen",
  validFrom: new Date("2026-09-01T10:00:00.000Z"),
};

describe("campaignsMatch", () => {
  it("matches by campaignGroupId when both set", () => {
    expect(
      campaignsMatch(
        { ...base, campaignGroupId: "g1", name: "Other" },
        { ...base, campaignGroupId: "g1", value: 9999 },
      ),
    ).toBe(true);
  });

  it("falls back to content when group ids missing", () => {
    expect(
      campaignsMatch(
        { ...base, campaignGroupId: null },
        {
          ...base,
          campaignGroupId: null,
          validFrom: new Date("2026-09-01T10:00:00.000Z"),
          // different until is ignored by design
        },
      ),
    ).toBe(true);
  });

  it("does not content-match when amount differs", () => {
    expect(
      campaignsMatch(
        { ...base, campaignGroupId: null },
        { ...base, campaignGroupId: null, value: 500 },
      ),
    ).toBe(false);
  });

  it("still content-matches when only validFrom differs (legacy siblings)", () => {
    expect(
      campaignsMatch(
        { ...base, campaignGroupId: null },
        { ...base, campaignGroupId: null, validFrom: new Date("2026-09-02T10:00:00.000Z") },
      ),
    ).toBe(true);
  });
});
