import { describe, expect, it } from "vitest";
import { buildEventOrganizerIdentity } from "@/lib/legal/event-organizer";
import type { Organization, OrganizationSettings } from "@prisma/client";

const org = { id: "o1", name: "SCHLAGERfeeling", slug: "schlagerfeeling" } as Organization;
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
  data: { legalPersonName: "Peter Loder", tradeName: "SCHLAGERfeeling", brandName: "SCHLAGERfeeling" },
  publicCompanyAddress: null,
  billingCompanyAddress: null,
  legalForm: "Einzelunternehmen",
} as unknown as OrganizationSettings;

describe("buildEventOrganizerIdentity", () => {
  it("defaults to organization seller identity", () => {
    const id = buildEventOrganizerIdentity(org, settings, null);
    expect(id.displayName).toContain("Peter Loder");
    expect(id.tradeName).toBe("SCHLAGERfeeling");
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
    expect(id.displayName).toContain("Andere Firma GmbH");
    expect(id.displayName).toContain("Max Mustermann");
    expect(id.city).toBe("München");
    expect(id.email).toBe("info@andere.de");
    expect(id.displayName.toLowerCase()).not.toContain("ticketfeeling");
  });
});
