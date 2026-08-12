import { describe, expect, it } from "vitest";
import {
  buildEventOrganizerIdentity,
  formatOrganizerDisplayName,
  resolveOrganizerBrandName,
} from "@/lib/legal/event-organizer";
import type { Organization, OrganizationSettings } from "@prisma/client";

const org = { id: "o1", name: "Ticketfeeling", slug: "schlagerfeeling" } as Organization;
const settings = {
  legalName: "Peter Loder",
  email: "info@schlagerfeeling.de",
  supportEmail: "support@schlagerfeeling.de",
  phone: null,
  homepage: "https://schlagerfeeling.de",
  street: "Zweibrückenstraße",
  houseNumber: "1",
  postalCode: "84034",
  city: "Landshut",
  country: "DE",
  data: {
    legalPersonName: "Peter Loder",
    tradeName: "Ticketfeeling",
    brandName: "SCHLAGERfeeling",
  },
  publicCompanyAddress: null,
  billingCompanyAddress: null,
  legalForm: "Einzelunternehmen",
} as unknown as OrganizationSettings;

describe("formatOrganizerDisplayName", () => {
  it("formats person and brand with parentheses", () => {
    expect(formatOrganizerDisplayName("Peter Loder", "SCHLAGERfeeling")).toBe(
      "Peter Loder (SCHLAGERfeeling)",
    );
  });
});

describe("resolveOrganizerBrandName", () => {
  it("skips platform brand Ticketfeeling", () => {
    expect(
      resolveOrganizerBrandName({ brandName: "Ticketfeeling", tradeName: "SCHLAGERfeeling" }),
    ).toBe("SCHLAGERfeeling");
  });
});

describe("buildEventOrganizerIdentity", () => {
  it("defaults to Peter Loder (SCHLAGERfeeling), not platform org.name", () => {
    const id = buildEventOrganizerIdentity(org, settings, null);
    expect(id.displayName).toBe("Peter Loder (SCHLAGERfeeling)");
    expect(id.displayName.toLowerCase()).not.toContain("ticketfeeling");
    expect(id.brandName).toBe("SCHLAGERfeeling");
  });

  it("applies per-event overrides without hardcoding Ticketfeeling as Veranstalter", () => {
    const id = buildEventOrganizerIdentity(org, settings, {
      organizerName: "Andere Firma GmbH",
      organizerContact: "Max Mustermann",
      organizerStreet: "Musterstraße",
      organizerHouseNumber: "9",
      organizerPostalCode: "80331",
      organizerCity: "München",
      organizerEmail: "info@andere.de",
    });
    expect(id.displayName).toBe("Max Mustermann (Andere Firma GmbH)");
    expect(id.city).toBe("München");
    expect(id.email).toBe("info@andere.de");
    expect(id.displayName.toLowerCase()).not.toContain("ticketfeeling");
  });

  it("uses organizerName alone when only that is set", () => {
    const id = buildEventOrganizerIdentity(org, settings, {
      organizerName: "Special Guest Veranstaltung",
    });
    expect(id.displayName).toBe("Special Guest Veranstaltung");
  });
});
