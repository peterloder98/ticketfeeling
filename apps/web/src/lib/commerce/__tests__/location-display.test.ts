import { describe, expect, it } from "vitest";
import {
  formatLocationAddressLine,
  formatLocationPlaceDisplay,
  formatLocationStreetLine,
} from "@/lib/commerce/location-display";

describe("formatLocationStreetLine", () => {
  it("joins street and house number", () => {
    expect(
      formatLocationStreetLine({
        name: "Bürgerhaus Löwenberg",
        street: "Am Waldstadion",
        houseNumber: "6",
      }),
    ).toBe("Am Waldstadion 6");
  });

  it("returns null when street equals venue name", () => {
    expect(
      formatLocationStreetLine({
        name: "Bürgerhaus Löwenberg",
        street: "Bürgerhaus Löwenberg",
        houseNumber: null,
      }),
    ).toBeNull();
  });

  it("returns null when street is empty", () => {
    expect(
      formatLocationStreetLine({
        name: "Kent Club",
        street: null,
        houseNumber: null,
      }),
    ).toBeNull();
  });
});

describe("formatLocationPlaceDisplay", () => {
  it("formats Name · Street, PLZ City", () => {
    expect(
      formatLocationPlaceDisplay({
        name: "Bürgerhaus Löwenberg",
        street: "Am Waldstadion",
        houseNumber: "6",
        postalCode: "16775",
        city: "Löwenberger Land",
      }),
    ).toEqual({
      name: "Bürgerhaus Löwenberg",
      addressLine: "Am Waldstadion 6, 16775 Löwenberger Land",
      label: "Bürgerhaus Löwenberg · Am Waldstadion 6, 16775 Löwenberger Land",
    });
  });

  it("does not repeat name when street equals name", () => {
    expect(
      formatLocationPlaceDisplay({
        name: "Kent Club",
        street: "Kent Club",
        postalCode: "20359",
        city: "Hamburg",
      }),
    ).toEqual({
      name: "Kent Club",
      addressLine: "20359 Hamburg",
      label: "Kent Club · 20359 Hamburg",
    });
  });

  it("falls back to Name · PLZ City when street empty", () => {
    expect(formatLocationAddressLine({ name: "Halle", postalCode: "84028", city: "Landshut" })).toBe(
      "84028 Landshut",
    );
    expect(
      formatLocationPlaceDisplay({
        name: "Halle",
        street: "",
        postalCode: "84028",
        city: "Landshut",
      }).label,
    ).toBe("Halle · 84028 Landshut");
  });
});
