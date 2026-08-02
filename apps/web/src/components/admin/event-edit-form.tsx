"use client";

import { useState } from "react";
import Link from "next/link";
import { updateEventAction } from "@/app/admin/events/actions";
import { EVENT_STATUSES, toDatetimeLocalValue } from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import { SmartDateTimeInput } from "@/components/admin/smart-datetime-input";
import { EventVenuePlanFields } from "@/components/admin/event-venue-plan-fields";

type LocationOpt = { id: string; name: string; city: string | null };
type PlanOpt = {
  id: string;
  name: string;
  locationId: string;
  seatCapacity: number;
  sizeLabel: string;
};
type TourOpt = { id: string; name: string };

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
    coverImageUrl: string | null;
  };
  locations: LocationOpt[];
  planOptions: PlanOpt[];
  venuePlan: { id: string; name: string } | null;
  tours: TourOpt[];
}) {
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.eventStartsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(event.eventEndsAt));
  const [doorsOpenAt, setDoorsOpenAt] = useState(toDatetimeLocalValue(event.doorsOpenAt));
  const [presaleStartsAt, setPresaleStartsAt] = useState(
    toDatetimeLocalValue(event.presaleStartsAt),
  );

  return (
    <form action={updateEventAction} className="mt-5 grid gap-3 text-sm md:grid-cols-2">
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="coverImageUrl" value={event.coverImageUrl ?? ""} />

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
        <span className="text-xs text-[var(--tf-text-secondary)]">
          Kurzname in der Web-Adresse, z. B.{" "}
          <span className="font-medium text-[var(--tf-navy)]">/event/{event.slug}</span>
        </span>
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
        <span className="text-xs text-[var(--tf-text-secondary)]">
          Zugehörigkeit zur Gesamttour. Ohne eigenes Cover gilt das Tour-Plakat.
        </span>
      </label>

      <label className="grid gap-1 md:col-span-2">
        <span className="font-medium">Status / Verkaufsfreigabe</span>
        <select name="status" className="tf-input" defaultValue={event.status}>
          {EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {eventStatusLabel(status)}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--tf-text-secondary)]">
          Entwurf und Ankündigung verkaufen nie — auch wenn das Vorverkaufsdatum erreicht ist. Zum
          Ticketverkauf aktiv „Verkauf freigegeben“ oder „Veröffentlicht“ wählen.
        </span>
      </label>

      <label className="flex items-start gap-2 md:col-span-2">
        <input
          type="checkbox"
          name="showRemainingAvailability"
          className="mt-1"
          defaultChecked={event.showRemainingAvailability}
        />
        <span>
          <span className="font-medium">Restliche Verfügbarkeit öffentlich anzeigen</span>
          <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
            Zeigt Stückzahlen und Knappheits-Hinweise auf der Eventseite und in Listen. Aus = nur
            „Ausverkauft“, wenn nichts mehr da ist.
          </span>
        </span>
      </label>

      <EventVenuePlanFields
        locations={locations}
        plans={planOptions}
        initialLocationId={event.locationId ?? ""}
        initialVenuePlanId={event.venuePlanId ?? ""}
        initialSeatingBookingMode={event.seatingBookingMode}
      />
      {venuePlan ? (
        <p className="md:col-span-2 text-xs text-[var(--tf-text-secondary)]">
          Aktuell:{" "}
          <Link
            href={`/admin/saalplan/${venuePlan.id}`}
            className="font-medium text-[var(--tf-navy)] underline"
          >
            {venuePlan.name} bearbeiten
          </Link>
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
          hint="Gilt erst nach aktiver Verkaufsfreigabe."
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
          <option value="7">7 % (Standard Konzert)</option>
          <option value="19">19 %</option>
        </select>
        <span className="text-xs text-[var(--tf-text-secondary)]">
          Für eigene Konzert-Eintrittskarten ist häufig 7 % anwendbar. Bitte Sonderfälle mit deiner
          Steuerberatung prüfen.
        </span>
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

      <div className="md:col-span-2">
        <button type="submit" className="tf-btn tf-btn-primary">
          Event speichern
        </button>
      </div>
    </form>
  );
}
