"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEuroFromCents } from "@/lib/money";
import { computePlatformFeeGrossCents } from "@/lib/commerce/platform-fee";
import { formatFeePercentageLabel } from "@/lib/commerce/public-price";
import { Minus, Plus, ArrowLeft, Check } from "lucide-react";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  filterPostalCodeInput,
  filterStreetNameInput,
} from "@/lib/commerce/address";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  priceGrossCents: number;
  available: number;
  saleLabel?: string | null;
};

type EventOption = {
  id: string;
  name: string;
  whenLabel?: string | null;
  locationLabel?: string | null;
  categories: Category[];
};

type FeeConfig = {
  enabled: boolean;
  percentageBasisPoints: number;
  displayName: string;
};

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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card_terminal">("cash");
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

  const selectedEvent = events.find((e) => e.id === eventId) ?? null;
  const categories = useMemo(
    () => selectedEvent?.categories ?? [],
    [selectedEvent?.categories],
  );

  const lineItems = useMemo(
    () =>
      categories
        .map((c) => ({ category: c, quantity: qty[c.id] ?? 0 }))
        .filter((l) => l.quantity > 0),
    [categories, qty],
  );

  const ticketsGrossCents = lineItems.reduce(
    (s, l) => s + l.quantity * l.category.priceGrossCents,
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

  function setCategoryQty(categoryId: string, next: number, max: number) {
    setQty((prev) => ({
      ...prev,
      [categoryId]: Math.max(0, Math.min(max, next)),
    }));
  }

  function selectEvent(id: string) {
    setEventId(id);
    setQty({});
    setError(null);
    setStep(1);
  }

  async function confirmSale() {
    if (!eventId || lineItems.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/box-office/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items: lineItems.map((l) => ({
            categoryId: l.category.id,
            quantity: l.quantity,
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
        setError(
          data?.error?.code === "SOLD_OUT"
            ? "Nicht genug Tickets verfügbar."
            : (data?.error?.code ?? "Verkauf fehlgeschlagen"),
        );
        return;
      }
      router.push(data.detailPath);
      router.refresh();
    } finally {
      setLoading(false);
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
                  {ev.categories.length === 1 ? "" : "n"} · Tippen zum Auswählen
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

          <div className="space-y-3">
            {categories.map((category) => {
              const current = qty[category.id] ?? 0;
              const max = Math.min(20, category.available);
              const soldOut = category.available < 1;
              return (
                <div
                  key={category.id}
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
                      <p className="mt-2 text-lg font-bold tabular-nums text-[var(--tf-navy)]">
                        {formatEuroFromCents(category.priceGrossCents)}
                      </p>
                      <p className="text-xs text-[var(--tf-text-secondary)]">
                        {soldOut ? "Ausverkauft" : `Verfügbar: ${category.available}`}
                        {feeConfig.enabled
                          ? ` · zzgl. ${formatFeePercentageLabel(feeConfig.percentageBasisPoints)} ${feeConfig.displayName}`
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
                        disabled={soldOut || current >= max}
                        onClick={() => setCategoryQty(category.id, current + 1, max)}
                        aria-label="Mehr"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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
              if (lineItems.length === 0) {
                setError("Bitte mindestens ein Ticket wählen.");
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
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4 text-sm">
            {lineItems.map((l) => (
              <div key={l.category.id} className="flex justify-between gap-3 py-1">
                <span>
                  {l.quantity}× {l.category.name}
                </span>
                <span className="tabular-nums">
                  {formatEuroFromCents(l.quantity * l.category.priceGrossCents)}
                </span>
              </div>
            ))}
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
                Mit Wechselgeld-Rechner
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card_terminal")}
              className={`rounded-2xl border p-4 text-left ${
                paymentMethod === "card_terminal"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                  : "border-[var(--tf-line)] bg-white"
              }`}
            >
              <p className="font-semibold text-[var(--tf-navy)]">Karte</p>
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                Kartenterminal vor Ort
              </p>
            </button>
          </div>

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
          ) : (
            <p className="rounded-xl border border-[var(--tf-line)] bg-white px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
              Betrag am Terminal einziehen:{" "}
              <strong className="text-[var(--tf-navy)]">{formatEuroFromCents(totalCents)}</strong>
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
              ) : (
                <>
                  <Check className="mr-1 inline h-4 w-4" /> Zahlung erhalten · Verkauf abschließen
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
