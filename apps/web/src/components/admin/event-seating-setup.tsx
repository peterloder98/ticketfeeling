"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EventCategoriesPanel,
  type EventCategoryRow,
} from "@/components/admin/event-categories-panel";
import {
  EventSeatingAssignmentPanel,
  type AssignmentCategory,
  type CreatedEventCategory,
} from "@/components/admin/event-seating-assignment-panel";
import { isPlanBackedTicketCategory } from "@/lib/seating/sync-category-capacity";

type Template = {
  id: string;
  name: string;
  priceGrossCents: number;
  capacity: number;
};

function toAssignmentCategories(rows: EventCategoryRow[]): AssignmentCategory[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    freeSeating: Boolean(
      c.freeSeating || c.categoryKind === "standing" || c.categoryKind === "free_choice",
    ),
    categoryKind: c.categoryKind ?? "standard",
  }));
}

function toEventCategoryRow(created: CreatedEventCategory): EventCategoryRow {
  const capacity = created.capacity ?? 0;
  return {
    id: created.id,
    name: created.name,
    description: created.description ?? null,
    priceGrossCents: created.priceGrossCents ?? 0,
    capacity,
    maxPerOrder: created.maxPerOrder ?? 10,
    categoryKind: created.categoryKind ?? "standard",
    companionFree: Boolean(created.companionFree),
    color: created.color,
    freeSeating: Boolean(created.freeSeating),
    pools: created.pools?.length
      ? created.pools
      : [
          { channel: "online", soldQuantity: 0, heldQuantity: 0, capacity },
          { channel: "box_office", soldQuantity: 0, heldQuantity: 0, capacity },
        ],
  };
}

/**
 * Saalplan paint/assign + editable Preiskategorien directly below,
 * sharing live category state so create-on-plan appears in the edit section
 * without a scroll jump or remount flash.
 */
export function EventSeatingSetup({
  eventId,
  initialCategories,
  templates,
  canWrite,
  salesReleased = false,
  seatingEnabled = false,
}: {
  eventId: string;
  initialCategories: EventCategoryRow[];
  templates: Template[];
  canWrite: boolean;
  salesReleased?: boolean;
  /** Venue plan + seating mode — plan-backed Kontingent only when true. */
  seatingEnabled?: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const onAssignmentCategoriesChange = useCallback((next: AssignmentCategory[]) => {
    setCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const merged: EventCategoryRow[] = [];
      const seen = new Set<string>();
      for (const a of next) {
        seen.add(a.id);
        const existing = byId.get(a.id);
        if (existing) {
          merged.push({
            ...existing,
            name: a.name,
            color: a.color,
            categoryKind: a.categoryKind,
            freeSeating: a.freeSeating,
          });
        } else {
          merged.push(toEventCategoryRow(a));
        }
      }
      for (const leftover of prev) {
        if (!seen.has(leftover.id)) merged.push(leftover);
      }
      return merged;
    });
  }, []);

  const onCategoryCreated = useCallback((created: CreatedEventCategory) => {
    const row = toEventCategoryRow(created);
    setCategories((prev) => {
      if (prev.some((c) => c.id === row.id)) {
        return prev.map((c) => (c.id === row.id ? { ...c, ...row, pools: row.pools } : c));
      }
      return [...prev, row];
    });
  }, []);

  const onCapacitiesChange = useCallback((caps: Record<string, number>) => {
    setCategories((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (!isPlanBackedTicketCategory(c)) return c;
        const capacity = caps[c.id] ?? 0;
        if (c.capacity === capacity) return c;
        changed = true;
        return {
          ...c,
          capacity,
          pools: c.pools.map((p) => ({
            ...p,
            capacity: Math.max(p.soldQuantity + p.heldQuantity, capacity),
          })),
        };
      });
      return changed ? next : prev;
    });
  }, []);

  return (
    <div className="space-y-4">
      <EventSeatingAssignmentPanel
        eventId={eventId}
        canWrite={canWrite}
        categories={toAssignmentCategories(categories)}
        onCategoriesChange={onAssignmentCategoriesChange}
        onCategoryCreated={onCategoryCreated}
        onCapacitiesChange={seatingEnabled ? onCapacitiesChange : undefined}
      />
      <EventCategoriesPanel
        eventId={eventId}
        categories={categories}
        onCategoriesChange={setCategories}
        templates={templates}
        canWrite={canWrite}
        salesReleased={salesReleased}
        seatingEnabled={seatingEnabled}
      />
    </div>
  );
}
