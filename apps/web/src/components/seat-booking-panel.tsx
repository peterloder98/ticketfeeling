"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SeatMap } from "@/components/seat-map";
import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";
import { formatSeatLabel } from "@/lib/seating/types";

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
};

function errorLabel(code: string) {
  switch (code) {
    case "SOLD_OUT":
      return "Leider ausverkauft.";
    case "SEATS_UNAVAILABLE":
      return "Diese Plätze sind gerade nicht mehr frei — bitte neu wählen.";
    case "COMPANION_SEAT_UNAVAILABLE":
      return "Neben dem gewählten Rollstuhlplatz ist kein Begleitplatz frei. Bitte anderen Platz wählen.";
    case "SEATS_REQUIRED":
      return "Bitte wähle die Plätze auf dem Saalplan.";
    case "QUANTITY_LIMIT":
      return "Ungültige Anzahl.";
    default:
      return code || "Fehler beim Hinzufügen";
  }
}

export function SeatBookingPanel({
  eventId,
  bookingMode,
  categories,
  feeSurchargeNote,
  showRemainingAvailability = false,
  cartHref = "/warenkorb",
  checkoutHref = "/checkout",
}: Props) {
  const { bump } = useCart();
  const seatCategories = categories.filter((c) => c.needsSeats);
  const freeCategories = categories.filter((c) => !c.needsSeats);

  const [mode, setMode] = useState<"best_available" | "seat_map">(
    bookingMode === "best_available" ? "best_available" : "seat_map",
  );
  const [categoryId, setCategoryId] = useState(seatCategories[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [map, setMap] = useState<SeatMapPayload | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [addedSeatLabels, setAddedSeatLabels] = useState<string[]>([]);
  const [freeQty, setFreeQty] = useState<Record<string, number>>(
    Object.fromEntries(freeCategories.map((c) => [c.id, 1])),
  );

  const selectedCategory = seatCategories.find((c) => c.id === categoryId) ?? null;
  const companionFree = Boolean(selectedCategory?.companionFree);
  const maxQty = selectedCategory
    ? Math.min(selectedCategory.maxPerOrder, Math.max(0, selectedCategory.available))
    : 1;

  const loadMap = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/seats`);
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
    setSelectedIds((prev) => prev.slice(0, qty));
  }, [qty]);

  const selectedSeats = useMemo(() => {
    if (!map) return [];
    const all = map.blocks.flatMap((b) => b.seats);
    return selectedIds
      .map((id) => all.find((s) => s.id === id))
      .filter(Boolean) as PublicSeat[];
  }, [map, selectedIds]);

  function toggleSeat(seat: PublicSeat) {
    setSelectedIds((prev) => {
      if (prev.includes(seat.id)) return prev.filter((id) => id !== seat.id);
      if (prev.length >= qty) {
        return [...prev.slice(1), seat.id];
      }
      return [...prev, seat.id];
    });
  }

  async function addReserved() {
    if (!selectedCategory) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        categoryId: selectedCategory.id,
        quantity: qty,
        seatingMode: mode,
      };
      if (mode === "seat_map") {
        if (selectedIds.length !== qty) {
          setError("Bitte genau so viele Plätze wählen wie Tickets.");
          return;
        }
        body.seatIds = selectedIds;
      }
      const response = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(errorLabel(String(data?.error?.code ?? "")));
        void loadMap();
        return;
      }
      bump({
        itemCount: data?.summary?.itemCount,
        expiresAt: data?.expiresAt
          ? typeof data.expiresAt === "string"
            ? data.expiresAt
            : new Date(data.expiresAt).toISOString()
          : undefined,
      });
      const labels = Array.isArray(data?.seats)
        ? (data.seats as { seatLabel?: string }[])
            .map((s) => s.seatLabel)
            .filter((s): s is string => Boolean(s))
        : [];
      setAddedSeatLabels(labels);
      setJustAdded(true);
      setSelectedIds([]);
      void loadMap();
    } finally {
      setLoading(false);
    }
  }

  async function addFree(catId: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: catId,
          quantity: freeQty[catId] ?? 1,
          seatingMode: "free",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(errorLabel(String(data?.error?.code ?? "")));
        return;
      }
      bump({
        itemCount: data?.summary?.itemCount,
        expiresAt: data?.expiresAt
          ? typeof data.expiresAt === "string"
            ? data.expiresAt
            : new Date(data.expiresAt).toISOString()
          : undefined,
      });
      setJustAdded(true);
    } finally {
      setLoading(false);
    }
  }

  if (categories.length === 0) {
    return (
      <p className="text-base text-[var(--tf-text-secondary)]">Aktuell keine buchbaren Kategorien.</p>
    );
  }

  return (
    <div className="space-y-5">
      {seatCategories.length > 0 ? (
        <div className="space-y-4">
          {bookingMode === "seat_map_and_best" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("seat_map")}
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
                    Reihe und Platz selbst aussuchen
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("best_available");
                  setSelectedIds([]);
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
                    Wir finden die besten Plätze — möglichst nebeneinander
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
              Bestplatzbuchung: Wir weisen dir automatisch die besten freien Plätze zu.
            </p>
          )}

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Preiskategorie</span>
            <select
              className="tf-input"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSelectedIds([]);
              }}
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
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                disabled={qty >= maxQty}
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {showRemainingAvailability && selectedCategory ? (
              <span className="text-xs text-[var(--tf-text-secondary)]">
                Noch {selectedCategory.available} verfügbar
              </span>
            ) : null}
          </div>

          {mode === "seat_map" ? (
            <div className="space-y-3">
              {mapLoading && !map ? (
                <p className="text-sm text-[var(--tf-text-secondary)]">Saalplan wird geladen…</p>
              ) : map ? (
                <SeatMap
                  map={map}
                  selectedIds={selectedIds}
                  onToggle={toggleSeat}
                  maxSelect={qty}
                  hint={
                    companionFree
                      ? "Wähle den Rollstuhlplatz — der Begleitplatz daneben wird automatisch mitreserviert."
                      : "Tippe auf freie Plätze. Türkis = deine Auswahl."
                  }
                />
              ) : (
                <p className="text-sm text-[var(--danger)]">Saalplan nicht verfügbar.</p>
              )}
              {selectedSeats.length > 0 ? (
                <ul className="space-y-1 text-sm text-[var(--tf-navy)]">
                  {selectedSeats.map((s) => (
                    <li key={s.id} className="font-medium">
                      {formatSeatLabel(s)}
                      {companionFree ? (
                        <span className="ml-1 font-normal text-[var(--tf-text-secondary)]">
                          (+ Begleitung)
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--tf-text-secondary)]">
              {companionFree
                ? "Wir suchen die besten freien Rollstuhlplätze inkl. Begleitung nebeneinander."
                : "Wir suchen die besten freien Plätze — möglichst nebeneinander in einer Reihe."}
            </p>
          )}

          <button
            type="button"
            className="tf-btn tf-btn-primary w-full !min-h-12"
            disabled={
              loading ||
              !selectedCategory ||
              selectedCategory.available < 1 ||
              (mode === "seat_map" && selectedIds.length !== qty)
            }
            onClick={() => void addReserved()}
          >
            {loading
              ? "Reserviert…"
              : mode === "best_available"
                ? `${qty}× Bestplätze in den Warenkorb`
                : `${qty}× gewählte Plätze in den Warenkorb`}
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
            const current = freeQty[category.id] ?? 1;
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
                          [category.id]: Math.min(max, current + 1),
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="tf-btn tf-btn-primary !min-h-11 flex-1 text-sm"
                    disabled={soldOut || loading}
                    onClick={() => void addFree(category.id)}
                  >
                    In den Warenkorb
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
          <p className="mt-2">
            <Link href={cartHref} className="font-semibold text-[var(--tf-teal)] underline">
              Warenkorb
            </Link>
            {" · "}
            <Link href={checkoutHref} className="font-semibold text-[var(--tf-teal)] underline">
              Zur Kasse
            </Link>
          </p>
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
