"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EventCategoriesPanel,
  type EventCategoryRow,
} from "@/components/admin/event-categories-panel";
import {
  EventSeatingAssignmentPanel,
  type AssignmentCategory,
} from "@/components/admin/event-seating-assignment-panel";

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
      c.categoryKind === "standing" ||
        c.categoryKind === "free_choice" ||
        // freeSeating may be absent on SSR rows; infer from kind when needed
        (c as { freeSeating?: boolean }).freeSeating,
    ),
    categoryKind: c.categoryKind ?? "standard",
  }));
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
}: {
  eventId: string;
  initialCategories: EventCategoryRow[];
  templates: Template[];
  canWrite: boolean;
  salesReleased?: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const onAssignmentCategoriesChange = useCallback((next: AssignmentCategory[]) => {
    setCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const merged: EventCategoryRow[] = [];
      for (const a of next) {
        const existing = byId.get(a.id);
        if (existing) {
          merged.push({
            ...existing,
            name: a.name,
            color: a.color,
            categoryKind: a.categoryKind,
          });
          byId.delete(a.id);
        } else {
          // Newly created on the plan — stub until full fields are edited below.
          merged.push({
            id: a.id,
            name: a.name,
            description: null,
            priceGrossCents: 0,
            capacity: 0,
            maxPerOrder: 10,
            categoryKind: a.categoryKind,
            companionFree: false,
            color: a.color,
            pools: [
              { channel: "online", soldQuantity: 0, heldQuantity: 0, capacity: 0 },
              { channel: "box_office", soldQuantity: 0, heldQuantity: 0, capacity: 0 },
            ],
          });
        }
      }
      // Keep free-seating / standing categories that aren't in assignment paint list.
      for (const leftover of byId.values()) {
        merged.push(leftover);
      }
      return merged;
    });
  }, []);

  return (
    <div className="space-y-4">
      <EventSeatingAssignmentPanel
        eventId={eventId}
        canWrite={canWrite}
        categories={toAssignmentCategories(categories)}
        onCategoriesChange={onAssignmentCategoriesChange}
      />
      <EventCategoriesPanel
        eventId={eventId}
        categories={categories}
        onCategoriesChange={setCategories}
        templates={templates}
        canWrite={canWrite}
        salesReleased={salesReleased}
      />
    </div>
  );
}
