/**
 * Merge purchase/cart summary lines that share the same category label and unit price.
 * Different categories or different prices stay as separate lines.
 */

export type MergeableCategoryLine = {
  quantity: number;
  /** Display name (category.name or categorySnapshot) */
  categoryLabel: string;
  unitPriceCents: number;
  lineGrossCents: number;
};

export function mergeSameCategoryLines<T extends MergeableCategoryLine>(
  lines: T[],
): T[] {
  const merged: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const line of lines) {
    const key = `${line.categoryLabel}\0${line.unitPriceCents}`;
    const existingIdx = indexByKey.get(key);
    if (existingIdx == null) {
      indexByKey.set(key, merged.length);
      merged.push({ ...line });
      continue;
    }
    const prev = merged[existingIdx];
    merged[existingIdx] = {
      ...prev,
      quantity: prev.quantity + line.quantity,
      lineGrossCents: prev.lineGrossCents + line.lineGrossCents,
    };
  }

  return merged;
}
