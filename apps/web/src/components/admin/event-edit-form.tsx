"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearScheduleChangedNoticeAction,
  updateEventAction,
} from "@/app/admin/events/actions";
import {
  EVENT_STATUSES,
  parseDatetimeLocalBerlin,
  toDatetimeLocalValue,
} from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import { isEventSalesReleased } from "@/lib/commerce/event-sale";
import {
  isScheduleChangeAlertsEnabled,
  scheduleStartChanged,
  shouldConfirmScheduleChange,
  shouldShowScheduleChangedBanner,
  shiftRelativeToStart,
} from "@/lib/commerce/schedule-change";
import { SmartDateTimeInput } from "@/components/admin/smart-datetime-input";
import { EventVenuePlanFields } from "@/components/admin/event-venue-plan-fields";
import {
  buildSaalplanEditorHref,
  openSaalplanEditorWindow,
  SAALPLAN_WINDOW_NAME,
} from "@/lib/saalplan/popup";
import { formatDeDateTime } from "@/lib/datetime-de";

type LocationOpt = { id: string; name: string; city: string | null };
type PlanOpt = {
  id: string;
  name: string;
  locationId: string;
  seatCapacity: number;
  sizeLabel: string;
};
type TourOpt = {
  id: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
};

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
    case "SCHEDULE_CHANGE_CONFIRM_REQUIRED":
      return "Bitte die Terminänderung bestätigen.";
    case "MISSING_EVENT_COVER":
      return "Verkaufsstart nicht möglich. Bitte lade zuerst ein Eventcover hoch. Jedes veröffentlichte Event benötigt ein Eventcover.";
    case "SALES_START_BLOCKED":
      return "Verkaufsstart nicht möglich — Voraussetzungen fehlen (siehe Verkaufsbereitschaft).";
    case "COVER_REQUIRED_FOR_SALE":
      return "Verkaufsstart nicht möglich. Bitte lade zuerst ein Eventcover hoch.";
    default:
      return code || "Speichern fehlgeschlagen";
  }
}

