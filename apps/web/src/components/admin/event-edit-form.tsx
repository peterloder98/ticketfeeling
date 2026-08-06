"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAction } from "@/app/admin/events/actions";
import { EVENT_STATUSES, toDatetimeLocalValue } from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import { isEventSalesReleased } from "@/lib/commerce/event-sale";
import { SmartDateTimeInput } from "@/components/admin/smart-datetime-input";
import { EventVenuePlanFields } from "@/components/admin/event-venue-plan-fields";
import {
  buildSaalplanEditorHref,
  openSaalplanEditorWindow,
  SAALPLAN_WINDOW_NAME,
} from "@/lib/saalplan/popup";

type LocationOpt = { id: string; name: string; city: string | null };
type PlanOpt = {
  id: string;
  name: string;
  locationId: string;
  seatCapacity: number;
  sizeLabel: string;
};
type TourOpt = { id: string; name: string };

function humanizeEventSaveError(code: string): string {
  switch (code) {
    case "NAME_REQUIRED":
      return "Bitte einen Event-Namen eingeben.";
    case "LOCATION_NOT_FOUND":
      return "Die gewählte Location wurde nicht gefunden.";
    case "VENUE_PLAN_NEEDS_LOCATION":
      return "Saalplan braucht eine Location — bitte beides speichern.";
    case "VENUE_PLAN_NOT_FOUND":
      return "Der gewählte Saalplan gehört nicht zu dieser Location.";
    case "TOUR_NOT_FOUND":
      return "Die gewählte Tour wurde nicht gefunden.";
    case "INVALID_STATUS":
      return "Ungültiger Status.";
    case "NOT_FOUND":
      return "Event nicht gefunden.";
    default:
      return code || "Speichern fehlgeschlagen";
  }
}

