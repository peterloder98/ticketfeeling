import { describe, expect, it } from "vitest";
import { formatEventOptionLabel } from "@/lib/admin/event-option-label";
import {
  boxOfficeSaleStatusLabel,
  paymentMethodLabel,
} from "@/lib/commerce/channels";

describe("formatEventOptionLabel", () => {
  it("includes date and city so duplicate names stay distinct", () => {
    const label = formatEventOptionLabel({
      name: "SCHLAGERfeeling Weihnachtstraum",
      eventStartsAt: new Date("2026-12-12T18:00:00.000Z"),
      locationCity: "Berlin",
    });
    expect(label).toContain("SCHLAGERfeeling Weihnachtstraum");
    expect(label).toContain("Berlin");
    expect(label).toMatch(/\d/);
  });

  it("falls back to name only when meta is missing", () => {
    expect(formatEventOptionLabel({ name: "Open Air" })).toBe("Open Air");
  });
});

describe("consignment channel labels", () => {
  it("labels consignment payment and status in German", () => {
    expect(paymentMethodLabel("consignment")).toBe("Kontingent Vorverkaufsstelle");
    expect(
      boxOfficeSaleStatusLabel({ paymentMethod: "consignment" }),
    ).toBe("Kontingent (Vorabbuchung)");
  });
});
