import { describe, expect, it } from "vitest";
import {
  mergeOrderTicketPositions,
  mergeSameCategoryLines,
} from "@/lib/commerce/merge-category-lines";

describe("mergeSameCategoryLines", () => {
  it("merges same category and unit price", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
        eventKey: "evt-1",
      },
      {
        quantity: 2,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 11800,
        eventKey: "evt-1",
      },
    ]);
    expect(merged).toEqual([
      {
        quantity: 3,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 17700,
        eventKey: "evt-1",
      },
    ]);
  });

  it("keeps different prices as separate lines", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
      },
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 6900,
        lineGrossCents: 6900,
      },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps different categories separate", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kategorie 2",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
      },
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
      },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps same category label on different events separate", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
        eventKey: "evt-a",
      },
      {
        quantity: 2,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 11800,
        eventKey: "evt-b",
      },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("sums optional net/tax fields", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kat",
        unitPriceCents: 1000,
        lineGrossCents: 1000,
        lineNetCents: 935,
        lineTaxCents: 65,
      },
      {
        quantity: 1,
        categoryLabel: "Kat",
        unitPriceCents: 1000,
        lineGrossCents: 1000,
        lineNetCents: 935,
        lineTaxCents: 65,
      },
    ]);
    expect(merged).toEqual([
      {
        quantity: 2,
        categoryLabel: "Kat",
        unitPriceCents: 1000,
        lineGrossCents: 2000,
        lineNetCents: 1870,
        lineTaxCents: 130,
      },
    ]);
  });
});

describe("mergeOrderTicketPositions", () => {
  it("merges headers and concatenates tickets", () => {
    const merged = mergeOrderTicketPositions([
      {
        id: "a",
        quantity: 1,
        categorySnapshot: "Kategorie 3",
        eventNameSnapshot: "Konzert",
        unitPriceCents: 5900,
        eventKey: "evt-1",
        tickets: [{ id: "t1" }],
      },
      {
        id: "b",
        quantity: 2,
        categorySnapshot: "Kategorie 3",
        eventNameSnapshot: "Konzert",
        unitPriceCents: 5900,
        eventKey: "evt-1",
        tickets: [{ id: "t2" }, { id: "t3" }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(3);
    expect(merged[0]?.tickets).toEqual([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  });
});
