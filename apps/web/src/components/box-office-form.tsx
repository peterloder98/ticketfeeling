"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEuroFromCents } from "@/lib/money";
import { computePlatformFeeGrossCents } from "@/lib/commerce/platform-fee";
import { formatFeePercentageLabel } from "@/lib/commerce/public-price";
import { Minus, Plus, ArrowLeft, Check, Armchair, Map } from "lucide-react";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  filterPostalCodeInput,
  filterStreetNameInput,
} from "@/lib/commerce/address";
import { SeatMap } from "@/components/seat-map";
import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";
import { formatSeatLabel } from "@/lib/seating/types";
import {
  countAvailableForCategory,
  multiCategorySelectionCap,
} from "@/lib/seating/availability";
import { applyDiscountOff } from "@/lib/commerce/event-pricing";
import { CampaignPriceDisplay } from "@/components/campaign-price-display";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  priceGrossCents: number;
  listPriceGrossCents?: number;
  campaignName?: string | null;
  campaignValidUntil?: string | null;
  available: number;
  maxPerOrder?: number;
  saleLabel?: string | null;
  needsSeats?: boolean;
  categoryKind?: string;
  companionFree?: boolean;
};

type EventOption = {
  id: string;
  name: string;
  whenLabel?: string | null;
  locationLabel?: string | null;
  hasReservedSeating?: boolean;
  seatingBookingMode?: "none" | "best_available" | "seat_map_and_best";
  accessibilityOffer?: { label: string; type: string; value: number } | null;
  categories: Category[];
};

type FeeConfig = {
  enabled: boolean;
  percentageBasisPoints: number;
  displayName: string;
};

type SeatingChoice = "best_available" | "seat_map";

const STEPS = [
  { id: "event", title: "Event" },
  { id: "tickets", title: "Tickets" },
  { id: "customer", title: "Kunde" },
  { id: "pay", title: "Zahlung" },
] as const;

