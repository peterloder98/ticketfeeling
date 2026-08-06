import { describe, expect, it } from "vitest";
import {
  isActiveTicketStatus,
  isAnonymousBoxOfficeCustomer,
  isWalkInCustomerEmail,
} from "@/lib/commerce/customers";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";

describe("customers CRM helpers", () => {
  it("detects walk-in placeholder emails", () => {
    expect(isWalkInCustomerEmail("kasse+123@ticketfeeling.local")).toBe(true);
    expect(isWalkInCustomerEmail("ferdinand@example.com")).toBe(false);
  });

  it("hides anonymous Tageskasse guests", () => {
    expect(
      isAnonymousBoxOfficeCustomer({
        email: "kasse+1@ticketfeeling.local",
        firstName: "Tageskasse",
        lastName: "Gast",
      }),
    ).toBe(true);
    expect(
      isAnonymousBoxOfficeCustomer({
        email: "real@example.com",
        firstName: "Tageskasse",
        lastName: "Gast",
      }),
    ).toBe(true);
    expect(
      isAnonymousBoxOfficeCustomer({
        email: "ferdinand@example.com",
        firstName: "Ferdinand",
        lastName: "Stier",
      }),
    ).toBe(false);
  });

  it("only counts active tickets", () => {
    expect(isActiveTicketStatus("active")).toBe(true);
    expect(isActiveTicketStatus("voided")).toBe(false);
    expect(isActiveTicketStatus("cancelled")).toBe(false);
  });
});

describe("formalGermanGreeting", () => {
  it("uses gender over salutation", () => {
    expect(
      formalGermanGreeting({
        gender: "male",
        salutation: "frau",
        firstName: "Ferdinand",
        lastName: "Stier",
      }),
    ).toBe("Sehr geehrter Herr Stier");
    expect(
      formalGermanGreeting({
        gender: "female",
        firstName: "Anna",
        lastName: "Müller",
      }),
    ).toBe("Sehr geehrte Frau Müller");
  });
});
