"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildSaalplanEditorHref,
  openSaalplanEditorWindow,
  SAALPLAN_WINDOW_NAME,
} from "@/lib/saalplan/popup";
import {
  DEFAULT_SEAT_OPTIMIZATION,
  type SeatOptimizationSettings,
} from "@/lib/seating/seat-optimization-settings";

export type PlanOption = {
  id: string;
  name: string;
  locationId: string;
  seatCapacity: number;
  sizeLabel: string;
};

type Props = {
  locations: { id: string; name: string; city: string | null }[];
  plans: PlanOption[];
  initialLocationId: string;
  initialVenuePlanId: string;
  initialSeatingBookingMode?: string;
  /** Current event id for returnTo when editing the plan. */
  eventId?: string;
  initialSeatOpt?: Partial<SeatOptimizationSettings> | null;
};

function planEditorHref(planId: string, eventId?: string) {
  if (!eventId) return `/admin/saalplan/${planId}`;
  return buildSaalplanEditorHref(planId, {
    returnTo: `/admin/events/${eventId}#saalplan`,
    returnLabel: "Zurück zum Event",
  });
}

function bookingModeFromInitial(
  venuePlanId: string,
  seatingBookingMode: string,
): string {
  if (!venuePlanId) return "none";
  if (seatingBookingMode === "none") return "seat_map_and_best";
  return seatingBookingMode;
}

export function EventVenuePlanFields({
  locations,
  plans,
  initialLocationId,
  initialVenuePlanId,
  initialSeatingBookingMode = "none",
  eventId,
  initialSeatOpt,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId);
  const [venuePlanId, setVenuePlanId] = useState(initialVenuePlanId);
  const [bookingMode, setBookingMode] = useState(
    bookingModeFromInitial(initialVenuePlanId, initialSeatingBookingMode),
  );
  const seatOpt: SeatOptimizationSettings = {
    ...DEFAULT_SEAT_OPTIMIZATION,
    ...(initialSeatOpt ?? {}),
  };

  // Soft save → router.refresh() updates server props; keep controlled fields in sync.
  useEffect(() => {
    setLocationId(initialLocationId);
    setVenuePlanId(initialVenuePlanId);
    setBookingMode(bookingModeFromInitial(initialVenuePlanId, initialSeatingBookingMode));
  }, [initialLocationId, initialVenuePlanId, initialSeatingBookingMode]);

  const plansForLocation = useMemo(
    () => plans.filter((p) => p.locationId === locationId),
    [plans, locationId],
  );

  function selectPlan(nextPlanId: string) {
    setVenuePlanId(nextPlanId);
    if (!nextPlanId) {
      setBookingMode("none");
    } else if (bookingMode === "none") {
      setBookingMode("seat_map_and_best");
    }
  }

  return (
    <>
      {/* Hidden inputs: controlled selects can miss FormData on soft client actions. */}
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="venuePlanId" value={venuePlanId} />
      <input type="hidden" name="seatingBookingMode" value={venuePlanId ? bookingMode : "none"} />

      <label className="grid gap-1">
        <span className="font-medium">Location</span>
        <select
          className="tf-input"
          value={locationId}
          onChange={(e) => {
            const next = e.target.value;
            setLocationId(next);
            const stillValid = plans.some(
              (p) => p.id === venuePlanId && p.locationId === next,
            );
            if (!stillValid) selectPlan("");
          }}
        >
          <option value="">— keine —</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
              {loc.city ? ` (${loc.city})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-medium">Saalplan</span>
        <select
          className="tf-input"
          value={venuePlanId}
          onChange={(e) => selectPlan(e.target.value)}
          disabled={!locationId}
        >
          <option value="">— keiner (Steh / freie Platzwahl) —</option>
          {plansForLocation.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.seatCapacity > 0 ? ` · ${p.seatCapacity} Sitze` : ""} · {p.sizeLabel}
            </option>
          ))}
        </select>
      </label>

      {venuePlanId ? (
        <fieldset
          id="saalplan"
          className="md:col-span-2 scroll-mt-24 space-y-3 rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-4"
        >
          <legend className="px-1 text-sm font-semibold text-[var(--tf-navy)]">
            Saalplan & Buchung
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-3 text-sm ${
                bookingMode === "seat_map_and_best"
                  ? "border-[var(--tf-teal)] ring-2 ring-[rgba(20,184,166,0.25)]"
                  : "border-[var(--tf-line)]"
              }`}
            >
              <input
                type="radio"
                checked={bookingMode === "seat_map_and_best"}
                onChange={() => setBookingMode("seat_map_and_best")}
              />
              <span className="font-semibold text-[var(--tf-navy)]">
                Saalplan + Bestplatzbuchung
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-3 text-sm ${
                bookingMode === "best_available"
                  ? "border-[var(--tf-teal)] ring-2 ring-[rgba(20,184,166,0.25)]"
                  : "border-[var(--tf-line)]"
              }`}
            >
              <input
                type="radio"
                checked={bookingMode === "best_available"}
                onChange={() => setBookingMode("best_available")}
              />
              <span className="font-semibold text-[var(--tf-navy)]">Nur Bestplatzbuchung</span>
            </label>
          </div>
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Geometrie im Editor — Preiskategorien ordnest du unten am Event zu.{" "}
            <a
              href={planEditorHref(venuePlanId, eventId)}
              target={SAALPLAN_WINDOW_NAME}
              className="font-semibold text-[var(--tf-teal)] hover:underline"
              onClick={(e) => {
                e.preventDefault();
                openSaalplanEditorWindow(planEditorHref(venuePlanId, eventId));
              }}
            >
              Saalplan bearbeiten
            </a>
          </p>

          <div className="space-y-3 rounded-xl border border-[var(--tf-line)] bg-white p-3">
            <input type="hidden" name="seatOptPanel" value="1" />
            <p className="text-sm font-semibold text-[var(--tf-navy)]">Sitzplatzoptimierung</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="seatOptPreferContiguous"
                className="mt-0.5"
                defaultChecked={seatOpt.preferContiguous}
              />
              <span>Zusammenhängende Plätze bei Bestplatz bevorzugen</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="seatOptPreventNewSingletons"
                className="mt-0.5"
                defaultChecked={seatOpt.preventNewSingletonGaps}
              />
              <span>Neue Einzelplatzlücken verhindern</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="seatOptIntelligentRemnants"
                className="mt-0.5"
                defaultChecked={seatOpt.intelligentRemnantOptimization}
              />
              <span>Intelligente Restplatzoptimierung</span>
            </label>
            <label className="grid gap-1 text-sm sm:max-w-xs">
              <span>Lückenregel automatisch lockern ab Auslastung (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                name="seatOptGapRelaxOccupancyPercent"
                className="tf-input !min-h-10"
                defaultValue={seatOpt.gapRuleRelaxOccupancyPercent}
              />
            </label>
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Auslastung zählt nur verkaufbare Sitze (ohne gesperrte). Oberhalb der Schwelle wird
              die Lückenregel weich — Bestplatz nutzt weiter die Restplatz-Bewertung.
            </p>
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
