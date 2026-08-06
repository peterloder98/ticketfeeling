"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Minus,
  Plus,
  Mail,
  Smartphone,
  ShieldCheck,
  Headphones,
  BadgeCheck,
  Armchair,
  Map,
} from "lucide-react";
import { formatEuroFromCents } from "@/lib/money";
import { useCart } from "@/components/cart-context";
import { cartFetch } from "@/lib/commerce/cart-client";
import { SeatMap } from "@/components/seat-map";
import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";
import { formatSeatLabel } from "@/lib/seating/types";
import { cartErrorMessage } from "@/lib/commerce/cart-error-messages";
import {
  countAvailableForCategory,
  multiCategorySelectionCap,
} from "@/lib/seating/availability";

type Category = {
  id: string;
  name: string;
  description: string | null;
  priceGrossCents: number;
  available: number;
  maxPerOrder: number;
  needsSeats: boolean;
  categoryKind?: string;
  companionFree?: boolean;
};

type Props = {
  eventId: string;
  bookingMode: "best_available" | "seat_map_and_best" | "none";
  categories: Category[];
  feeSurchargeNote?: string;
  showRemainingAvailability?: boolean;
  breakOutToTop?: boolean;
  cartHref?: string;
  checkoutHref?: string;
  /**
   * When set (public event page), the saalplan renders into this host element
   * below the info section instead of inside the right ticket box.
   */
  mapHostId?: string;
  /** Scroll target after seats are added (defaults to #tickets). */
  cartScrollId?: string;
};

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SeatBookingPanel({
  eventId,
  bookingMode,
  categories,
  feeSurchargeNote,
  showRemainingAvailability = false,
  cartHref = "/warenkorb",
  checkoutHref = "/checkout",
  mapHostId,
  cartScrollId = "tickets",
}: Props) {
  const { bump } = useCart();
  const seatCategories = categories.filter((c) => c.needsSeats);
  const freeCategories = categories.filter((c) => !c.needsSeats);

  const [mode, setMode] = useState<"best_available" | "seat_map">("best_available");
  /** Bestplatz: single active category. Saalplan uses selectedByCategory instead. */
  const [categoryId, setCategoryId] = useState(seatCategories[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [selectedByCategory, setSelectedByCategory] = useState<Record<string, string[]>>({});
  const [map, setMap] = useState<SeatMapPayload | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [addedSeatLabels, setAddedSeatLabels] = useState<string[]>([]);
  const [mapHostEl, setMapHostEl] = useState<HTMLElement | null>(null);
  const [freeQty, setFreeQty] = useState<Record<string, number>>(
    Object.fromEntries(freeCategories.map((c) => [c.id, c.available < 1 ? 0 : 1])),
  );

  const useExternalMap = Boolean(mapHostId);
  const showMap = mode === "seat_map";

  const selectedCategory = seatCategories.find((c) => c.id === categoryId) ?? null;
  const companionFree = Boolean(selectedCategory?.companionFree);
  /** Cap by pool stock and (when map loaded) actually sellable seats for this category. */
  const sellableStock = selectedCategory
    ? Math.max(
        0,
        map
          ? Math.min(
              selectedCategory.available,
              mode === "best_available"
                ? countAvailableForCategory(map, selectedCategory.id)
                : map.availableCount,
            )
          : selectedCategory.available,
      )
    : 0;
  const maxQty = selectedCategory
    ? Math.min(selectedCategory.maxPerOrder, sellableStock)
    : 0;
  const categorySoldOut = !selectedCategory || sellableStock < 1;

  const allSelectedIds = useMemo(
    () => Object.values(selectedByCategory).flat(),
    [selectedByCategory],
  );

  const selectionLines = useMemo(() => {
    if (!map) return [] as { category: Category; seats: PublicSeat[] }[];
    const all = map.blocks.flatMap((b) => b.seats);
    const lines: { category: Category; seats: PublicSeat[] }[] = [];
    for (const cat of seatCategories) {
      const ids = selectedByCategory[cat.id] ?? [];
      if (ids.length === 0) continue;
      const seats = ids
        .map((id) => all.find((s) => s.id === id))
        .filter(Boolean) as PublicSeat[];
      if (seats.length > 0) lines.push({ category: cat, seats });
    }
    return lines;
  }, [map, seatCategories, selectedByCategory]);

  const seatMapMaxSelect = useMemo(
    () =>
      multiCategorySelectionCap(seatCategories, selectedByCategory, (id) =>
        map ? countAvailableForCategory(map, id) : Number.POSITIVE_INFINITY,
      ),
    [seatCategories, selectedByCategory, map],
  );

  const uniformMaxPerCategory = useMemo(() => {
    if (seatCategories.length === 0) return null;
    const first = seatCategories[0].maxPerOrder;
    return seatCategories.every((c) => c.maxPerOrder === first) ? first : null;
  }, [seatCategories]);

  const mapFreeCount = useMemo(() => {
    if (!map) return 0;
    return seatCategories.reduce(
      (sum, c) => sum + countAvailableForCategory(map, c.id),
      0,
    );
  }, [map, seatCategories]);

  const loadMap = useCallback(async () => {
    setMapLoading(true);
    try {
      // Full map — mixed categories in one Saalplan session.
      const res = await cartFetch(`/api/v1/events/${eventId}/seats`);
      const data = await res.json();
      if (res.ok) setMap(data.map as SeatMapPayload);
    } finally {
      setMapLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (bookingMode !== "none" && seatCategories.length > 0) {
      void loadMap();
    }
  }, [bookingMode, seatCategories.length, loadMap]);

  useEffect(() => {
    if (mode !== "best_available") return;
    if (maxQty < 1) {
      setQty(1);
      return;
    }
    setQty((q) => Math.min(q, maxQty));
  }, [maxQty, mode]);

  useEffect(() => {
    if (!mapHostId || typeof document === "undefined") {
      setMapHostEl(null);
      return;
    }
    setMapHostEl(document.getElementById(mapHostId));
  }, [mapHostId, showMap]);

  function openSeatMap() {
    setMode("seat_map");
    setJustAdded(false);
    requestAnimationFrame(() => {
      scrollToId(mapHostId ?? "saalplan-map");
    });
  }

  function maxForCategory(cat: Category) {
    const availableOnMap = map ? countAvailableForCategory(map, cat.id) : cat.available;
    return Math.min(cat.maxPerOrder, Math.max(0, cat.available), Math.max(0, availableOnMap));
  }

  function toggleSeat(seat: PublicSeat) {
    if (seat.locked || seat.status === "locked" || seat.status === "taken") return;
    if (seat.status !== "available" && seat.status !== "held_by_you") return;
    const hasAssignments = map?.blocks.some((b) => b.seats.some((s) => s.categoryId));
    const catId = hasAssignments ? seat.categoryId : seatCategories[0]?.id ?? null;
    if (!catId) return;
    const category = seatCategories.find((c) => c.id === catId);
    if (!category) return;
    const max = maxForCategory(category);
    if (max < 1) return;

    setSelectedByCategory((prev) => {
      const cur = prev[catId] ?? [];
      if (cur.includes(seat.id)) {
        return { ...prev, [catId]: cur.filter((id) => id !== seat.id) };
      }
      if (cur.length >= max) return prev;
      return { ...prev, [catId]: [...cur, seat.id] };
    });
  }

  async function addReserved() {
    setLoading(true);
    setError(null);
    try {
      if (mode === "best_available") {
        if (!selectedCategory) return;
        const response = await cartFetch("/api/v1/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 25_000,
          body: JSON.stringify({
            categoryId: selectedCategory.id,
            quantity: qty,
            seatingMode: "best_available",
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const code = String(data?.error?.code ?? "");
          const available =
            typeof data?.error?.available === "number" ? data.error.available : null;
          if (code === "INSUFFICIENT_STOCK" && available != null && available > 0) {
            setQty(Math.min(selectedCategory.maxPerOrder, available));
            setError(cartErrorMessage(code, { available }));
          } else {
            setError(cartErrorMessage(code, { available }));
          }
          void loadMap();
          return;
        }
        applyCartBump(data);
        const labels = seatLabelsFromResponse(data);
        setAddedSeatLabels(labels);
        setJustAdded(true);
        requestAnimationFrame(() => scrollToId(cartScrollId));
        return;
      }

      // Saalplan: one cart line per category with its seats.
      const lines = selectionLines;
      if (lines.length === 0) {
        setError("Bitte mindestens einen Platz im Saalplan wählen.");
        return;
      }
      for (const line of lines) {
        if (line.seats.length > line.category.maxPerOrder) {
          setError(
            `Maximal ${line.category.maxPerOrder} Tickets für „${line.category.name}“ pro Bestellung.`,
          );
          return;
        }
      }

      let lastData: Record<string, unknown> | null = null;
      const allLabels: string[] = [];
      const heldIds = new Set<string>();

      for (const line of lines) {
        const seatIds = line.seats.map((s) => s.id);
        const response = await cartFetch("/api/v1/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 25_000,
          body: JSON.stringify({
            categoryId: line.category.id,
            quantity: seatIds.length,
            seatingMode: "seat_map",
            seatIds,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(cartErrorMessage(String(data?.error?.code ?? "")));
          void loadMap();
          return;
        }
        lastData = data as Record<string, unknown>;
        allLabels.push(...seatLabelsFromResponse(data));
        for (const id of seatIds) heldIds.add(id);
      }

      if (lastData) applyCartBump(lastData);
      setAddedSeatLabels(allLabels);
      setJustAdded(true);
      setSelectedByCategory({});
      if (heldIds.size > 0) {
        setMap((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            blocks: prev.blocks.map((block) => ({
              ...block,
              seats: block.seats.map((seat) =>
                heldIds.has(seat.id)
                  ? { ...seat, status: "held_by_you" as const }
                  : seat,
              ),
            })),
          };
        });
      }
      requestAnimationFrame(() => scrollToId(cartScrollId));
    } finally {
      setLoading(false);
    }
  }

  function applyCartBump(data: Record<string, unknown>) {
    const summary = data?.summary as Record<string, unknown> | undefined;
    bump({
      itemCount: typeof summary?.itemCount === "number" ? summary.itemCount : undefined,
      sessionKey: typeof data?.sessionKey === "string" ? data.sessionKey : undefined,
      grossFormatted:
        typeof summary?.grossFormatted === "string"
          ? summary.grossFormatted
          : typeof summary?.grossCents === "number"
            ? formatEuroFromCents(summary.grossCents)
            : undefined,
      expiresAt: data?.expiresAt
        ? typeof data.expiresAt === "string"
          ? data.expiresAt
          : new Date(data.expiresAt as string).toISOString()
        : undefined,
    });
  }

  async function addFree(catId: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await cartFetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 25_000,
        body: JSON.stringify({
          categoryId: catId,
          quantity: freeQty[catId] ?? 1,
          seatingMode: "free",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = String(data?.error?.code ?? "");
        const available =
          typeof data?.error?.available === "number" ? data.error.available : null;
        if (code === "INSUFFICIENT_STOCK" && available != null && available > 0) {
          const cat = freeCategories.find((c) => c.id === catId);
          const max = Math.min(cat?.maxPerOrder ?? available, available);
          setFreeQty((p) => ({ ...p, [catId]: Math.min(max, available) }));
          setError(cartErrorMessage(code, { available }));
          return;
        }
        if ((code === "SOLD_OUT" || code === "INSUFFICIENT_STOCK") && available === 0) {
          setFreeQty((p) => ({ ...p, [catId]: 0 }));
        }
        setError(cartErrorMessage(code, { available }));
        return;
      }
      applyCartBump(data);
      setJustAdded(true);
      requestAnimationFrame(() => scrollToId(cartScrollId));
    } finally {
      setLoading(false);
    }
  }

  const mapBlock =
    showMap ? (
      <div className="space-y-3">
        {mapLoading && !map ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Saalplan wird geladen…</p>
        ) : map ? (
          <SeatMap
            map={map}
            selectedIds={allSelectedIds}
            onToggle={toggleSeat}
            maxSelect={Math.max(seatMapMaxSelect, allSelectedIds.length, 1)}
            maxPerCategory={uniformMaxPerCategory}
            availableCount={mapFreeCount}
            multiCategory
            initialZoom={2.25}
            hint={
              seatCategories.some((c) => c.companionFree)
                ? "Wähle Plätze frei — auch gemischt aus mehreren Kategorien. Beim Rollstuhlplatz wird der Begleitplatz automatisch mitreserviert."
                : "Tippe freie Plätze — auch aus verschiedenen Preiskategorien. Türkis = deine Auswahl."
            }
          />
        ) : (
          <p className="text-sm text-[var(--danger)]">Saalplan nicht verfügbar.</p>
        )}
      </div>
    ) : null;

  const externalMap =
    useExternalMap && showMap && mapHostEl
      ? createPortal(
          <div className="scroll-mt-24 rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_12px_40px_rgba(15,39,71,0.08)] md:p-8">
            <h2 className="tf-display text-2xl md:text-3xl">Saalplan</h2>
            <p className="mt-1 max-w-2xl text-base text-[var(--tf-text-secondary)]">
              Wähle deine Plätze — auch gemischt aus mehreren Kategorien. Die Auswahl erscheint
              rechts im Ticketkasten.
            </p>
            <div className="mt-5">{mapBlock}</div>
          </div>,
          mapHostEl,
        )
      : null;

  if (categories.length === 0) {
    return (
      <p className="text-base text-[var(--tf-text-secondary)]">Aktuell keine buchbaren Kategorien.</p>
    );
  }

  const seatMapReady = allSelectedIds.length > 0;
  const addLabel =
    mode === "best_available"
      ? `${qty}× Bestplätze in den Warenkorb`
      : selectionLines.length === 0
        ? "Plätze in den Warenkorb"
        : `${selectionLines.map((l) => `${l.seats.length}× ${l.category.name}`).join(" + ")} in den Warenkorb`;

  return (
    <div className="space-y-5">
      {externalMap}
      {seatCategories.length > 0 ? (
        <div className="space-y-4">
          {bookingMode === "seat_map_and_best" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("best_available");
                  setSelectedByCategory({});
                }}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  mode === "best_available"
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] ring-2 ring-[rgba(20,184,166,0.2)]"
                    : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]"
                }`}
              >
                <Armchair className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-navy)]" />
                <span>
                  <span className="font-semibold text-[var(--tf-navy)]">Bestplatzbuchung</span>
                  <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                    Standard — wir finden die besten Plätze, möglichst nebeneinander
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={openSeatMap}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  mode === "seat_map"
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] ring-2 ring-[rgba(20,184,166,0.2)]"
                    : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]"
                }`}
              >
                <Map className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-navy)]" />
                <span>
                  <span className="font-semibold text-[var(--tf-navy)]">Saalplan wählen</span>
                  <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                    Reihe und Platz selbst aussuchen — auch gemischt
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
              Bestplatzbuchung: Wir weisen dir automatisch die besten freien Plätze zu.
            </p>
          )}

          {mode === "best_available" ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[var(--tf-navy)]">Preiskategorie</span>
                <select
                  className="tf-input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {seatCategories.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.available < 1}>
                      {c.name} · {formatEuroFromCents(c.priceGrossCents)}
                      {c.available < 1 ? " (ausverkauft)" : ""}
                    </option>
                  ))}
                </select>
                {selectedCategory?.description ? (
                  <span className="text-xs text-[var(--tf-text-secondary)]">
                    {selectedCategory.description}
                  </span>
                ) : null}
                {companionFree ? (
                  <span className="text-xs font-medium text-[var(--tf-teal-hover)]">
                    Inkl. Begleitperson kostenfrei — wir reservieren den Nebenplatz automatisch.
                  </span>
                ) : null}
                {feeSurchargeNote ? (
                  <span className="text-xs text-[var(--tf-text-secondary)]">{feeSurchargeNote}</span>
                ) : null}
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-[var(--tf-navy)]">Anzahl</span>
                <div className="inline-flex items-center rounded-[14px] border border-[var(--tf-line)] bg-white">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                    disabled={categorySoldOut || qty <= 1}
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-10 text-center font-semibold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                    disabled={categorySoldOut || qty >= maxQty}
                    onClick={() => setQty((q) => Math.min(maxQty, Math.max(1, q + 1)))}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {categorySoldOut ? (
                  <span className="text-xs text-[var(--tf-text-secondary)]">Keine Plätze verfügbar</span>
                ) : showRemainingAvailability && selectedCategory ? (
                  <span className="text-xs text-[var(--tf-text-secondary)]">
                    Noch {sellableStock} verfügbar
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-[var(--tf-text-secondary)]">
                {companionFree
                  ? "Wir suchen die besten freien Rollstuhlplätze inkl. Begleitung nebeneinander."
                  : "Wir suchen die besten freien Plätze — möglichst nebeneinander in einer Reihe."}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              {feeSurchargeNote ? (
                <p className="text-xs text-[var(--tf-text-secondary)]">{feeSurchargeNote}</p>
              ) : null}
              {selectionLines.length > 0 ? (
                <ul className="space-y-2 rounded-xl border border-[var(--tf-line)] bg-[rgba(20,184,166,0.06)] px-3 py-2 text-sm text-[var(--tf-navy)]">
                  {selectionLines.map((line) => (
                    <li key={line.category.id}>
                      <p className="font-semibold">
                        {line.seats.length}× {line.category.name}
                        <span className="ml-1 font-normal text-[var(--tf-text-secondary)]">
                          · {formatEuroFromCents(line.category.priceGrossCents)}
                        </span>
                      </p>
                      <ul className="mt-0.5 space-y-0.5 text-xs font-medium text-[var(--tf-teal-hover)]">
                        {line.seats.map((s) => (
                          <li key={s.id}>
                            {formatSeatLabel(s)}
                            {line.category.companionFree ? (
                              <span className="ml-1 font-normal text-[var(--tf-text-secondary)]">
                                (+ Begleitung)
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--tf-text-secondary)]">
                  {useExternalMap
                    ? "Wähle unten im Saalplan deine Plätze — auch gemischt aus mehreren Kategorien."
                    : "Tippe auf freie Plätze — auch aus verschiedenen Preiskategorien."}
                </p>
              )}
              {!useExternalMap ? mapBlock : null}
            </div>
          )}

          <button
            type="button"
            className="tf-btn tf-btn-primary w-full !min-h-12"
            disabled={
              loading ||
              (mode === "best_available" ? categorySoldOut : !seatMapReady)
            }
            onClick={() => void addReserved()}
          >
            {loading ? "Reserviert…" : addLabel}
          </button>
        </div>
      ) : null}

      {freeCategories.length > 0 ? (
        <div className="space-y-3 border-t border-[var(--tf-line)] pt-4">
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            {seatCategories.length > 0 ? "Stehplatz / freie Platzwahl" : "Tickets"}
          </p>
          {freeCategories.map((category) => {
            const max = Math.min(category.maxPerOrder, Math.max(0, category.available));
            const soldOut = category.available < 1;
            const current = freeQty[category.id] ?? (soldOut ? 0 : 1);
            return (
              <div
                key={category.id}
                className="rounded-[16px] border border-[var(--tf-line)] bg-[#f8fafc] p-4"
              >
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--tf-navy)]">{category.name}</p>
                    <p className="text-lg font-bold text-[var(--tf-navy)]">
                      {formatEuroFromCents(category.priceGrossCents)}
                    </p>
                  </div>
                  {soldOut ? (
                    <p className="text-sm text-[var(--tf-text-secondary)]">Ausverkauft</p>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-[14px] border border-[var(--tf-line)] bg-white">
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                      disabled={soldOut || current <= 1}
                      onClick={() =>
                        setFreeQty((p) => ({
                          ...p,
                          [category.id]: Math.max(1, current - 1),
                        }))
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-10 text-center font-semibold">{current}</span>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                      disabled={soldOut || current >= max}
                      onClick={() =>
                        setFreeQty((p) => ({
                          ...p,
                          [category.id]: Math.min(max, Math.max(1, current + 1)),
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="tf-btn tf-btn-primary !min-h-11 flex-1 text-sm"
                    disabled={soldOut || current < 1 || loading}
                    onClick={() => void addFree(category.id)}
                  >
                    {soldOut ? "Ausverkauft" : "In den Warenkorb"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {justAdded ? (
        <div className="rounded-xl border border-[var(--tf-line)] bg-[rgba(20,184,166,0.08)] px-3 py-3 text-sm text-[var(--tf-navy)]">
          <p className="font-semibold">Reserviert für 10 Minuten.</p>
          {addedSeatLabels.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--tf-teal-hover)]">
              {addedSeatLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={checkoutHref} className="tf-btn tf-btn-primary !min-h-10 text-sm">
              Zur Kasse
            </Link>
            <Link
              href={cartHref}
              className="text-sm font-medium text-[var(--tf-text-secondary)] underline"
            >
              Warenkorb
            </Link>
          </div>
        </div>
      ) : null}

      <ul className="space-y-2 border-t border-[var(--tf-line)] pt-4 text-sm text-[var(--tf-text-secondary)]">
        <li className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-[var(--tf-teal)]" /> Direkt beim Veranstalter
        </li>
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--tf-teal)]" /> Ticket sofort per E-Mail
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--tf-teal)]" /> Sichere Zahlung
        </li>
        <li className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-[var(--tf-teal)]" /> Persönliche Hilfe
        </li>
        <li className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[var(--tf-teal)]" /> Digitales Ticket
        </li>
      </ul>
    </div>
  );
}

function seatLabelsFromResponse(data: unknown): string[] {
  const seats = (data as { seats?: { seatLabel?: string }[] })?.seats;
  if (!Array.isArray(seats)) return [];
  return seats.map((s) => s.seatLabel).filter((s): s is string => Boolean(s));
}
