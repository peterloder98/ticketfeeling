"use client";

import { useMemo, useState } from "react";

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
};

function planEditorHref(planId: string, eventId?: string) {
  if (!eventId) return `/admin/saalplan/${planId}`;
  const returnTo = encodeURIComponent(`/admin/events/${eventId}#saalplan`);
  const returnLabel = encodeURIComponent("Zurück zum Event");
  return `/admin/saalplan/${planId}?returnTo=${returnTo}&returnLabel=${returnLabel}`;
}

export function EventVenuePlanFields({
  locations,
  plans,
  initialLocationId,
  initialVenuePlanId,
  initialSeatingBookingMode = "none",
  eventId,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId);
  const [venuePlanId, setVenuePlanId] = useState(initialVenuePlanId);
  const [bookingMode, setBookingMode] = useState(
    initialVenuePlanId
      ? initialSeatingBookingMode === "none"
        ? "seat_map_and_best"
        : initialSeatingBookingMode
      : "none",
  );

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
      <label className="grid gap-1">
        <span className="font-medium">Location</span>
        <select
          name="locationId"
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
          name="venuePlanId"
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

      <input type="hidden" name="seatingBookingMode" value={venuePlanId ? bookingMode : "none"} />

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
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--tf-teal)] hover:underline"
            >
              Saalplan bearbeiten
            </a>
          </p>
        </fieldset>
      ) : null}
    </>
  );
}