function formatScheduleLabel(localValue: string): string {
  const d = parseDatetimeLocalBerlin(localValue);
  if (!d) return localValue || "—";
  return formatDeDateTime(d, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shiftLocalByStoredOffset(
  companionStored: Date | null,
  oldStartStored: Date | null,
  newStartLocal: string,
): string {
  const newStart = parseDatetimeLocalBerlin(newStartLocal);
  const shifted = shiftRelativeToStart(companionStored, oldStartStored, newStart);
  return toDatetimeLocalValue(shifted);
}

export function EventEditForm({
  event,
  locations,
  planOptions,
  venuePlan,
  tours,
  ticketsSold = 0,
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
    vipDoorsOpenAt: Date | null;
    presaleStartsAt: Date | null;
    ticketTaxRateBasisPoints: number | null;
    administrationFeeTaxMode: string | null;
    administrationFeeCustomTaxRateBasisPoints: number | null;
    sepaMinDaysBeforeEvent: number | null;
    coverImageUrl: string | null;
    scheduleChangedAt?: Date | null;
    detailsUseTourDefaults?: boolean;
    seatOptPreferContiguous?: boolean;
    seatOptPreventNewSingletons?: boolean;
    seatOptIntelligentRemnants?: boolean;
    seatOptGapRelaxOccupancyPercent?: number;
    organizerName?: string | null;
    organizerContact?: string | null;
    organizerStreet?: string | null;
    organizerHouseNumber?: string | null;
    organizerPostalCode?: string | null;
    organizerCity?: string | null;
    organizerEmail?: string | null;
    organizerPhone?: string | null;
    organizerWebsite?: string | null;
  };
  locations: LocationOpt[];
  planOptions: PlanOpt[];
  venuePlan: { id: string; name: string } | null;
  tours: TourOpt[];
  ticketsSold?: number;
}) {
  const [status, setStatus] = useState(event.status);
  const [tourId, setTourId] = useState(event.tourId ?? "");
  const [inheritsDetails, setInheritsDetails] = useState(
    Boolean(event.tourId && event.detailsUseTourDefaults !== false),
  );
  const [name, setName] = useState(event.name);
  const [shortDescription, setShortDescription] = useState(event.shortDescription ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.eventStartsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(event.eventEndsAt));
  const [doorsOpenAt, setDoorsOpenAt] = useState(toDatetimeLocalValue(event.doorsOpenAt));
  const [presaleStartsAt, setPresaleStartsAt] = useState(
    toDatetimeLocalValue(event.presaleStartsAt),
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleNoticeAt, setScheduleNoticeAt] = useState(event.scheduleChangedAt ?? null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const dialogTitleId = useId();
  const router = useRouter();

  const selectedTour = tours.find((t) => t.id === tourId) ?? null;
  const canInheritDetails = Boolean(selectedTour);

  const needsScheduleGate = shouldConfirmScheduleChange({
    status: event.status,
    ticketsSold,
  });

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) {
        setConfirmOpen(false);
        setPendingFormData(null);
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [confirmOpen, pending]);

  function onStatusChange(next: string) {
    setStatus(next);
    // Switching into „Im Verkauf“ → Vorverkaufsstart = jetzt (server enforces on save).
    if (isEventSalesReleased(next) && !isEventSalesReleased(status)) {
      setPresaleStartsAt(toDatetimeLocalValue(new Date()));
    }
  }

  function submitFormData(formData: FormData) {
    setError(null);
    setSaved(false);
    setSaveHint(null);
    startTransition(async () => {
      try {
        const result = await updateEventAction(formData);
        setSaved(true);
        if (result.scheduleChanged) {
          const parts = [
            "Terminänderung gespeichert.",
            result.buyersEmailed > 0
              ? `${result.buyersEmailed} Käufer per E-Mail informiert.`
              : null,
            result.campaignsAdjusted > 0
              ? `${result.campaignsAdjusted} Preisaktion(en) angepasst.`
              : null,
          ].filter(Boolean);
          setSaveHint(parts.join(" "));
        } else if (result.campaignsAdjusted > 0) {
          setSaveHint(
            `Event gespeichert. ${result.campaignsAdjusted} Preisaktion(en) an das neue Eventende angepasst.`,
          );
        } else if (result.coverMissing) {
          setSaveHint(
            "Event gespeichert. Eventcover fehlt. Das Event kann ohne Eventcover nicht in den Verkauf gehen.",
          );
        }
        setConfirmOpen(false);
        setPendingFormData(null);
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

  function applyScheduleOffsetsAndSubmit(formData: FormData) {
    const nextEnds = shiftLocalByStoredOffset(
      event.eventEndsAt,
      event.eventStartsAt,
      startsAt,
    );
    const nextDoors = shiftLocalByStoredOffset(
      event.doorsOpenAt,
      event.eventStartsAt,
      startsAt,
    );
    setEndsAt(nextEnds);
    setDoorsOpenAt(nextDoors);

    formData.set("eventStartsAt", startsAt);
    formData.set("eventEndsAt", nextEnds);
    formData.set("doorsOpenAt", nextDoors);
    formData.set("presaleStartsAt", presaleStartsAt);
    formData.set("scheduleChangeConfirmed", "1");
    submitFormData(formData);
  }

  function onSubmit(formData: FormData) {
    // Controlled datetime fields may not be in FormData if SmartDateTimeInput
    // only syncs via React state — always stamp current values.
    formData.set("eventStartsAt", startsAt);
    formData.set("eventEndsAt", endsAt);
    formData.set("doorsOpenAt", doorsOpenAt);
    formData.set("presaleStartsAt", presaleStartsAt);
    formData.set("tourId", tourId);
    formData.set("name", name);
    formData.set("shortDescription", shortDescription);
    formData.set("description", description);
    formData.set(
      "detailsUseTourDefaults",
      canInheritDetails && inheritsDetails ? "1" : "0",
    );

    const nextStart = parseDatetimeLocalBerlin(startsAt);
    const startChanged = scheduleStartChanged(event.eventStartsAt, nextStart);

    if (startChanged && needsScheduleGate) {
      // Kill switch off: save silently (shift companions, no buyer/banner confirm).
      if (!isScheduleChangeAlertsEnabled()) {
        applyScheduleOffsetsAndSubmit(formData);
        return;
      }
      setPendingFormData(formData);
      setConfirmOpen(true);
      setError(null);
      return;
    }

    submitFormData(formData);
  }

  function onConfirmScheduleChange() {
    if (!pendingFormData) return;
    applyScheduleOffsetsAndSubmit(pendingFormData);
  }

  function startDetailsOverride() {
    if (!selectedTour) return;
    setInheritsDetails(false);
    setName(selectedTour.name);
    setShortDescription(selectedTour.shortDescription ?? "");
    setDescription(selectedTour.description ?? "");
  }

  function restoreTourDetails() {
    if (!selectedTour) return;
    setInheritsDetails(true);
    setName(selectedTour.name);
    setShortDescription(selectedTour.shortDescription ?? "");
    setDescription(selectedTour.description ?? "");
  }

  function clearScheduleNotice() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("eventId", event.id);
        const result = await clearScheduleChangedNoticeAction(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setScheduleNoticeAt(null);
        setSaveHint("Öffentlicher Hinweis „geänderter Termin“ entfernt.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Hinweis konnte nicht entfernt werden");
      }
    });
  }

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
    setPendingFormData(null);
  }

  const previewEnds = shiftLocalByStoredOffset(
    event.eventEndsAt,
    event.eventStartsAt,
    startsAt,
  );
  const previewDoors = shiftLocalByStoredOffset(
    event.doorsOpenAt,
    event.eventStartsAt,
    startsAt,
  );
  const previewVipDoors = shiftLocalByStoredOffset(
    event.vipDoorsOpenAt,
    event.eventStartsAt,
    startsAt,
  );
  const willNotifyBuyers =
    isScheduleChangeAlertsEnabled() &&
    needsScheduleGate &&
    (isEventSalesReleased(event.status) ||
      event.status === "paused" ||
      event.status === "sold_out" ||
      ticketsSold > 0);

  return (
    <>
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
        <input
          type="hidden"
          name="detailsUseTourDefaults"
          value={canInheritDetails && inheritsDetails ? "1" : "0"}
        />

        {canInheritDetails && inheritsDetails ? (
          <div className="md:col-span-2 space-y-3 rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-3">
            <p className="text-sm font-medium text-[var(--tf-navy)]">
              Übernimmt Name, Kurzbeschreibung und Beschreibung von „{selectedTour!.name}“
            </p>
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Änderungen an der Tour gelten auch für diesen Termin — solange du nicht anpasst.
            </p>
            <div className="space-y-2 text-sm text-[var(--tf-navy)]">
              <p>
                <span className="text-[var(--tf-text-secondary)]">Name · </span>
                {selectedTour!.name}
              </p>
              <p>
                <span className="text-[var(--tf-text-secondary)]">Kurzbeschreibung · </span>
                {selectedTour!.shortDescription?.trim() || "—"}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="text-[var(--tf-text-secondary)]">Beschreibung · </span>
                {selectedTour!.description?.trim() || "—"}
              </p>
            </div>
            <button
              type="button"
              className="tf-btn tf-btn-ghost !py-2 text-sm"
              onClick={startDetailsOverride}
            >
              Für diesen Termin anpassen
            </button>
            {/* Keep values in the payload while inheriting */}
            <input type="hidden" name="name" value={selectedTour!.name} />
            <input
              type="hidden"
              name="shortDescription"
              value={selectedTour!.shortDescription ?? ""}
            />
            <input
              type="hidden"
              name="description"
              value={selectedTour!.description ?? ""}
            />
          </div>
        ) : (
          <>
            <label className="grid gap-1 md:col-span-2">
              <span className="font-medium">Name</span>
              <input
                name="name"
                className="tf-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="grid gap-1 md:col-span-2">
              <span className="font-medium">Kurzbeschreibung</span>
              <textarea
                name="shortDescription"
                rows={2}
                className="tf-input"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
              />
            </label>

            <label className="grid gap-1 md:col-span-2">
              <span className="font-medium">Beschreibung</span>
              <textarea
                name="description"
                rows={5}
                className="tf-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {canInheritDetails ? (
              <div className="md:col-span-2">
                <button
                  type="button"
                  className="tf-btn tf-btn-ghost !py-2 text-sm"
                  onClick={restoreTourDetails}
                >
                  Tour-Texte wieder übernehmen
                </button>
              </div>
            ) : null}
          </>
        )}

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
          <select
            name="tourId"
            className="tf-input"
            value={tourId}
            onChange={(e) => {
              const next = e.target.value;
              setTourId(next);
              if (!next) {
                setInheritsDetails(false);
              } else if (!event.tourId || event.detailsUseTourDefaults !== false) {
                setInheritsDetails(true);
              }
            }}
          >
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
          initialSeatOpt={{
            preferContiguous: event.seatOptPreferContiguous ?? true,
            preventNewSingletonGaps: event.seatOptPreventNewSingletons ?? true,
            intelligentRemnantOptimization: event.seatOptIntelligentRemnants ?? true,
            gapRuleRelaxOccupancyPercent: event.seatOptGapRelaxOccupancyPercent ?? 90,
          }}
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

        {scheduleNoticeAt && shouldShowScheduleChangedBanner(scheduleNoticeAt) ? (
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[rgba(185,28,28,0.45)] bg-[rgba(185,28,28,0.1)] px-4 py-3 text-sm text-[var(--tf-navy)]">
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                Öffentlicher Hinweis „Achtung, geänderter Termin“ ist aktiv
              </p>
              <p className="text-[var(--tf-text-secondary)]">
                Seit{" "}
                {formatDeDateTime(new Date(scheduleNoticeAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                . Entfernen, wenn der Termin endgültig ist — dann erscheint kein Banner mehr auf
                der Eventseite.
              </p>
            </div>
            <button
              type="button"
              className="tf-btn tf-btn-primary shrink-0 !py-2 text-sm"
              disabled={pending}
              onClick={clearScheduleNotice}
            >
              Hinweis entfernen
            </button>
          </div>
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
          <p className="md:col-span-2 text-xs text-[var(--tf-text-secondary)]">
            VIP-Einlass legst du bei der VIP-Preiskategorie fest (Feld „VIP-Einlass“) — nicht hier.
            Bei Terminverschiebung wird ein hinterlegter VIP-Einlass automatisch mitverschoben.
          </p>
        </div>

        <fieldset className="md:col-span-2 grid gap-3 rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.02)] p-4">
          <legend className="px-1 text-sm font-semibold text-[var(--tf-navy)]">
            Veranstalter (Ticket-Fußzeile)
          </legend>
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Standard: Stammdaten der Organisation (z. B. SCHLAGERfeeling / Peter Loder). Optional
            pro Event überschreiben — Ticketfeeling erscheint nie als Veranstalter.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Firma / Name</span>
              <input
                name="organizerName"
                className="tf-input"
                defaultValue={event.organizerName ?? ""}
                placeholder="z. B. SCHLAGERfeeling"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Kontakt / Inhaber</span>
              <input
                name="organizerContact"
                className="tf-input"
                defaultValue={event.organizerContact ?? ""}
                placeholder="z. B. Peter Loder"
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Straße</span>
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <input
                  name="organizerStreet"
                  className="tf-input"
                  defaultValue={event.organizerStreet ?? ""}
                />
                <input
                  name="organizerHouseNumber"
                  className="tf-input"
                  defaultValue={event.organizerHouseNumber ?? ""}
                  placeholder="Nr."
                />
              </div>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">PLZ</span>
              <input
                name="organizerPostalCode"
                className="tf-input"
                defaultValue={event.organizerPostalCode ?? ""}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Ort</span>
              <input
                name="organizerCity"
                className="tf-input"
                defaultValue={event.organizerCity ?? ""}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">E-Mail</span>
              <input
                name="organizerEmail"
                type="email"
                className="tf-input"
                defaultValue={event.organizerEmail ?? ""}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Telefon</span>
              <input
                name="organizerPhone"
                className="tf-input"
                defaultValue={event.organizerPhone ?? ""}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Website</span>
              <input
                name="organizerWebsite"
                className="tf-input"
                defaultValue={event.organizerWebsite ?? ""}
                placeholder="https://"
              />
            </label>
          </div>
        </fieldset>

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
            <p
              className={`text-sm font-medium ${
                saveHint?.includes("Eventcover fehlt")
                  ? "text-[var(--tf-navy)]"
                  : "text-[var(--tf-teal-hover)]"
              }`}
            >
              {saveHint?.includes("Eventcover fehlt") ? (
                <>
                  <span aria-hidden>⚠ </span>
                  {saveHint}
                </>
              ) : (
                (saveHint ?? "Änderungen gespeichert.")
              )}
            </p>
          ) : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
      </form>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,39,71,0.45)] p-4"
          role="presentation"
          onClick={closeConfirm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="relative w-full max-w-lg rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_20px_50px_rgba(15,39,71,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={dialogTitleId} className="text-lg font-semibold text-[var(--tf-navy)]">
              Termin wirklich ändern?
            </h2>
            <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
              Du änderst den Beginn eines{" "}
              {willNotifyBuyers ? "laufenden bzw. verkauften" : "bereits vorbereiteten"} Events.
              Ende und Einlass werden automatisch mitverschoben (gleiche Abstände zum Beginn).
              {willNotifyBuyers
                ? " Alle Käufer mit bezahlten Tickets erhalten eine E-Mail. Auf der öffentlichen Event-Seite erscheint der Hinweis „Achtung, geänderter Termin“."
                : " Preisaktionen, die über den neuen Beginn hinauslaufen, werden gekürzt."}
            </p>

            <dl className="mt-4 space-y-2 rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] px-3 py-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                  Beginn
                </dt>
                <dd className="font-medium text-[var(--tf-navy)]">
                  {formatScheduleLabel(toDatetimeLocalValue(event.eventStartsAt))} →{" "}
                  {formatScheduleLabel(startsAt)}
                </dd>
              </div>
              {previewEnds ? (
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                    Ende (automatisch)
                  </dt>
                  <dd className="font-medium text-[var(--tf-navy)]">
                    {formatScheduleLabel(toDatetimeLocalValue(event.eventEndsAt))} →{" "}
                    {formatScheduleLabel(previewEnds)}
                  </dd>
                </div>
              ) : null}
              {previewDoors ? (
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                    Einlass (automatisch)
                  </dt>
                  <dd className="font-medium text-[var(--tf-navy)]">
                    {formatScheduleLabel(toDatetimeLocalValue(event.doorsOpenAt))} →{" "}
                    {formatScheduleLabel(previewDoors)}
                  </dd>
                </div>
              ) : null}
              {previewVipDoors ? (
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                    VIP-Einlass (automatisch)
                  </dt>
                  <dd className="font-medium text-[var(--tf-navy)]">
                    {formatScheduleLabel(toDatetimeLocalValue(event.vipDoorsOpenAt))} →{" "}
                    {formatScheduleLabel(previewVipDoors)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                disabled={pending}
                onClick={closeConfirm}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                disabled={pending}
                onClick={onConfirmScheduleChange}
              >
                {pending ? "Speichert…" : "Ja, Termin ändern"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