export function EventEditForm({
  event,
  locations,
  planOptions,
  venuePlan,
  tours,
}: {
  event: {
    id: string;
    name: string;
    subtitle: string | null;
    slug: string;
    status: string;
    tourId: string | null;
    shortDescription: string | null;
    description: string | null;
    showRemainingAvailability: boolean;
    locationId: string | null;
    venuePlanId: string | null;
    seatingBookingMode: string;
    eventStartsAt: Date | null;
    eventEndsAt: Date | null;
    doorsOpenAt: Date | null;
    presaleStartsAt: Date | null;
    ticketTaxRateBasisPoints: number | null;
    administrationFeeTaxMode: string | null;
    administrationFeeCustomTaxRateBasisPoints: number | null;
    sepaMinDaysBeforeEvent: number | null;
    coverImageUrl: string | null;
  };
  locations: LocationOpt[];
  planOptions: PlanOpt[];
  venuePlan: { id: string; name: string } | null;
  tours: TourOpt[];
}) {
  const [status, setStatus] = useState(event.status);
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.eventStartsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(event.eventEndsAt));
  const [doorsOpenAt, setDoorsOpenAt] = useState(toDatetimeLocalValue(event.doorsOpenAt));
  const [presaleStartsAt, setPresaleStartsAt] = useState(
    toDatetimeLocalValue(event.presaleStartsAt),
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onStatusChange(next: string) {
    setStatus(next);
    // Switching into „Im Verkauf“ → Vorverkaufsstart = jetzt (server enforces on save).
    if (isEventSalesReleased(next) && !isEventSalesReleased(status)) {
      setPresaleStartsAt(toDatetimeLocalValue(new Date()));
    }
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateEventAction(formData);
        setSaved(true);
        // Refresh server tree so seating assignment UI appears after plan assign.
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? humanizeEventSaveError(err.message)
            : "Speichern fehlgeschlagen",
        );
      }
    });
  }

  return (
    <form action={onSubmit} className="relative mt-5 grid gap-3 text-sm md:grid-cols-2">
      {pending ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-[rgba(248,250,252,0.72)] backdrop-blur-[1px]"
          aria-live="polite"
        >
          <p className="rounded-xl border border-[var(--tf-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--tf-navy)] shadow-sm">
            Speichert…
          </p>
        </div>
      ) : null}
      <input type="hidden" name="eventId" value={event.id} />

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Name</span>
        <input name="name" className="tf-input" required defaultValue={event.name} />
      </label>

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Kurzbeschreibung</span>
        <textarea
          name="shortDescription"
          rows={2}
          className="tf-input"
          defaultValue={event.shortDescription ?? ""}
        />
      </label>

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Beschreibung</span>
        <textarea
          name="description"
          rows={5}
          className="tf-input"
          defaultValue={event.description ?? ""}
        />
      </label>

      <label className="grid gap-1">
        <span className="font-medium">Untertitel</span>
        <input name="subtitle" className="tf-input" defaultValue={event.subtitle ?? ""} />
      </label>

      <label className="grid gap-1">
        <span className="font-medium">Link-Name</span>
        <input name="slug" className="tf-input" required defaultValue={event.slug} />
      </label>

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Tour</span>
        <select name="tourId" className="tf-input" defaultValue={event.tourId ?? ""}>
          <option value="">Kein Tour-Termin (einzelnes Event)</option>
          {tours.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Status / Verkaufsfreigabe</span>
        <select
          name="status"
          className="tf-input"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {eventStatusLabel(s)}
            </option>
          ))}
        </select>
        {isEventSalesReleased(status) && !isEventSalesReleased(event.status) ? (
          <span className="text-xs text-[var(--tf-text-secondary)]">
            Vorverkaufsstart wird auf jetzt gesetzt — das Event ist sofort online kaufbar.
          </span>
        ) : status === "draft" ? (
          <span className="text-xs text-[var(--tf-text-secondary)]">
            Entwurf erscheint nicht öffentlich. Mit Vorverkaufsstart wird beim Speichern
            automatisch „Verkauf geplant“ gesetzt — und ab dem Start „Im Verkauf“.
          </span>
        ) : status === "announcement" ? (
          <span className="text-xs text-[var(--tf-text-secondary)]">
            Ab Vorverkaufsstart geht das Event automatisch in den Verkauf und erscheint auf
            Startseite und Events.
          </span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 md:col-span-2">
        <input
          type="checkbox"
          name="showRemainingAvailability"
          className="mt-1"
          defaultChecked={event.showRemainingAvailability}
        />
        <span className="font-medium">Restliche Verfügbarkeit öffentlich anzeigen</span>
      </label>

      <EventVenuePlanFields
        locations={locations}
        plans={planOptions}
        initialLocationId={event.locationId ?? ""}
        initialVenuePlanId={event.venuePlanId ?? ""}
        initialSeatingBookingMode={event.seatingBookingMode}
        eventId={event.id}
      />
      {venuePlan ? (
        <p className="md:col-span-2 text-xs text-[var(--tf-text-secondary)]">
          Aktuell:{" "}
          <a
            href={buildSaalplanEditorHref(venuePlan.id, {
              returnTo: `/admin/events/${event.id}#saalplan`,
              returnLabel: "Zurück zum Event",
            })}
            target={SAALPLAN_WINDOW_NAME}
            className="font-medium text-[var(--tf-navy)] underline"
            onClick={(e) => {
              e.preventDefault();
              openSaalplanEditorWindow(
                buildSaalplanEditorHref(venuePlan.id, {
                  returnTo: `/admin/events/${event.id}#saalplan`,
                  returnLabel: "Zurück zum Event",
                }),
              );
            }}
          >
            {venuePlan.name} bearbeiten
          </a>
        </p>
      ) : null}

      <div className="relative z-20 md:col-span-2 grid gap-3 md:grid-cols-2">
        <SmartDateTimeInput
          name="eventStartsAt"
          label="Beginn"
          value={startsAt}
          onChange={setStartsAt}
        />
        <SmartDateTimeInput name="eventEndsAt" label="Ende" value={endsAt} onChange={setEndsAt} />
        <SmartDateTimeInput
          name="doorsOpenAt"
          label="Einlass"
          value={doorsOpenAt}
          onChange={setDoorsOpenAt}
        />
        <SmartDateTimeInput
          name="presaleStartsAt"
          label="Vorverkaufsstart"
          value={presaleStartsAt}
          onChange={setPresaleStartsAt}
        />
      </div>

      <label className="grid gap-1">
        <span className="font-medium">Ticket-Umsatzsteuer (%)</span>
        <select
          name="ticketTaxPercent"
          className="tf-input"
          defaultValue={String((event.ticketTaxRateBasisPoints ?? 700) / 100)}
        >
          <option value="0">0 %</option>
          <option value="7">7 %</option>
          <option value="19">19 %</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-medium">USt Verwaltungsgebühr</span>
        <select
          name="administrationFeeTaxMode"
          className="tf-input"
          defaultValue={event.administrationFeeTaxMode ?? "inherit"}
        >
          <option value="inherit">Steuersatz des Tickets übernehmen</option>
          <option value="custom">Eigener Steuersatz</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-medium">Eigener Gebühren-Steuersatz (%)</span>
        <input
          name="administrationFeeCustomTaxPercent"
          type="number"
          min="0"
          step="0.01"
          className="tf-input"
          defaultValue={((event.administrationFeeCustomTaxRateBasisPoints ?? 700) / 100).toFixed(2)}
        />
      </label>
      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">SEPA deaktivieren (Tage vor Event)</span>
        <input
          name="sepaMinDaysBeforeEvent"
          type="number"
          min="0"
          className="tf-input max-w-xs"
          placeholder="Org-Standard"
          defaultValue={
            event.sepaMinDaysBeforeEvent != null ? String(event.sepaMinDaysBeforeEvent) : ""
          }
        />
        <span className="text-xs text-[var(--tf-text-secondary)]">
          Leer = Organisationseinstellung. Überschreibt den globalen Wert nur für dieses Event.
        </span>
      </label>

      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="tf-btn tf-btn-primary" disabled={pending}>
          {pending ? "Speichert…" : "Event speichern"}
        </button>
        {saved ? (
          <p className="text-sm font-medium text-[var(--tf-teal-hover)]">Änderungen gespeichert.</p>
        ) : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    </form>
  );
}
