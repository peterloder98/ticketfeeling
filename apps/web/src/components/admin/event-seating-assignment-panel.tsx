"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Unlock, Paintbrush, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { DEFAULT_CATEGORY_COLORS, resolveCategoryColor } from "@/lib/seating/layout-config";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import {
  DEFAULT_VIEW_ZOOM,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  VIEW_ZOOM_STEP,
  clampViewZoom,
  fitViewZoom,
  readableScalePxPerCm,
} from "@/lib/saalplan/view-zoom";
import { useCanvasPan } from "@/lib/saalplan/use-canvas-pan";
import { sellableSeatCountsByCategory } from "@/lib/seating/sync-category-capacity";

export type AssignmentCategory = {
  id: string;
  name: string;
  color: string | null;
  freeSeating: boolean;
  categoryKind: string;
};

type SeatRow = {
  id: string;
  seatKey: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  status: string;
  categoryId: string | null;
  locked: boolean;
};

type Mode = "assign" | "lock" | "unlock";
type Target = "seat" | "row" | "block";

const QUICK_COLORS = ["#14B8A6", "#0F2747", "#3B82F6", "#D6A642", ...DEFAULT_CATEGORY_COLORS].filter(
  (c, i, arr) => arr.indexOf(c) === i,
);


/**
 * Assign ticket categories on the event plan (block / row / seat),
 * create categories on the fly, lock/unlock for gradual seat release.
 */
export type CreatedEventCategory = AssignmentCategory & {
  description?: string | null;
  priceGrossCents?: number;
  capacity?: number;
  maxPerOrder?: number;
  companionFree?: boolean;
  pools?: { channel: string; soldQuantity: number; heldQuantity: number; capacity: number }[];
};

