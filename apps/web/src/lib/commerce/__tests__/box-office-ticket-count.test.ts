import { describe, expect, it } from "vitest";
import { countBoxOfficeSaleTickets } from "@/lib/commerce/box-office-ticket-count";

describe("countBoxOfficeSaleTickets", () => {
  it("counts non-voided ticket rows", () => {
    expect(
      countBoxOfficeSaleTickets({
        tickets: [{ status: "active" }, { status: "active" }, { status: "voided" }],
        items: [{ quantity: 10 }],
        status: "fulfilled",
      }),
    ).toBe(2);
  });

  it("shows 0 when all tickets are voided", () => {
    expect(
      countBoxOfficeSaleTickets({
        tickets: [{ status: "voided" }, { status: "voided" }],
        items: [{ quantity: 2 }],
        status: "cancelled",
        voidedAt: new Date(),
      }),
    ).toBe(0);
  });

  it("falls back to item quantities when tickets were never minted", () => {
    expect(
      countBoxOfficeSaleTickets({
        tickets: [],
        items: [{ quantity: 2 }, { quantity: 2 }, { quantity: 2 }],
        status: "fulfilled",
      }),
    ).toBe(6);
  });

  it("does not fall back for cancelled sales without tickets", () => {
    expect(
      countBoxOfficeSaleTickets({
        tickets: [],
        items: [{ quantity: 2 }],
        status: "cancelled",
        voidedAt: new Date(),
      }),
    ).toBe(0);
  });
});
