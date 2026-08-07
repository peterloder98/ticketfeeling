/** Event-level Sitzplatzoptimierung toggles — defaults keep existing events product-correct. */

export type SeatOptimizationSettings = {
  /** Zusammenhängende Plätze bei Bestplatz bevorzugen */
  preferContiguous: boolean;
  /** Neue Einzelplatzlücken verhindern (manual + Bestplatz scoring) */
  preventNewSingletonGaps: boolean;
  /** Intelligente Restplatzoptimierung */
  intelligentRemnantOptimization: boolean;
  /** Lückenregel automatisch lockern ab Auslastung (%) — sellable seats only */
  gapRuleRelaxOccupancyPercent: number;
};

export const DEFAULT_SEAT_OPTIMIZATION: SeatOptimizationSettings = {
  preferContiguous: true,
  preventNewSingletonGaps: true,
  intelligentRemnantOptimization: true,
  gapRuleRelaxOccupancyPercent: 90,
};

export function parseSeatOptimizationSettings(
  raw: Partial<{
    seatOptPreferContiguous: boolean | null;
    seatOptPreventNewSingletons: boolean | null;
    seatOptIntelligentRemnants: boolean | null;
    seatOptGapRelaxOccupancyPercent: number | null;
  }> | null | undefined,
): SeatOptimizationSettings {
  if (!raw) return { ...DEFAULT_SEAT_OPTIMIZATION };
  const pct = raw.seatOptGapRelaxOccupancyPercent;
  return {
    preferContiguous:
      typeof raw.seatOptPreferContiguous === "boolean"
        ? raw.seatOptPreferContiguous
        : DEFAULT_SEAT_OPTIMIZATION.preferContiguous,
    preventNewSingletonGaps:
      typeof raw.seatOptPreventNewSingletons === "boolean"
        ? raw.seatOptPreventNewSingletons
        : DEFAULT_SEAT_OPTIMIZATION.preventNewSingletonGaps,
    intelligentRemnantOptimization:
      typeof raw.seatOptIntelligentRemnants === "boolean"
        ? raw.seatOptIntelligentRemnants
        : DEFAULT_SEAT_OPTIMIZATION.intelligentRemnantOptimization,
    gapRuleRelaxOccupancyPercent:
      typeof pct === "number" && Number.isFinite(pct)
        ? Math.min(100, Math.max(0, Math.round(pct)))
        : DEFAULT_SEAT_OPTIMIZATION.gapRuleRelaxOccupancyPercent,
  };
}

export function seatOptFromFormData(formData: FormData): {
  seatOptPreferContiguous: boolean;
  seatOptPreventNewSingletons: boolean;
  seatOptIntelligentRemnants: boolean;
  seatOptGapRelaxOccupancyPercent: number;
} {
  // Checkboxes: present = on. When venue plan section absent, keep defaults via hidden "1".
  const hasPanel = formData.has("seatOptPanel");
  if (!hasPanel) {
    return {
      seatOptPreferContiguous: DEFAULT_SEAT_OPTIMIZATION.preferContiguous,
      seatOptPreventNewSingletons: DEFAULT_SEAT_OPTIMIZATION.preventNewSingletonGaps,
      seatOptIntelligentRemnants: DEFAULT_SEAT_OPTIMIZATION.intelligentRemnantOptimization,
      seatOptGapRelaxOccupancyPercent: DEFAULT_SEAT_OPTIMIZATION.gapRuleRelaxOccupancyPercent,
    };
  }
  const pctRaw = Number(
    String(formData.get("seatOptGapRelaxOccupancyPercent") ?? "90").replace(",", "."),
  );
  return {
    seatOptPreferContiguous: formData.get("seatOptPreferContiguous") === "on",
    seatOptPreventNewSingletons: formData.get("seatOptPreventNewSingletons") === "on",
    seatOptIntelligentRemnants: formData.get("seatOptIntelligentRemnants") === "on",
    seatOptGapRelaxOccupancyPercent: Number.isFinite(pctRaw)
      ? Math.min(100, Math.max(0, Math.round(pctRaw)))
      : 90,
  };
}