export function EventSeatingAssignmentPanel({
  eventId,
  canWrite,
  /** Shared categories from parent — keeps edit section below in sync. */
  categories: controlledCategories,
  onCategoriesChange,
  onCategoryCreated,
  /** Live Kontingent from assigned, not-locked seats — keeps Preiskategorien in sync. */
  onCapacitiesChange,
}: {
  eventId: string;
  canWrite: boolean;
  categories?: AssignmentCategory[];
  onCategoriesChange?: (categories: AssignmentCategory[]) => void;
  /** Full API category after quick-create — populates the edit section below. */
  onCategoryCreated?: (category: CreatedEventCategory) => void;
  onCapacitiesChange?: (capacities: Record<string, number>) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [localCategories, setLocalCategories] = useState<AssignmentCategory[]>([]);
  const [planObjects, setPlanObjects] = useState<
    ReturnType<typeof parseVenuePlanObjects>
  >([]);
  const [planSize, setPlanSize] = useState({ widthCm: 2000, depthCm: 1500 });
  const [venuePlanId, setVenuePlanId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("assign");
  const [target, setTarget] = useState<Target>("block");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#14B8A6");
  const [zoom, setZoom] = useState(DEFAULT_VIEW_ZOOM);
  const [viewport, setViewport] = useState({ w: 720, h: 420 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const { panning, panHandlers } = useCanvasPan(canvasRef);
  const initialLoadDone = useRef(false);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const patchQueueRef = useRef<
    Array<{ seatIds: string[]; categoryId?: string | null; locked?: boolean }>
  >([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const categories = controlledCategories ?? localCategories;

  const setCategories = useCallback(
    (next: AssignmentCategory[] | ((prev: AssignmentCategory[]) => AssignmentCategory[])) => {
      const resolved = typeof next === "function" ? next(categories) : next;
      if (onCategoriesChange) onCategoriesChange(resolved);
      else setLocalCategories(resolved);
    },
    [categories, onCategoriesChange],
  );

  const seatingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
      ),
    [categories],
  );

  const seatingCategoryIdsKey = seatingCategories.map((c) => c.id).join(",");

  // Push derived Kontingent into shared category state whenever seats or categories change.
  useEffect(() => {
    if (!onCapacitiesChange || !seatingCategoryIdsKey) return;
    const ids = seatingCategoryIdsKey.split(",");
    onCapacitiesChange(sellableSeatCountsByCategory(seats, ids));
  }, [seats, seatingCategoryIdsKey, onCapacitiesChange]);

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    seatingCategories.forEach((c, i) => {
      map.set(c.id, resolveCategoryColor(c.color, i));
    });
    return map;
  }, [seatingCategories]);

  const seatsByBlock = useMemo(() => {
    const map = new Map<string, SeatRow[]>();
    for (const seat of seats) {
      const list = map.get(seat.blockObjectId) ?? [];
      list.push(seat);
      map.set(seat.blockObjectId, list);
    }
    return map;
  }, [seats]);

  const assignedCount = seats.filter((s) => s.categoryId).length;
  const unassignedCount = seats.length - assignedCount;
  const lockedCount = seats.filter((s) => s.locked).length;
  /** Assigned + unlocked + not sold — seats customers can buy from. */
  const onSaleCount = seats.filter(
    (s) => s.categoryId && !s.locked && s.status !== "sold",
  ).length;
  const lockableSeatIds = seats
    .filter((s) => !s.locked && s.status === "available")
    .map((s) => s.id);
  const unlockableSeatIds = seats
    .filter((s) => s.locked && s.status !== "sold")
    .map((s) => s.id);

  const applySeatingPayload = useCallback(
    (data: {
      enabled?: boolean;
      seats?: SeatRow[];
      categories?: AssignmentCategory[];
      venuePlan?: {
        id?: string;
        objects?: unknown;
        widthCm: number;
        depthCm: number;
      } | null;
    }) => {
      setEnabled(Boolean(data.enabled));
      if (data.seats) setSeats(data.seats);
      if (data.categories) {
        const next = data.categories.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          freeSeating: Boolean(c.freeSeating),
          categoryKind: c.categoryKind ?? "standard",
        }));
        if (onCategoriesChange) onCategoriesChange(next);
        else setLocalCategories(next);
      }
      if (data.venuePlan) {
        setVenuePlanId(data.venuePlan.id ?? null);
        setPlanObjects(parseVenuePlanObjects(data.venuePlan.objects));
        setPlanSize({
          widthCm: data.venuePlan.widthCm,
          depthCm: data.venuePlan.depthCm,
        });
      } else if (data.venuePlan === null) {
        setVenuePlanId(null);
      }
      const seatingCats = (data.categories ?? categories).filter(
        (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
      );
      if (seatingCats.length) {
        setSelectedCategoryId((prev) =>
          prev && seatingCats.some((c) => c.id === prev) ? prev : seatingCats[0]!.id,
        );
      }
    },
    [categories, onCategoriesChange],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; seatsOnly?: boolean }) => {
      const silent = opts?.silent ?? initialLoadDone.current;
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/v1/admin/events/seating?eventId=${eventId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.code ?? "Laden fehlgeschlagen");
          return;
        }
        if (opts?.seatsOnly) {
          setEnabled(Boolean(data.enabled));
          setSeats(data.seats ?? []);
        } else {
          applySeatingPayload({
            enabled: data.enabled,
            seats: data.seats ?? [],
            categories: data.categories ?? [],
            venuePlan: data.venuePlan ?? null,
          });
        }
        initialLoadDone.current = true;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [eventId, applySeatingPayload],
  );

  useEffect(() => {
    void load({ silent: false });
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewport({
        w: Math.max(280, Math.round(rect.width)),
        h: Math.max(280, Math.round(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, enabled]);

  function resolveTargetSeatIds(patch: {
    seatIds?: string[];
    blockObjectId?: string;
    rowIndex?: number;
  }): string[] {
    if (patch.seatIds?.length) return patch.seatIds;
    if (patch.blockObjectId) {
      return seatsRef.current
        .filter(
          (s) =>
            s.blockObjectId === patch.blockObjectId &&
            (patch.rowIndex == null || s.rowIndex === patch.rowIndex) &&
            s.status === "available",
        )
        .map((s) => s.id);
    }
    return [];
  }

  const flushPatchQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setSaving(true);
    try {
      while (patchQueueRef.current.length > 0) {
        const batch = patchQueueRef.current.splice(0);
        const groups = new Map<
          string,
          { seatIds: Set<string>; categoryId?: string | null; locked?: boolean }
        >();
        for (const item of batch) {
          const key =
            item.locked !== undefined ? `L:${item.locked}` : `C:${item.categoryId ?? "null"}`;
          let group = groups.get(key);
          if (!group) {
            group = {
              seatIds: new Set(),
              categoryId: item.categoryId,
              locked: item.locked,
            };
            groups.set(key, group);
          }
          for (const id of item.seatIds) group.seatIds.add(id);
        }

        let updatedTotal = 0;
        let lastKind: "lock" | "unlock" | "assign" = "assign";
        for (const group of groups.values()) {
          const body: Record<string, unknown> = {
            eventId,
            seatIds: [...group.seatIds],
          };
          if (group.locked !== undefined) {
            body.locked = group.locked;
            lastKind = group.locked ? "lock" : "unlock";
          }
          if (group.categoryId !== undefined) {
            body.categoryId = group.categoryId;
            lastKind = "assign";
          }
          try {
            const res = await fetch("/api/v1/admin/events/seating", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(
                data?.error?.message ||
                  data?.error?.code ||
                  "Speichern fehlgeschlagen",
              );
              void load({ silent: true, seatsOnly: true });
              continue;
            }
            updatedTotal += Number(data.updated ?? 0);
            if (data.capacities && onCapacitiesChange) {
              onCapacitiesChange(data.capacities as Record<string, number>);
            }
          } catch {
            setError("Speichern fehlgeschlagen");
            void load({ silent: true, seatsOnly: true });
          }
        }

        if (lastKind === "lock") {
          setMessage(
            updatedTotal === 0
              ? "Keine freien Plätze zum Sperren."
              : `${updatedTotal} Plätze gesperrt.`,
          );
        } else if (lastKind === "unlock") {
          setMessage(
            updatedTotal === 0
              ? "Keine gesperrten Plätze freigegeben."
              : `${updatedTotal} Plätze freigegeben.`,
          );
        } else if (updatedTotal > 0) {
          setMessage(`${updatedTotal} Plätze aktualisiert.`);
        }
      }
      // Soft sync after the burst — never remount the canvas.
      void load({ silent: true, seatsOnly: true });
    } finally {
      flushingRef.current = false;
      if (patchQueueRef.current.length > 0) {
        void flushPatchQueue();
      } else {
        setSaving(false);
      }
    }
  }, [eventId, load, onCapacitiesChange]);

  function enqueuePatchSave(item: {
    seatIds: string[];
    categoryId?: string | null;
    locked?: boolean;
  }) {
    if (item.seatIds.length === 0) return;
    patchQueueRef.current.push(item);
    setSaving(true);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushPatchQueue();
    }, 90);
  }

  function applyPatch(
    patch: {
      seatIds?: string[];
      blockObjectId?: string;
      rowIndex?: number;
    },
    opts?: { locked?: boolean; categoryId?: string | null; silent?: boolean },
  ) {
    if (!canWrite) return;
    const effectiveMode = opts?.locked === true ? "lock" : opts?.locked === false ? "unlock" : mode;
    if (effectiveMode === "assign" && opts?.categoryId === undefined && !selectedCategoryId) {
      setError("Bitte zuerst eine Preiskategorie wählen oder anlegen.");
      return;
    }

    let nextCategoryId: string | null | undefined;
    let nextLocked: boolean | undefined;
    if (opts?.locked !== undefined) {
      nextLocked = opts.locked;
    } else if (mode === "assign") {
      nextCategoryId = opts?.categoryId !== undefined ? opts.categoryId : selectedCategoryId;
    } else if (mode === "lock") {
      nextLocked = true;
    } else if (mode === "unlock") {
      nextLocked = false;
    }

    const targetIds = new Set(resolveTargetSeatIds(patch));
    if (targetIds.size === 0) return;

    // Optimistic paint — never wait on the network before the next click.
    setSeats((curr) =>
      curr.map((s) => {
        if (!targetIds.has(s.id)) return s;
        if (nextLocked === true && s.status !== "available") return s;
        if (nextLocked === false && s.status === "sold") return s;
        if (nextCategoryId !== undefined && s.status !== "available") return s;
        return {
          ...s,
          ...(nextCategoryId !== undefined ? { categoryId: nextCategoryId } : {}),
          ...(nextLocked !== undefined ? { locked: nextLocked } : {}),
        };
      }),
    );

    setError(null);
    if (!opts?.silent) setMessage(null);
    enqueuePatchSave({
      seatIds: [...targetIds],
      ...(nextCategoryId !== undefined ? { categoryId: nextCategoryId } : {}),
      ...(nextLocked !== undefined ? { locked: nextLocked } : {}),
    });
  }

  function seatEligibleForPaint(seat: SeatRow) {
    if (mode === "lock") return seat.status === "available" && !seat.locked;
    if (mode === "unlock") return seat.locked && seat.status !== "sold";
    return seat.status === "available";
  }

  function onSeatClick(seat: SeatRow) {
    if (!canWrite) return;
    if (mode === "lock" || mode === "unlock") {
      if (target === "seat") {
        if (!seatEligibleForPaint(seat)) {
          if (seat.status === "sold") {
            setError("Verkaufte Plätze bleiben unberührt.");
          } else if (seat.status === "held" && mode === "lock") {
            setError("Reservierte Plätze werden nicht gesperrt.");
          }
          return;
        }
        void applyPatch({ seatIds: [seat.id] });
        return;
      }
      if (target === "row") {
        const ids = seatsRef.current
          .filter(
            (s) =>
              s.blockObjectId === seat.blockObjectId &&
              s.rowIndex === seat.rowIndex &&
              seatEligibleForPaint(s),
          )
          .map((s) => s.id);
        if (ids.length === 0) {
          setError(
            mode === "lock"
              ? "In dieser Reihe nichts zum Sperren (frei & ungesperrt)."
              : "In dieser Reihe nichts zum Freigeben.",
          );
          return;
        }
        void applyPatch({ seatIds: ids });
        return;
      }
      const ids = seatsRef.current
        .filter((s) => s.blockObjectId === seat.blockObjectId && seatEligibleForPaint(s))
        .map((s) => s.id);
      if (ids.length === 0) {
        setError(
          mode === "lock"
            ? "In diesem Block nichts zum Sperren."
            : "In diesem Block nichts zum Freigeben.",
        );
        return;
      }
      void applyPatch({ seatIds: ids });
      return;
    }
    if (target === "seat") {
      void applyPatch({ seatIds: [seat.id] });
    } else if (target === "row") {
      void applyPatch({ blockObjectId: seat.blockObjectId, rowIndex: seat.rowIndex });
    } else {
      void applyPatch({ blockObjectId: seat.blockObjectId });
    }
  }

  async function bulkLock(lock: boolean) {
    const ids = lock ? lockableSeatIds : unlockableSeatIds;
    if (ids.length === 0) {
      setError(lock ? "Keine freien Plätze zum Sperren." : "Keine gesperrten Plätze.");
      return;
    }
    if (
      !confirm(
        lock
          ? `${ids.length} freie Plätze sperren? Sie erscheinen dann nicht im Verkauf.`
          : `${ids.length} Plätze freigeben und in den Verkauf nehmen?`,
      )
    ) {
      return;
    }
    await applyPatch({ seatIds: ids }, { locked: lock });
  }

  function onBlockClick(blockObjectId: string) {
    if (!canWrite || target !== "block") return;
    if (mode === "lock" || mode === "unlock") {
      const ids = seatsRef.current
        .filter((s) => s.blockObjectId === blockObjectId && seatEligibleForPaint(s))
        .map((s) => s.id);
      if (ids.length === 0) {
        setError(
          mode === "lock"
            ? "In diesem Block nichts zum Sperren."
            : "In diesem Block nichts zum Freigeben.",
        );
        return;
      }
      void applyPatch({ seatIds: ids });
      return;
    }
    void applyPatch({ blockObjectId });
  }

  async function createCategory() {
    const name = newCatName.trim();
    if (!name) {
      setError("Bitte einen Namen für die Preiskategorie eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/events/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name,
          priceEuro: 0,
          // Plan-backed: server sets 0; Kontingent fills from Saalplan assignments.
          capacity: 0,
          maxPerOrder: 10,
          categoryKind: "standard",
          color: newCatColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Kategorie konnte nicht angelegt werden");
        return;
      }
      const created = data.category as CreatedEventCategory;
      const nextCat: AssignmentCategory = {
        id: created.id,
        name: created.name,
        color: created.color ?? newCatColor,
        freeSeating: Boolean(created.freeSeating),
        categoryKind: created.categoryKind ?? "standard",
      };
      if (onCategoryCreated) {
        onCategoryCreated({
          ...created,
          ...nextCat,
          color: nextCat.color,
        });
      } else {
        setCategories((prev) => {
          if (prev.some((c) => c.id === nextCat.id)) return prev;
          return [...prev, nextCat];
        });
      }
      setShowAddCategory(false);
      setNewCatName("");
      setSelectedCategoryId(nextCat.id);
      setMode("assign");
      setMessage(`Preiskategorie „${nextCat.name}“ ist da — jetzt Bereiche auf dem Plan zuweisen.`);
      // Soft sync seats only; keep viewport on plan (no router.refresh / remount).
      void load({ silent: true, seatsOnly: true });
    } finally {
      setBusy(false);
    }
  }

  /** Opt-in only — never auto-run when the first category is created. */
  async function assignAllToSingleCategory() {
    if (!canWrite || seatingCategories.length !== 1) return;
    const catId = seatingCategories[0]!.id;
    const unassigned = seats.filter((s) => !s.categoryId).map((s) => s.id);
    if (unassigned.length === 0) return;
    await applyPatch({ seatIds: unassigned }, { categoryId: catId });
    setSelectedCategoryId(catId);
    setMode("assign");
    setMessage(
      `Geschafft — Plätze sind „${seatingCategories[0]!.name}“. ` +
        "Tipp: Noch nicht alle verkaufen? Reihen oder Blöcke sperren und später freigeben.",
    );
  }

  if (loading) {
    return (
      <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">Wird geladen…</p>
      </section>
    );
  }

  if (!enabled) {
    return (
      <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Zuerst einen Saalplan zuweisen und den Sitzplatzmodus aktivieren — dann kannst du hier
          Bereiche und Plätze den Preiskategorien zuordnen.
        </p>
      </section>
    );
  }

  const pad = Math.max(12, Math.min(24, Math.round(Math.min(viewport.w, viewport.h) * 0.03)));
  const fitScale = Math.min(
    (viewport.w - pad * 2) / Math.max(1, planSize.widthCm),
    (viewport.h - pad * 2) / Math.max(1, planSize.depthCm),
  );
  const readableScale = readableScalePxPerCm();
  const fitZoom = fitViewZoom(fitScale, readableScale);
  // 100% = readable seats; fit is a separate (usually lower) zoom.
  const scale = Math.max(0.01, readableScale * zoom);
  const hallW = planSize.widthCm * scale;
  const hallH = planSize.depthCm * scale;
  const viewW = Math.max(viewport.w, Math.ceil(hallW + pad * 2));
  const viewH = Math.max(viewport.h, Math.ceil(hallH + pad * 2));
  const hallLeft = (viewW - hallW) / 2;
  const hallTop = (viewH - hallH) / 2;
  const toX = (cm: number) => hallLeft + cm * scale;
  const toY = (cm: number) => hallTop + cm * scale;
  const toS = (cm: number) => cm * scale;
  const editorHref = venuePlanId
    ? `/admin/saalplan/${venuePlanId}?returnTo=${encodeURIComponent(`/admin/events/${eventId}#zuordnung`)}&returnLabel=${encodeURIComponent("Zurück zum Event")}`
    : null;

  return (
    <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--tf-text-secondary)]">
            Kategorie wählen, Aktion und Auswahl festlegen — dann auf dem Plan tippen. Reihen und
            Blöcke lassen sich sperren und später freigeben.
          </p>
        </div>
        {editorHref ? (
          <a
            href={editorHref}
            target="_blank"
            rel="noreferrer"
            className="tf-btn tf-btn-secondary !min-h-10 shrink-0 text-sm"
          >
            Geometrie bearbeiten
          </a>
        ) : null}
      </div>

      {/* Stats — one calm row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--tf-line)] pb-3 text-sm">
        <span className="tabular-nums text-[var(--tf-navy)]">
          <span className="text-[var(--tf-text-secondary)]">Im Verkauf</span>{" "}
          <span className="font-semibold">{onSaleCount}</span>
        </span>
        <span className="tabular-nums text-[var(--tf-navy)]">
          <span className="text-[var(--tf-text-secondary)]">Gesperrt</span>{" "}
          <span className="font-semibold">{lockedCount}</span>
        </span>
        <span className="tabular-nums text-[var(--tf-navy)]">
          <span className="text-[var(--tf-text-secondary)]">Zugewiesen</span>{" "}
          <span className="font-semibold">
            {assignedCount} / {seats.length}
          </span>
          {unassignedCount > 0 ? (
            <span className="ml-1 text-[var(--tf-text-secondary)]">({unassignedCount} offen)</span>
          ) : null}
        </span>
        {unassignedCount === 0 && seats.length > 0 ? (
          <span className="text-sm font-medium text-[var(--tf-teal)]">Alles zugeordnet</span>
        ) : null}
      </div>

      {canWrite && seatingCategories.length === 1 && unassignedCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-4 py-3">
          <p className="text-sm text-[var(--tf-navy)]">
            <span className="font-semibold">{unassignedCount} Plätze offen</span>
            <span className="text-[var(--tf-text-secondary)]">
              {" "}
              — optional den ganzen Plan auf einmal zuweisen.
            </span>
          </p>
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10 shrink-0 text-sm"
            disabled={busy}
            onClick={() => void assignAllToSingleCategory()}
          >
            {busy ? "Wird zugewiesen…" : "Ganzen Saalplan zuweisen"}
          </button>
        </div>
      ) : null}

      {/* Structured toolbar: A categories · B action · C grain · D bulk */}
      <div className="mt-4 space-y-0 overflow-hidden rounded-xl border border-[var(--tf-line)] bg-[#f8fafc]">
        {/* A — Preiskategorien */}
        <div className="border-b border-[var(--tf-line)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
            Preiskategorien
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {seatingCategories.map((c, i) => {
              const color = resolveCategoryColor(c.color, i);
              const active = mode === "assign" && selectedCategoryId === c.id;
              const count = seats.filter((s) => s.categoryId === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMode("assign");
                    setSelectedCategoryId(c.id);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "border-[var(--tf-navy)] bg-white text-[var(--tf-navy)] ring-2 ring-[rgba(15,39,71,0.12)]"
                      : "border-[var(--tf-line)] bg-white text-[var(--tf-navy)] hover:border-[var(--tf-teal)]"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                  {c.name}
                  <span className="text-xs font-normal text-[var(--tf-text-secondary)]">{count}</span>
                </button>
              );
            })}
            {canWrite ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--tf-teal)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.08)]"
                onClick={() => {
                  setShowAddCategory((v) => !v);
                  setNewCatColor(QUICK_COLORS[seatingCategories.length % QUICK_COLORS.length]!);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Hinzufügen
              </button>
            ) : null}
          </div>
          {seatingCategories.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
              Noch keine Preiskategorie — lege eine an, dann tippst du Bereiche auf dem Plan an.
            </p>
          ) : null}
        </div>

        {showAddCategory && canWrite ? (
          <div className="grid gap-3 border-b border-[var(--tf-line)] bg-white px-4 py-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-[var(--tf-navy)]">Name</span>
              <input
                className="tf-input"
                placeholder="z. B. Parkett, Rang, VIP"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createCategory();
                  }
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-[var(--tf-navy)]">Farbe</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--tf-line)] bg-white p-1"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {QUICK_COLORS.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="h-6 w-6 rounded-full border border-[var(--tf-line)]"
                      style={{ background: c }}
                      onClick={() => setNewCatColor(c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                disabled={busy}
                onClick={() => void createCategory()}
              >
                Anlegen
              </button>
              <button
                type="button"
                className="tf-btn !min-h-10 text-sm"
                onClick={() => setShowAddCategory(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}

        {/* B + C + D — action / grain / bulk in one toolbar row */}
        <div className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_auto] md:items-end md:gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
              Aktion
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  { id: "assign", label: "Zuweisen", icon: Paintbrush },
                  { id: "lock", label: "Sperren", icon: Lock },
                  { id: "unlock", label: "Freigeben", icon: Unlock },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    mode === m.id
                      ? "border-[var(--tf-navy)] bg-[var(--tf-navy)] text-white"
                      : "border-[var(--tf-line)] bg-white text-[var(--tf-navy)] hover:border-[var(--tf-navy)]"
                  }`}
                  onClick={() => {
                    setMode(m.id);
                    setError(null);
                  }}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
              Auswahl
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  { id: "block", label: "Bereich / Block" },
                  { id: "row", label: "Reihe(n)" },
                  { id: "seat", label: "Einzelplätze" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    target === t.id
                      ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.14)] text-[var(--tf-navy)]"
                      : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)] hover:border-[var(--tf-teal)] hover:text-[var(--tf-navy)]"
                  }`}
                  onClick={() => setTarget(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {canWrite ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
                Sammelaktion
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                  disabled={busy || lockableSeatIds.length === 0}
                  onClick={() => void bulkLock(true)}
                >
                  Alle sperren
                  {lockableSeatIds.length > 0 ? ` (${lockableSeatIds.length})` : ""}
                </button>
                <button
                  type="button"
                  className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                  disabled={busy || unlockableSeatIds.length === 0}
                  onClick={() => void bulkLock(false)}
                >
                  Alle freigeben
                  {unlockableSeatIds.length > 0 ? ` (${unlockableSeatIds.length})` : ""}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {mode === "lock" || mode === "unlock" ? (
          <p className="border-t border-[var(--tf-line)] px-4 py-2 text-sm text-[var(--tf-text-secondary)]">
            {mode === "lock"
              ? "Tippe Block, Reihe oder Platz — verkaufte und reservierte Plätze bleiben unberührt."
              : "Tippe Block, Reihe oder Platz zum Freigeben — verkaufte Plätze bleiben gesperrt/verkauft."}
          </p>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-[var(--tf-teal)]">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--tf-line)] px-3 py-2">
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Ziehen = verschieben · Leertaste/Alt + ziehen überall · 50 % Standard · 100 % =
            lesbare Platznummern
            {saving ? " · speichert…" : ""}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
              disabled={zoom <= MIN_VIEW_ZOOM}
              onClick={() => setZoom((z) => clampViewZoom(z - VIEW_ZOOM_STEP))}
              aria-label="Verkleinern"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-xs tabular-nums hover:bg-[rgba(15,39,71,0.06)]"
              onClick={() => setZoom(DEFAULT_VIEW_ZOOM)}
              title="Standardzoom 50 %"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
              disabled={zoom >= MAX_VIEW_ZOOM}
              onClick={() => setZoom((z) => clampViewZoom(z + VIEW_ZOOM_STEP))}
              aria-label="Vergrößern"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="ml-1 rounded-md px-1.5 py-1 text-[10px] text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)]"
              onClick={() => setZoom(fitZoom)}
              title="Saal auf Fläche einpassen"
            >
              Einpassen
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          className={`h-[min(56vh,520px)] w-full overflow-auto bg-[#f8fafc] ${
            panning ? "cursor-grabbing" : "cursor-grab"
          }`}
          {...panHandlers}
        >
          <svg
            width={viewW}
            height={viewH}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="touch-none select-none"
          >
            <rect
              x={hallLeft}
              y={hallTop}
              width={hallW}
              height={hallH}
              fill="#fff"
              stroke="#0F2747"
              strokeWidth={1.5}
              rx={4}
            />
            {planObjects.map((obj) => {
              if (obj.type === "stage") {
                return (
                  <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                    <rect
                      x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                      width={toS(obj.widthCm)}
                      height={toS(obj.heightCm)}
                      fill="rgba(15,39,71,0.08)"
                      stroke="#0F2747"
                      rx={4}
                    />
                    <text
                      x={toX(obj.xCm)}
                      y={toY(obj.yCm) + 4}
                      textAnchor="middle"
                      style={{ fontSize: 12, fontWeight: 700, fill: "#0F2747" }}
                    >
                      {obj.label || "Bühne"}
                    </text>
                  </g>
                );
              }
              if (obj.type === "standing_area") {
                return (
                  <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                    <rect
                      x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                      width={toS(obj.widthCm)}
                      height={toS(obj.heightCm)}
                      fill="rgba(15,39,71,0.05)"
                      stroke="#0F2747"
                      strokeDasharray="6 4"
                      rx={4}
                    />
                    <text
                      x={toX(obj.xCm)}
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 3}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747" }}
                    >
                      {obj.label || "Stehbereich"}
                    </text>
                  </g>
                );
              }
              if (obj.type !== "seat_block" || obj.numberedSeats === false) {
                if (obj.type === "seat_block") {
                  return (
                    <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                      <rect
                        x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                        y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                        width={toS(obj.widthCm)}
                        height={toS(obj.heightCm)}
                        fill="rgba(20,184,166,0.12)"
                        stroke="#0F2747"
                        rx={4}
                      />
                      <text
                        x={toX(obj.xCm)}
                        y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 3}
                        textAnchor="middle"
                        dominantBaseline="auto"
                        style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747" }}
                      >
                        {obj.label || "Block"} · freie Platzwahl
                      </text>
                    </g>
                  );
                }
                return null;
              }

              const left = toX(obj.xCm) - toS(obj.widthCm) / 2;
              const top = toY(obj.yCm) - toS(obj.heightCm) / 2;
              const w = toS(obj.widthCm);
              const h = toS(obj.heightCm);
              // Match geometry editor / public seat-map padding so seat dots stay large enough for numbers.
              const padX = w * 0.05;
              const padY = h * 0.05;
              const cols = Math.max(1, obj.seatsPerRow ?? 1);
              const rows = Math.max(1, obj.rows ?? 1);
              const cellW = (w - padX * 2) / cols;
              const cellH = (h - padY * 2) / rows;
              const blockSeats = seatsByBlock.get(obj.id) ?? [];

              return (
                <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                  <rect
                    x={left}
                    y={top}
                    width={w}
                    height={h}
                    fill="rgba(20,184,166,0.04)"
                    stroke="#0F2747"
                    rx={4}
                    {...(target === "block" ? { "data-saalplan-interactive": "" } : {})}
                    style={{ cursor: target === "block" ? "pointer" : "default" }}
                    onClick={() => onBlockClick(obj.id)}
                  />
                  <text
                    x={toX(obj.xCm)}
                    y={top - 3}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747", pointerEvents: "none" }}
                  >
                    {obj.label || "Block"}
                  </text>
                  {Array.from({ length: rows }, (_, ri) => {
                    const rowNum = ri + 1;
                    const cy = top + padY + cellH * (rowNum - 0.5);
                    const rowFont = Math.max(7, Math.min(11, cellH * 0.28));
                    return (
                      <g key={`row-${rowNum}`}>
                        <text
                          x={left + Math.max(6, padX * 0.55)}
                          y={cy + 3}
                          textAnchor="middle"
                          data-saalplan-interactive=""
                          style={{
                            fontSize: rowFont,
                            fontWeight: 600,
                            fill: "#64748B",
                            cursor: target === "row" ? "pointer" : "default",
                          }}
                          onClick={() => {
                            if (target !== "row") return;
                            const sample = blockSeats.find((s) => s.rowIndex === rowNum);
                            if (sample) onSeatClick(sample);
                            else void applyPatch({ blockObjectId: obj.id, rowIndex: rowNum });
                          }}
                        >
                          {rowNum}
                        </text>
                        <text
                          x={left + w - Math.max(6, padX * 0.55)}
                          y={cy + 3}
                          textAnchor="middle"
                          data-saalplan-interactive=""
                          style={{
                            fontSize: rowFont,
                            fontWeight: 600,
                            fill: "#64748B",
                            cursor: target === "row" ? "pointer" : "default",
                          }}
                          onClick={() => {
                            if (target !== "row") return;
                            const sample = blockSeats.find((s) => s.rowIndex === rowNum);
                            if (sample) onSeatClick(sample);
                            else void applyPatch({ blockObjectId: obj.id, rowIndex: rowNum });
                          }}
                        >
                          {rowNum}
                        </text>
                      </g>
                    );
                  })}
                  {blockSeats.map((seat) => {
                    const cx = left + padX + cellW * (seat.seatIndex - 0.5);
                    const cy = top + padY + cellH * (seat.rowIndex - 0.5);
                    const r = Math.max(3, Math.min(cellW, cellH) * 0.34);
                    const color = seat.categoryId
                      ? colorById.get(seat.categoryId) ?? "#94A3B8"
                      : "#E2E8F0";
                    const fill = seat.locked
                      ? "#CBD5E1"
                      : seat.status === "sold" || seat.status === "held"
                        ? "#94A3B8"
                        : color;
                    const labelFill = seatLabelFill(fill);
                    // Readable at default 50% zoom; floor font so labels stay legible.
                    const showNumber = r >= 3.5;
                    return (
                      <g
                        key={seat.id}
                        data-saalplan-interactive=""
                        style={{ cursor: "pointer" }}
                        onClick={() => onSeatClick(seat)}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={fill}
                          stroke={seat.locked ? "#64748B" : "#0F2747"}
                          strokeWidth={seat.locked ? 1.5 : 1}
                          strokeDasharray={seat.locked ? "3 2" : undefined}
                        />
                        {showNumber ? (
                          <text
                            x={cx}
                            y={cy + r * 0.35}
                            textAnchor="middle"
                            style={{
                              fontSize: Math.max(7, Math.min(10, r * 0.95)),
                              fontWeight: 700,
                              fill: labelFill,
                              pointerEvents: "none",
                            }}
                          >
                            {seat.seatNumber}
                          </text>
                        ) : null}
                        <title>
                          {seat.locked ? "Gesperrt · " : ""}
                          Reihe {seat.rowLabel} Platz {seat.seatNumber}
                        </title>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
        <span className="font-medium text-[var(--tf-navy)]">Legende:</span>
        {seatingCategories.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: resolveCategoryColor(c.color, i) }}
            />
            {c.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-dashed border-[#64748B] bg-[#CBD5E1]" />
          Gesperrt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-[#0F2747] bg-[#E2E8F0]" />
          Nicht zugeordnet
        </span>
      </div>
    </section>
  );
}

/** Navy on light fills, white on dark category colors — keeps seat numbers readable. */
function seatLabelFill(hexOrCss: string): string {
  const raw = hexOrCss.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return "#0F2747";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Relative luminance (sRGB approximation)
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? "#0F2747" : "#FFFFFF";
}
