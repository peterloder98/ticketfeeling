/**
 * Merge purchase/cart summary lines that share the same event, category label, and unit price.
 * Different categories, different prices, or different events stay as separate lines.
 */

export type MergeableCategoryLine = {
  quantity: number;
  /** Display name (category.name or categorySnapshot) */
  categoryLabel: string;
  unitPriceCents: number;
  lineGrossCents: number;
  /** eventId (preferred) or event name — different events never merge */
  eventKey?: string | null;
  /** Optional money fields summed when both sides have them (invoices) */
  lineNetCents?: number;
  lineTaxCents?: number;
  /** Optional seat rows — concatenated when merging (checkout summary) */
  seats?: unknown[];
};

function lineKey(line: {
  eventKey?: string | null;
  categoryLabel: string;
  unitPriceCents: number;
}) {
  return `${line.eventKey ?? ""}\0${line.categoryLabel}\0${line.unitPriceCents}`;
}

export function mergeSameCategoryLines<T extends MergeableCategoryLine>(
  lines: T[],
): T[] {
  const merged: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const line of lines) {
    const key = lineKey(line);
    const existingIdx = indexByKey.get(key);
    if (existingIdx == null) {
      indexByKey.set(key, merged.length);
      merged.push({ ...line });
      continue;
    }
    const prev = merged[existingIdx];
    const next: T = {
      ...prev,
      quantity: prev.quantity + line.quantity,
      lineGrossCents: prev.lineGrossCents + line.lineGrossCents,
    };
    if (typeof prev.lineNetCents === "number" && typeof line.lineNetCents === "number") {
      next.lineNetCents = prev.lineNetCents + line.lineNetCents;
    }
    if (typeof prev.lineTaxCents === "number" && typeof line.lineTaxCents === "number") {
      next.lineTaxCents = prev.lineTaxCents + line.lineTaxCents;
    }
    if (Array.isArray(prev.seats) || Array.isArray(line.seats)) {
      next.seats = [
        ...(Array.isArray(prev.seats) ? prev.seats : []),
        ...(Array.isArray(line.seats) ? line.seats : []),
      ];
    }
    merged[existingIdx] = next;
  }

  return merged;
}

/** Ticket list headers: one block per event + category + unit price, tickets concatenated. */
export function mergeOrderTicketPositions<
  T extends {
    quantity: number;
    categorySnapshot: string;
    eventNameSnapshot: string;
    unitPriceCents: number;
    eventKey?: string | null;
    tickets: unknown[];
  },
>(positions: T[]): T[] {
  const merged: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const pos of positions) {
    const key = lineKey({
      eventKey: pos.eventKey ?? pos.eventNameSnapshot,
      categoryLabel: pos.categorySnapshot,
      unitPriceCents: pos.unitPriceCents,
    });
    const existingIdx = indexByKey.get(key);
    if (existingIdx == null) {
      indexByKey.set(key, merged.length);
      merged.push({ ...pos, tickets: [...pos.tickets] });
      continue;
    }
    const prev = merged[existingIdx];
    merged[existingIdx] = {
      ...prev,
      quantity: prev.quantity + pos.quantity,
      tickets: [...prev.tickets, ...pos.tickets],
    };
  }

  return merged;
}