function eurosToCents(raw: string) {
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function BoxOfficeForm({
  events,
  feeConfig,
}: {
  events: EventOption[];
  feeConfig: FeeConfig;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [eventId, setEventId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [seatingChoice, setSeatingChoice] = useState<SeatingChoice>("best_available");
  const [selectedByCategory, setSelectedByCategory] = useState<Record<string, string[]>>({});
  const [map, setMap] = useState<SeatMapPayload | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card_present" | "card_terminal"
  >("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [streetHint, setStreetHint] = useState<string | null>(null);
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [postalHint, setPostalHint] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessibilitySelected, setAccessibilitySelected] = useState(false);
  const [tapWait, setTapWait] = useState<{
    orderId: string;
    deepLink: string;
    amountCents: number;
    reservedUntil: string | null;
  } | null>(null);
  const [tapPolling, setTapPolling] = useState(false);

  const selectedEvent = events.find((e) => e.id === eventId) ?? null;
  const categories = useMemo(
    () => selectedEvent?.categories ?? [],
    [selectedEvent?.categories],
  );
  const hasReservedSeating = Boolean(selectedEvent?.hasReservedSeating);
  const seatedCategories = useMemo(
    () => categories.filter((c) => c.needsSeats && c.categoryKind !== "standing"),
    [categories],
  );
  const standingCategories = useMemo(
    () => categories.filter((c) => c.categoryKind === "standing"),
    [categories],
  );
  /** Numbered seats only — Stehplatz uses qty, not Saalplan pick. */
  const seatCategories = seatedCategories;

  const lineItems = useMemo(
    () =>
      categories
        .map((c) => ({ category: c, quantity: qty[c.id] ?? 0 }))
        .filter((l) => l.quantity > 0),
    [categories, qty],
  );

  function unitPrice(cat: Category) {
    const base = cat.priceGrossCents;
    const offer = selectedEvent?.accessibilityOffer;
    if (!accessibilitySelected || !offer) return base;
    return applyDiscountOff(base, offer.type, offer.value);
  }

  const ticketsGrossCents = lineItems.reduce(
    (s, l) => s + l.quantity * unitPrice(l.category),
    0,
  );
  const feeGrossCents =
    feeConfig.enabled && ticketsGrossCents > 0
      ? computePlatformFeeGrossCents(ticketsGrossCents, feeConfig.percentageBasisPoints)
      : 0;
  const totalCents = ticketsGrossCents + feeGrossCents;
  const cashTenderedCents = cashGiven.trim() ? eurosToCents(cashGiven) : null;
  const changeCents =
    paymentMethod === "cash" && cashTenderedCents != null
      ? cashTenderedCents - totalCents
      : null;

  const allSelectedIds = useMemo(
    () => Object.values(selectedByCategory).flat(),
    [selectedByCategory],
  );

  function categoryOrderCap(category: Category) {
    return Math.max(1, category.maxPerOrder ?? 10);
  }

  function displayAvailable(category: Category) {
    if (
      seatingChoice === "seat_map" &&
      map &&
      category.needsSeats &&
      category.categoryKind !== "standing"
    ) {
      return Math.min(category.available, countAvailableForCategory(map, category.id));
    }
    return category.available;
  }

  const seatMapMaxSelect = useMemo(() => {
    if (seatingChoice !== "seat_map") return 0;
    return multiCategorySelectionCap(
      seatCategories.map((c) => ({
        id: c.id,
        maxPerOrder: categoryOrderCap(c),
        available: c.available,
      })),
      selectedByCategory,
      (id) => (map ? countAvailableForCategory(map, id) : Number.POSITIVE_INFINITY),
    );
  }, [seatingChoice, seatCategories, selectedByCategory, map]);

  const uniformMaxPerCategory = useMemo(() => {
    if (seatCategories.length === 0) return null;
    const first = categoryOrderCap(seatCategories[0]);
    return seatCategories.every((c) => categoryOrderCap(c) === first) ? first : null;
  }, [seatCategories]);

  const mapFreeCount = useMemo(() => {
    if (!map || seatingChoice !== "seat_map") return map?.availableCount ?? 0;
    return seatCategories.reduce(
      (sum, c) => sum + countAvailableForCategory(map, c.id),
      0,
    );
  }, [map, seatingChoice, seatCategories]);

  const loadMap = useCallback(async () => {
    if (!eventId || !hasReservedSeating) return;
    setMapLoading(true);
    try {
      // Full map (no category filter) so mixed categories can be picked in one go.
      const res = await fetch(`/api/v1/events/${eventId}/seats`);
      const data = await res.json();
      if (res.ok) setMap(data.map as SeatMapPayload);
      else setMap(null);
    } finally {
      setMapLoading(false);
    }
  }, [eventId, hasReservedSeating]);

  useEffect(() => {
    if (step === 1 && hasReservedSeating && seatingChoice === "seat_map") {
      void loadMap();
    }
  }, [step, hasReservedSeating, seatingChoice, loadMap]);

  function setCategoryQty(categoryId: string, next: number, max: number) {
    const clamped = Math.max(0, Math.min(max, next));
    setQty((prev) => ({ ...prev, [categoryId]: clamped }));
    if (seatingChoice === "seat_map") {
      setSelectedByCategory((prev) => {
        const cur = prev[categoryId] ?? [];
        if (cur.length <= clamped) return prev;
        return { ...prev, [categoryId]: cur.slice(0, clamped) };
      });
    }
  }

  function selectEvent(id: string) {
    setEventId(id);
    setQty({});
    setSelectedByCategory({});
    setMap(null);
    setSeatingChoice("best_available");
    setError(null);
    setStep(1);
  }

  function toggleSeat(seat: PublicSeat) {
    if (seat.locked || seat.status === "locked" || seat.status === "taken") return;
    if (seat.status === "held_by_you" || seat.status !== "available") return;
    const hasAssignments = map?.blocks.some((b) => b.seats.some((s) => s.categoryId));
    const categoryId = hasAssignments
      ? seat.categoryId
      : seatCategories[0]?.id ?? null;
    if (!categoryId) return;
    const category = categories.find((c) => c.id === categoryId);
    if (!category?.needsSeats) return;
    const max = Math.min(categoryOrderCap(category), displayAvailable(category));
    setSelectedByCategory((prev) => {
      const cur = prev[categoryId] ?? [];
      if (cur.includes(seat.id)) {
        const next = cur.filter((id) => id !== seat.id);
        setQty((q) => ({ ...q, [categoryId]: next.length }));
        return { ...prev, [categoryId]: next };
      }
      if (cur.length >= max) return prev;
      const next = [...cur, seat.id];
      setQty((q) => ({ ...q, [categoryId]: next.length }));
      return { ...prev, [categoryId]: next };
    });
  }

  function validateTicketsStep(): string | null {
    if (lineItems.length === 0) return "Bitte mindestens ein Ticket wählen.";
    if (!hasReservedSeating || seatingChoice !== "seat_map") return null;
    for (const line of lineItems) {
      if (!line.category.needsSeats) continue;
      const picked = selectedByCategory[line.category.id] ?? [];
      if (picked.length !== line.quantity) {
        return `Bitte ${line.quantity} Platz${line.quantity === 1 ? "" : "e"} für „${line.category.name}“ im Saalplan wählen.`;
      }
    }
    return null;
  }

  const selectedSeatLabels = useMemo(() => {
    if (!map || seatingChoice !== "seat_map") return [] as string[];
    const all = map.blocks.flatMap((b) => b.seats);
    const labels: string[] = [];
    for (const line of lineItems) {
      if (!line.category.needsSeats) continue;
      for (const id of selectedByCategory[line.category.id] ?? []) {
        const seat = all.find((s) => s.id === id);
        if (seat) labels.push(formatSeatLabel(seat));
      }
    }
    return labels;
  }, [map, seatingChoice, lineItems, selectedByCategory]);

  async function confirmSale() {
    if (!eventId || lineItems.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      if (paymentMethod === "card_present") {
        const response = await fetch("/api/v1/box-office/sales/tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            seatingMode: hasReservedSeating ? seatingChoice : "free",
            items: lineItems.map((l) => ({
              categoryId: l.category.id,
              quantity: l.quantity,
              accessibilitySelected: Boolean(
                selectedEvent?.accessibilityOffer && accessibilitySelected,
              ),
              ...(hasReservedSeating &&
              seatingChoice === "seat_map" &&
              l.category.needsSeats
                ? { seatIds: selectedByCategory[l.category.id] ?? [] }
                : {}),
            })),
            customerFirstName: firstName.trim() || undefined,
            customerLastName: lastName.trim() || undefined,
            customerEmail: email.trim() || undefined,
            customerStreet: street.trim() || undefined,
            customerHouseNumber: houseNumber.trim() || undefined,
            customerPostalCode: postalCode.trim() || undefined,
            customerCity: city.trim() || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const code = String(data?.error?.code ?? "");
          setError(
            code === "STRIPE_TERMINAL_NOT_CONFIGURED"
              ? "Tap to Pay ist noch nicht eingerichtet (Stripe Terminal Location fehlt)."
              : code === "SOLD_OUT"
                ? "Nicht genug Tickets verfügbar."
                : code === "SEATS_UNAVAILABLE" || code === "SEATS_REQUIRED"
                  ? "Plätze nicht mehr verfügbar — bitte erneut wählen."
                  : code === "COMPANION_SEAT_UNAVAILABLE"
                    ? "Kein freier Begleitplatz neben dem Rollstuhlplatz."
                    : code || "Tap to Pay konnte nicht gestartet werden",
          );
          if (seatingChoice === "seat_map") void loadMap();
          return;
        }
        setTapWait({
          orderId: data.orderId as string,
          deepLink: data.deepLink as string,
          amountCents: Number(data.amountCents) || totalCents,
          reservedUntil: (data.reservedUntil as string) ?? null,
        });
        setTapPolling(true);
        return;
      }

      const response = await fetch("/api/v1/box-office/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          seatingMode: hasReservedSeating ? seatingChoice : "free",
          items: lineItems.map((l) => ({
            categoryId: l.category.id,
            quantity: l.quantity,
            accessibilitySelected: Boolean(
              selectedEvent?.accessibilityOffer && accessibilitySelected,
            ),
            ...(hasReservedSeating &&
            seatingChoice === "seat_map" &&
            l.category.needsSeats
              ? { seatIds: selectedByCategory[l.category.id] ?? [] }
              : {}),
          })),
          paymentMethod,
          cashTenderedCents:
            paymentMethod === "cash" && cashTenderedCents != null ? cashTenderedCents : undefined,
          customerFirstName: firstName.trim() || undefined,
          customerLastName: lastName.trim() || undefined,
          customerEmail: email.trim() || undefined,
          customerStreet: street.trim() || undefined,
          customerHouseNumber: houseNumber.trim() || undefined,
          customerPostalCode: postalCode.trim() || undefined,
          customerCity: city.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = String(data?.error?.code ?? "");
        setError(
          code === "SOLD_OUT"
            ? "Nicht genug Tickets verfügbar."
            : code === "SEATS_UNAVAILABLE" || code === "SEATS_REQUIRED"
              ? "Plätze nicht mehr verfügbar — bitte erneut wählen."
              : code === "COMPANION_SEAT_UNAVAILABLE"
                ? "Kein freier Begleitplatz neben dem Rollstuhlplatz."
                : code || "Verkauf fehlgeschlagen",
        );
        if (seatingChoice === "seat_map") void loadMap();
        return;
      }
      router.push(data.detailPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tapWait || !tapPolling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/v1/box-office/sales/${tapWait.orderId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ready) {
          setTapPolling(false);
          router.push(data.detailPath ?? `/kasse/beleg/${tapWait.orderId}`);
          router.refresh();
          return;
        }
        if (res.ok && (data.paymentStatus === "failed" || data.paymentStatus === "canceled")) {
          setTapPolling(false);
          setTapWait(null);
          setError("Kartenzahlung abgebrochen oder fehlgeschlagen. Bitte erneut versuchen.");
        }
      } catch {
        // keep polling
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tapWait, tapPolling, router]);

  async function cancelTapSale() {
    if (!tapWait) return;
    setLoading(true);
    try {
      await fetch(`/api/v1/box-office/sales/${tapWait.orderId}`, { method: "DELETE" });
    } finally {
      setTapPolling(false);
      setTapWait(null);
      setLoading(false);
      setError(null);
    }
  }

  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--tf-line)] bg-white p-6 text-[var(--tf-text-secondary)]">
        Keine verkaufbaren Events für diesen Zugang.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li
              key={s.id}
              className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold sm:text-sm ${
                active
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.1)] text-[var(--tf-navy)]"
                  : done
                    ? "border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] text-[var(--tf-navy)]"
                    : "border-[var(--tf-line)] text-[var(--tf-text-secondary)]"
              }`}
            >
              <span className="hidden sm:inline">{i + 1}. </span>
              {s.title}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="rounded-xl border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {/* Step 1 — Event */}
      {step === 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--tf-navy)]">Welches Event?</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              Wähle die Veranstaltung für diesen Verkauf.
            </p>
          </div>
          <div className="grid gap-3">
            {events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => selectEvent(ev.id)}
                className="rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-left transition hover:border-[var(--tf-teal)] hover:shadow-[0_8px_24px_rgba(15,39,71,0.08)]"
              >
                <p className="text-lg font-semibold text-[var(--tf-navy)]">{ev.name}</p>
                {ev.whenLabel ? (
                  <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{ev.whenLabel}</p>
                ) : null}
                {ev.locationLabel ? (
                  <p className="text-sm text-[var(--tf-text-secondary)]">{ev.locationLabel}</p>
                ) : null}
                <p className="mt-2 text-xs font-medium text-[var(--tf-teal)]">
                  {ev.categories.length} Kategorie
                  {ev.categories.length === 1 ? "" : "n"}
                  {ev.hasReservedSeating ? " · mit Saalplan" : ""} · Tippen zum Auswählen
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Step 2 — Tickets */}
      {step === 1 && selectedEvent ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--tf-navy)]">Tickets wählen</h2>
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{selectedEvent.name}</p>
            </div>
            <button type="button" className="tf-btn text-sm" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-1 inline h-4 w-4" /> Anderes Event
            </button>
          </div>

          {hasReservedSeating && seatCategories.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSeatingChoice("best_available");
                  setSelectedByCategory({});
                  setError(null);
                }}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  seatingChoice === "best_available"
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] ring-2 ring-[rgba(20,184,166,0.2)]"
                    : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]"
                }`}
              >
                <Armchair className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-navy)]" />
                <span>
                  <span className="font-semibold text-[var(--tf-navy)]">Bestplatz</span>
                  <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                    {seatCategories.every((c) => c.categoryKind === "standing")
                      ? "System reserviert freie Stehplätze aus dem zugeordneten Bereich"
                      : "System vergibt die besten freien Sitzplätze, möglichst nebeneinander"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeatingChoice("seat_map");
                  // Seats on the map drive quantities — drop leftover Bestplatz counts.
                  setQty((prev) => {
                    const next = { ...prev };
                    for (const c of seatCategories) {
                      next[c.id] = 0;
                    }
                    return next;
                  });
                  setSelectedByCategory({});
                  setError(null);
                }}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  seatingChoice === "seat_map"
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] ring-2 ring-[rgba(20,184,166,0.2)]"
                    : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]"
                }`}
              >
                <Map className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-navy)]" />
                <span>
                  <span className="font-semibold text-[var(--tf-navy)]">Saalplan</span>
                  <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                    Sitzplätze selbst wählen — Stehplätze separat über Menge
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            {selectedEvent?.accessibilityOffer ? (
              <label className="flex items-start gap-2 rounded-2xl border border-[var(--tf-line)] bg-white px-3 py-2.5 text-sm text-[var(--tf-navy)]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={accessibilitySelected}
                  onChange={(e) => setAccessibilitySelected(e.target.checked)}
                />
                <span>
                  <span className="font-semibold">
                    {selectedEvent.accessibilityOffer.label}
                  </span>
                  <span className="mt-0.5 block text-[var(--tf-text-secondary)]">
                    Ermäßigten Preis anwenden
                  </span>
                </span>
              </label>
            ) : null}
            {seatedCategories.length > 0 ? (
              <p className="text-sm font-semibold text-[var(--tf-navy)]">Sitzplätze</p>
            ) : null}
            {categories.map((category) => {
              const isStanding = category.categoryKind === "standing";
              const showStandingHeading =
                isStanding &&
                standingCategories[0]?.id === category.id &&
                seatedCategories.length > 0;
              const current = qty[category.id] ?? 0;
              const available = displayAvailable(category);
              const max = Math.min(categoryOrderCap(category), available);
              const soldOut = available < 1;
              const picked = selectedByCategory[category.id]?.length ?? 0;
              return (
                <div key={category.id} className="space-y-2">
                  {showStandingHeading ? (
                    <p className="pt-2 text-sm font-semibold text-[var(--tf-navy)]">
                      Stehplätze
                      <span className="ml-2 font-normal text-[var(--tf-text-secondary)]">
                        · Menge wählen, kein Saalplan
                      </span>
                    </p>
                  ) : null}
                <div
                  className={`rounded-2xl border bg-white p-4 ${
                    current > 0 ? "border-[var(--tf-teal)]" : "border-[var(--tf-line)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-[var(--tf-navy)]">
                          {category.name}
                        </p>
                        {category.saleLabel ? (
                          <span className="rounded-full bg-[rgba(20,184,166,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tf-teal)]">
                            {category.saleLabel}
                          </span>
                        ) : null}
                      </div>
                      {category.description ? (
                        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                          {category.description}
                        </p>
                      ) : null}
                      <CampaignPriceDisplay
                        className="mt-2"
                        listCents={category.listPriceGrossCents ?? category.priceGrossCents}
                        unitCents={unitPrice(category)}
                        promoLabel={
                          accessibilitySelected && selectedEvent?.accessibilityOffer
                            ? selectedEvent.accessibilityOffer.label
                            : category.campaignName
                        }
                        validUntil={
                          accessibilitySelected && selectedEvent?.accessibilityOffer
                            ? null
                            : category.campaignValidUntil
                        }
                        size="md"
                      />
                      <p className="text-xs text-[var(--tf-text-secondary)]">
                        {soldOut ? "Ausverkauft" : `Verfügbar: ${available}`}
                        {feeConfig.enabled
                          ? ` · zzgl. ${formatFeePercentageLabel(feeConfig.percentageBasisPoints)} ${feeConfig.displayName}`
                          : ""}
                        {seatingChoice === "seat_map" &&
                        category.needsSeats &&
                        category.categoryKind !== "standing" &&
                        current > 0
                          ? ` · ${picked}/${current} Plätze gewählt`
                          : ""}
                      </p>
                    </div>
                    <div className="inline-flex items-center rounded-xl border border-[var(--tf-line)]">
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                        disabled={soldOut || current <= 0}
                        onClick={() => setCategoryQty(category.id, current - 1, max)}
                        aria-label="Weniger"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-10 text-center text-base font-semibold tabular-nums">
                        {current}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                        disabled={
                          soldOut ||
                          current >= max ||
                          (seatingChoice === "seat_map" &&
                            Boolean(category.needsSeats) &&
                            category.categoryKind !== "standing")
                        }
                        onClick={() => setCategoryQty(category.id, current + 1, max)}
                        aria-label="Mehr"
                        title={
                          seatingChoice === "seat_map" &&
                          category.needsSeats &&
                          category.categoryKind !== "standing"
                            ? "Plätze direkt im Saalplan antippen"
                            : undefined
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              );
            })}
          </div>

          {seatingChoice === "seat_map" && hasReservedSeating ? (
            <div className="space-y-3 rounded-2xl border border-[var(--tf-line)] bg-white p-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--tf-navy)]">Saalplan</h3>
                <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                  Tippe freie Sitzplätze — Stehplätze wählst du über die Menge darüber.
                  {allSelectedIds.length > 0
                    ? ` Aktuell ${allSelectedIds.length} Platz${allSelectedIds.length === 1 ? "" : "e"} gewählt.`
                    : ""}
                  {seatCategories.some((c) => c.companionFree)
                    ? " Beim Rollstuhlplatz wird der Begleitplatz automatisch mitreserviert."
                    : ""}
                </p>
                {lineItems.some((l) => l.category.needsSeats) ? (
                  <ul className="mt-2 space-y-0.5 text-sm text-[var(--tf-navy)]">
                    {lineItems
                      .filter((l) => l.category.needsSeats)
                      .map((l) => {
                        const picked = selectedByCategory[l.category.id]?.length ?? 0;
                        return (
                          <li key={l.category.id} className="font-medium">
                            {picked}× {l.category.name}
                            <span className="ml-1 font-normal text-[var(--tf-text-secondary)]">
                              ({formatEuroFromCents(unitPrice(l.category))})
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                ) : null}
              </div>
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
                  initialZoom={2}
                  hint="Türkis = Auswahl. Kategorienfarben zeigen die Preiszugehörigkeit. Verkauft und gesperrt sind grau."
                />
              ) : (
                <p className="text-sm text-[var(--danger)]">Saalplan nicht verfügbar.</p>
              )}
            </div>
          ) : null}

          {seatingChoice === "best_available" && hasReservedSeating && lineItems.some((l) => l.category.needsSeats) ? (
            <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
              Bestplatz: Beim Abschluss vergibt das System automatisch die besten freien Plätze.
            </p>
          ) : null}

          <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4">
            <div className="flex justify-between text-sm text-[var(--tf-text-secondary)]">
              <span>Tickets</span>
              <span className="tabular-nums">{formatEuroFromCents(ticketsGrossCents)}</span>
            </div>
            {feeGrossCents > 0 ? (
              <div className="mt-1 flex justify-between text-sm text-[var(--tf-text-secondary)]">
                <span>
                  {feeConfig.displayName} (
                  {formatFeePercentageLabel(feeConfig.percentageBasisPoints)})
                </span>
                <span className="tabular-nums">{formatEuroFromCents(feeGrossCents)}</span>
              </div>
            ) : null}
            <div className="mt-3 flex justify-between border-t border-[var(--tf-line)] pt-3 text-lg font-semibold text-[var(--tf-navy)]">
              <span>Gesamt</span>
              <span className="tabular-nums">{formatEuroFromCents(totalCents)}</span>
            </div>
          </div>

          <button
            type="button"
            className="tf-btn tf-btn-primary w-full !min-h-12 text-base"
            disabled={lineItems.length === 0}
            onClick={() => {
              const msg = validateTicketsStep();
              if (msg) {
                setError(msg);
                return;
              }
              setError(null);
              setStep(2);
            }}
          >
            Kaufvorgang starten
          </button>
        </div>
      ) : null}

      {/* Step 3 — Customer */}
      {step === 2 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--tf-navy)]">Kundendaten</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              Standard: Walk-in ohne Kundendaten — direkt zur Zahlung.
            </p>
          </div>
          {selectedSeatLabels.length > 0 ? (
            <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-navy)]">
              Gewählte Plätze: {selectedSeatLabels.join(" · ")}
            </p>
          ) : hasReservedSeating && seatingChoice === "best_available" ? (
            <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
              Bestplatz — Plätze werden bei Zahlung zugewiesen.
            </p>
          ) : null}
          <button
            type="button"
            className="tf-btn tf-btn-primary w-full !min-h-12 text-base"
            onClick={() => {
              setFirstName("");
              setLastName("");
              setEmail("");
              setStreet("");
              setHouseNumber("");
              setPostalCode("");
              setCity("");
              setStep(3);
            }}
          >
            Walk-in — weiter zur Zahlung
          </button>
          <details className="rounded-2xl border border-[var(--tf-line)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--tf-navy)]">
              Kundendaten erfassen (optional)
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Vorname</span>
                <input
                  className="tf-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nachname</span>
                <input
                  className="tf-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium">E-Mail</span>
                <input
                  type="email"
                  className="tf-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kunde@beispiel.de"
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Straße</span>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <input
                    className="tf-input"
                    value={street}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const filtered = filterStreetNameInput(raw);
                      setStreet(filtered);
                      setStreetHint(raw !== filtered ? STREET_NO_NUMBERS_MESSAGE : null);
                    }}
                    placeholder="Straße ohne Hausnummer"
                  />
                  <input
                    className="tf-input"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder="Nr."
                  />
                </div>
                {streetHint ? (
                  <span className="text-xs text-[var(--danger)]">{streetHint}</span>
                ) : null}
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">PLZ</span>
                <input
                  className="tf-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  value={postalCode}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const filtered = filterPostalCodeInput(raw);
                    setPostalCode(filtered);
                    setPostalHint(raw !== filtered ? POSTAL_CODE_DIGITS_ONLY_MESSAGE : null);
                  }}
                  placeholder="12345"
                />
                {postalHint ? (
                  <span className="text-xs text-[var(--danger)]">{postalHint}</span>
                ) : null}
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Ort</span>
                <input className="tf-input" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-primary"
                onClick={() => setStep(3)}
              >
                Weiter zur Zahlung
              </button>
            </div>
          </details>
          <button type="button" className="tf-btn" onClick={() => setStep(1)}>
            Zurück
          </button>
        </div>
      ) : null}

      {/* Step 4 — Payment */}
      {step === 3 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--tf-navy)]">Zahlung</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              {selectedEvent?.name} · {lineItems.reduce((s, l) => s + l.quantity, 0)} Ticket
              {lineItems.reduce((s, l) => s + l.quantity, 0) === 1 ? "" : "s"}
              {hasReservedSeating
                ? seatingChoice === "seat_map"
                  ? " · Saalplan"
                  : " · Bestplatz"
                : ""}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4 text-sm">
            {lineItems.map((l) => (
              <div key={l.category.id} className="flex justify-between gap-3 py-1">
                <span>
                  {l.quantity}× {l.category.name}
                </span>
                <span className="tabular-nums">
                  {formatEuroFromCents(l.quantity * unitPrice(l.category))}
                </span>
              </div>
            ))}
            {selectedSeatLabels.length > 0 ? (
              <p className="mt-2 border-t border-[var(--tf-line)] pt-2 text-xs text-[var(--tf-text-secondary)]">
                {selectedSeatLabels.join(" · ")}
              </p>
            ) : null}
            {feeGrossCents > 0 ? (
              <div className="mt-1 flex justify-between gap-3 border-t border-[var(--tf-line)] pt-2 text-[var(--tf-text-secondary)]">
                <span>{feeConfig.displayName}</span>
                <span className="tabular-nums">{formatEuroFromCents(feeGrossCents)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between gap-3 border-t border-[var(--tf-line)] pt-2 text-lg font-semibold text-[var(--tf-navy)]">
              <span>Zu zahlen</span>
              <span className="tabular-nums">{formatEuroFromCents(totalCents)}</span>
            </div>
          </div>

          {tapWait ? (
            <div className="space-y-4 rounded-2xl border border-[var(--tf-teal)] bg-[rgba(20,184,166,0.06)] p-5">
              <div>
                <h3 className="text-lg font-semibold text-[var(--tf-navy)]">
                  Warte auf Tap to Pay…
                </h3>
                <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                  Betrag{" "}
                  <strong className="text-[var(--tf-navy)]">
                    {formatEuroFromCents(tapWait.amountCents)}
                  </strong>
                  {" · "}Öffne die Kasse-App auf dem iPhone und halte die Karte / das Handy an.
                  Dieser Bildschirm aktualisiert sich automatisch.
                </p>
              </div>
              <a
                href={tapWait.deepLink}
                className="tf-btn tf-btn-primary flex w-full !min-h-12 items-center justify-center text-base"
              >
                Tap to Pay auf iPhone öffnen
              </a>
              <p className="text-xs text-[var(--tf-text-secondary)]">
                Noch keine App? Installiere „Ticketfeeling Kasse“ und erlaube den Link
                <code className="mx-1 rounded bg-white px-1">ticketfeeling-kasse://</code>.
                Die Web-Tageskasse allein kann NFC nicht nutzen.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="tf-btn"
                  disabled={loading}
                  onClick={() => void cancelTapSale()}
                >
                  Abbrechen
                </button>
                <p className="flex items-center text-sm text-[var(--tf-text-secondary)]">
                  {tapPolling ? "Prüfe Zahlungsstatus…" : "Bereit"}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`rounded-2xl border p-4 text-left ${
                    paymentMethod === "cash"
                      ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                      : "border-[var(--tf-line)] bg-white"
                  }`}
                >
                  <p className="font-semibold text-[var(--tf-navy)]">Bar</p>
                  <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                    Mit Wechselgeld-Rechner · sofort gebucht
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card_present")}
                  className={`rounded-2xl border p-4 text-left ${
                    paymentMethod === "card_present"
                      ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                      : "border-[var(--tf-line)] bg-white"
                  }`}
                >
                  <p className="font-semibold text-[var(--tf-navy)]">Karte (Tap to Pay)</p>
                  <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                    iPhone · Stripe · wöchentliche Auszahlung
                  </p>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPaymentMethod("card_terminal")}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                  paymentMethod === "card_terminal"
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                    : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)]"
                }`}
              >
                Externes Terminal (manuell bestätigen, ohne Stripe)
              </button>

              {paymentMethod === "cash" ? (
                <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Kunde gibt (€)</span>
                    <input
                      className="tf-input text-lg tabular-nums"
                      inputMode="decimal"
                      placeholder={(totalCents / 100).toFixed(2).replace(".", ",")}
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                    />
                  </label>
                  {changeCents != null ? (
                    <p
                      className={`mt-3 text-lg font-semibold ${
                        changeCents < 0 ? "text-[var(--danger)]" : "text-[var(--tf-navy)]"
                      }`}
                    >
                      {changeCents < 0
                        ? `Noch ${formatEuroFromCents(-changeCents)} fehlen`
                        : `Wechselgeld: ${formatEuroFromCents(changeCents)}`}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
                      Optional: Betrag eingeben, um Wechselgeld zu berechnen.
                    </p>
                  )}
                </div>
              ) : paymentMethod === "card_present" ? (
                <p className="rounded-xl border border-[var(--tf-line)] bg-white px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
                  Danach öffnet sich Tap to Pay auf dem iPhone. Betrag:{" "}
                  <strong className="text-[var(--tf-navy)]">
                    {formatEuroFromCents(totalCents)}
                  </strong>
                </p>
              ) : (
                <p className="rounded-xl border border-[var(--tf-line)] bg-white px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
                  Betrag am externen Terminal einziehen, dann hier bestätigen:{" "}
                  <strong className="text-[var(--tf-navy)]">
                    {formatEuroFromCents(totalCents)}
                  </strong>
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="tf-btn" onClick={() => setStep(2)} disabled={loading}>
                  Zurück
                </button>
                <button
                  type="button"
                  className="tf-btn tf-btn-primary flex-1 !min-h-12 text-base"
                  disabled={
                    loading ||
                    (paymentMethod === "cash" && changeCents != null && changeCents < 0)
                  }
                  onClick={() => void confirmSale()}
                >
                  {loading ? (
                    "Wird gebucht…"
                  ) : paymentMethod === "card_present" ? (
                    <>
                      <Check className="mr-1 inline h-4 w-4" /> Tap to Pay starten
                    </>
                  ) : (
                    <>
                      <Check className="mr-1 inline h-4 w-4" /> Zahlung erhalten · Verkauf
                      abschließen
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
