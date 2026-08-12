import { describe, expect, it } from "vitest";
import {
  eventInheritsTourDetails,
  resolveEffectiveEventDetails,
} from "@/lib/commerce/effective-event-details";

describe("eventInheritsTourDetails", () => {
  it("inherits when tour linked and flag true/undefined", () => {
    expect(
      eventInheritsTourDetails({ tourId: "t1", detailsUseTourDefaults: true }),
    ).toBe(true);
    expect(eventInheritsTourDetails({ tourId: "t1", detailsUseTourDefaults: undefined })).toBe(
      true,
    );
  });

  it("does not inherit without tour or when overridden", () => {
    expect(
      eventInheritsTourDetails({ tourId: null, detailsUseTourDefaults: true }),
    ).toBe(false);
    expect(
      eventInheritsTourDetails({ tourId: "t1", detailsUseTourDefaults: false }),
    ).toBe(false);
  });
});

describe("resolveEffectiveEventDetails", () => {
  it("uses tour copy when inheriting", () => {
    const resolved = resolveEffectiveEventDetails({
      tourId: "t1",
      detailsUseTourDefaults: true,
      name: "Event name",
      shortDescription: "Event short",
      description: "Event long",
      tour: {
        name: "Tour name",
        shortDescription: "Tour short",
        description: "Tour long",
      },
    });
    expect(resolved).toEqual({
      name: "Tour name",
      shortDescription: "Tour short",
      description: "Tour long",
      inherits: true,
    });
  });

  it("uses event copy when overridden", () => {
    const resolved = resolveEffectiveEventDetails({
      tourId: "t1",
      detailsUseTourDefaults: false,
      name: "Event name",
      shortDescription: "Event short",
      description: "Event long",
      tour: {
        name: "Tour name",
        shortDescription: "Tour short",
        description: "Tour long",
      },
    });
    expect(resolved.inherits).toBe(false);
    expect(resolved.name).toBe("Event name");
    expect(resolved.shortDescription).toBe("Event short");
  });
});
