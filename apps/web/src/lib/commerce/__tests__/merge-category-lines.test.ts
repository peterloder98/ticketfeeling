import { describe, expect, it } from "vitest";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";

describe("mergeSameCategoryLines", () => {
  it("merges same category and unit price", () => {
    const merged = mergeSameCategoryLines([
      {
        quantity: 1,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 5900,
      },
      {
        quantity: 2,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 11800,
      },
    ]);
    expect(merged).toEqual([
      {
        quantity: 3,
        categoryLabel: "Kategorie 3",
        unitPriceCents: 5900,
        lineGrossCents: 17700,
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
});
