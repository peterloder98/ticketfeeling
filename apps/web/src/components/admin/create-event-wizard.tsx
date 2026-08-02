"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CoverImageField } from "@/components/admin/cover-image-field";
import {
  shiftDateTimeLocal,
  SmartDateTimeInput,
} from "@/components/admin/smart-datetime-input";
import { SaalplanEditor } from "@/components/admin/saalplan-editor";
import { CountrySelect } from "@/components/country-select";
import { PhoneInput } from "@/components/phone-input";
import {
  prepareWizardLocationPlanAction,
  saveVenuePlanAction,
} from "@/app/admin/saalplan/actions";
import { CREATE_EVENT_STATUSES, slugify } from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import { formatEuroFromCents } from "@/lib/money";
import type { VenuePlanObject } from "@/lib/saalplan/types";

const DRAFT_KEY = "tf-create-event-wizard-v1";

export type WizardVenuePlan = {
  id: string;
  name: string;
  seatCapacity: number;
  sizeLabel: string;
};

export type WizardLocation = {
  id: string;
  name: string;
  city: string | null;
  venuePlans: WizardVenuePlan[];
};

export type WizardCategoryTemplate = {
  id: string;
  name: string;
  priceGrossCents: number;
  capacity: number;
  maxPerOrder: number;
};

export type WizardTour = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
};

type CategoryRow = {
  key: string;
  name: string;
  priceEuro: string;
  capacity: string;
  maxPerOrder: string;
  saleStartsAt: string;
  saleEndsAt: string;
};

const STEPS = [
  { id: "content", title: "Inhalte" },
  { id: "location", title: "Ort" },
  { id: "tickets", title: "Tickets" },
  { id: "finish", title: "Fertigstellen" },
] as const;

function newCategoryRow(partial?: Partial<CategoryRow>): CategoryRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "Kategorie 1",
    priceEuro: "29.90",
    capacity: "100",
    maxPerOrder: "10",
    saleStartsAt: "",
    saleEndsAt: "",
    ...partial,
  };
}

type Props = {
  locations: WizardLocation[];
  templates: WizardCategoryTemplate[];
  tours?: WizardTour[];
  initialTourId?: string;
  action: (formData: FormData) => Promise<void>;
};

export function CreateEventWizard({
  locations,
  templates,
  tours = [],
  initialTourId = "",
  action,
}: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [tourId, setTourId] = useState(initialTourId);
  const [name, setName] = useState(() => {
    const t = tours.find((x) => x.id === initialTourId);
    return t?.name ?? "";
  });
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState(() => {
    const t = tours.find((x) => x.id === initialTourId);
    return t?.description ?? "";
  });
  const [status, setStatus] = useState<(typeof CREATE_EVENT_STATUSES)[number]>("draft");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [doorsOpenAt, setDoorsOpenAt] = useState("");
  const [presaleStartsAt, setPresaleStartsAt] = useState("");
  const [endsManual, setEndsManual] = useState(false);
  const [doorsManual, setDoorsManual] = useState(false);
  const [ticketTaxPercent, setTicketTaxPercent] = useState("7");
  const [feeTaxMode, setFeeTaxMode] = useState("inherit");
  const [feeTaxPercent, setFeeTaxPercent] = useState("7");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  const selectedTour = useMemo(
    () => tours.find((t) => t.id === tourId) ?? null,
    [tours, tourId],
  );

  const [locList, setLocList] = useState<WizardLocation[]>(locations);
  const [locationMode, setLocationMode] = useState<"existing" | "new">(
    locations.length > 0 ? "existing" : "new",
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [venuePlanId, setVenuePlanId] = useState(
    locations[0]?.venuePlans[0]?.id ?? "",
  );
  const [seatingBookingMode, setSeatingBookingMode] = useState(
    locations[0]?.venuePlans[0]?.id ? "seat_map_and_best" : "none",
  );
  const [newLocName, setNewLocName] = useState("");
  const [newLocStreet, setNewLocStreet] = useState("");
  const [newLocHouse, setNewLocHouse] = useState("");
  const [newLocZip, setNewLocZip] = useState("");
  const [newLocCity, setNewLocCity] = useState("");
  const [newLocCountry, setNewLocCountry] = useState("DE");
  const [newLocPhone, setNewLocPhone] = useState("");
  const [newLocHomepage, setNewLocHomepage] = useState("");
  const [newLocCapacity, setNewLocCapacity] = useState("");

  const [wantSaalplan, setWantSaalplan] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planWidthM, setPlanWidthM] = useState("20");
  const [planDepthM, setPlanDepthM] = useState("15");
  const [planWithStage, setPlanWithStage] = useState(true);
  const [editorPlan, setEditorPlan] = useState<null | {
    id: string;
    name: string;
    widthCm: number;
    depthCm: number;
    objects: VenuePlanObject[];
  }>(null);
  const [planBusy, startPlanBusy] = useTransition();

  const [categories, setCategories] = useState<CategoryRow[]>([newCategoryRow()]);
  const [stepError, setStepError] = useState<string | null>(null);

  // Restore draft after accidental remount (e.g. former cover upload refresh bug)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        if (typeof draft.step === "number") setStep(draft.step);
        if (typeof draft.name === "string") setName(draft.name);
        if (typeof draft.slug === "string") setSlug(draft.slug);
        if (typeof draft.slugManual === "boolean") setSlugManual(draft.slugManual);
        if (typeof draft.subtitle === "string") setSubtitle(draft.subtitle);
        if (typeof draft.shortDescription === "string") {
          setShortDescription(draft.shortDescription);
        }
        if (typeof draft.description === "string") setDescription(draft.description);
        if (typeof draft.status === "string") {
          setStatus(draft.status as (typeof CREATE_EVENT_STATUSES)[number]);
        }
        if (typeof draft.eventStartsAt === "string") setEventStartsAt(draft.eventStartsAt);
        if (typeof draft.eventEndsAt === "string") setEventEndsAt(draft.eventEndsAt);
        if (typeof draft.doorsOpenAt === "string") setDoorsOpenAt(draft.doorsOpenAt);
        if (typeof draft.presaleStartsAt === "string") setPresaleStartsAt(draft.presaleStartsAt);
        if (typeof draft.endsManual === "boolean") setEndsManual(draft.endsManual);
        if (typeof draft.doorsManual === "boolean") setDoorsManual(draft.doorsManual);
        if (typeof draft.ticketTaxPercent === "string") {
          setTicketTaxPercent(draft.ticketTaxPercent);
        }
        if (typeof draft.feeTaxMode === "string") setFeeTaxMode(draft.feeTaxMode);
        if (typeof draft.feeTaxPercent === "string") setFeeTaxPercent(draft.feeTaxPercent);
        if (typeof draft.coverImageUrl === "string") setCoverImageUrl(draft.coverImageUrl);
        if (initialTourId) setTourId(initialTourId);
        else if (typeof draft.tourId === "string") setTourId(draft.tourId);
        if (draft.locationMode === "existing" || draft.locationMode === "new") {
          setLocationMode(draft.locationMode);
        }
        if (typeof draft.locationId === "string") setLocationId(draft.locationId);
        if (typeof draft.venuePlanId === "string") setVenuePlanId(draft.venuePlanId);
        if (typeof draft.newLocName === "string") setNewLocName(draft.newLocName);
        if (typeof draft.newLocStreet === "string") setNewLocStreet(draft.newLocStreet);
        if (typeof draft.newLocHouse === "string") setNewLocHouse(draft.newLocHouse);
        if (typeof draft.newLocZip === "string") setNewLocZip(draft.newLocZip);
        if (typeof draft.newLocCity === "string") setNewLocCity(draft.newLocCity);
        if (typeof draft.newLocCountry === "string") setNewLocCountry(draft.newLocCountry);
        if (typeof draft.newLocPhone === "string") setNewLocPhone(draft.newLocPhone);
        if (typeof draft.newLocHomepage === "string") setNewLocHomepage(draft.newLocHomepage);
        if (typeof draft.newLocCapacity === "string") setNewLocCapacity(draft.newLocCapacity);
        if (Array.isArray(draft.categories) && draft.categories.length > 0) {
          setCategories(draft.categories as CategoryRow[]);
        }
      }
    } catch {
      /* ignore corrupt draft */
    }
    setHydrated(true);
  }, [initialTourId]);

  useEffect(() => {
    if (!hydrated) return;
    const draft = {
      step,
      name,
      slug,
      slugManual,
      subtitle,
      shortDescription,
      description,
      status,
      eventStartsAt,
      eventEndsAt,
      doorsOpenAt,
      presaleStartsAt,
      endsManual,
      doorsManual,
      ticketTaxPercent,
      feeTaxMode,
      feeTaxPercent,
      coverImageUrl,
      tourId,
      locationMode,
      locationId,
      venuePlanId,
      newLocName,
      newLocStreet,
      newLocHouse,
      newLocZip,
      newLocCity,
      newLocCountry,
      newLocPhone,
      newLocHomepage,
      newLocCapacity,
      categories,
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* quota */
    }
  }, [
    step,
    name,
    slug,
    slugManual,
    subtitle,
    shortDescription,
    description,
    status,
    eventStartsAt,
    eventEndsAt,
    doorsOpenAt,
    presaleStartsAt,
    endsManual,
    doorsManual,
    ticketTaxPercent,
    feeTaxMode,
    feeTaxPercent,
    coverImageUrl,
    tourId,
    locationMode,
    locationId,
    venuePlanId,
    newLocName,
    newLocStreet,
    newLocHouse,
    newLocZip,
    newLocCity,
    newLocCountry,
    newLocPhone,
    newLocHomepage,
    newLocCapacity,
    categories,
    hydrated,
  ]);

  function applyStartDerived(start: string) {
    setEventStartsAt(start);
    if (!start) return;
    if (!endsManual) setEventEndsAt(shiftDateTimeLocal(start, 3));
    if (!doorsManual) setDoorsOpenAt(shiftDateTimeLocal(start, -2));
  }

  const webAddress = slugManual ? slug : slugify(name);
  const selectedLocation = useMemo(
    () => locList.find((l) => l.id === locationId) ?? null,
    [locList, locationId],
  );
  const selectedVenuePlan = useMemo(
    () => selectedLocation?.venuePlans.find((p) => p.id === venuePlanId) ?? null,
    [selectedLocation, venuePlanId],
  );

  const showSaalplanSection =
    locationMode === "new" || (locationMode === "existing" && Boolean(locationId));

  function updateCategory(key: string, patch: Partial<CategoryRow>) {
    setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function addCategory(fromTemplate?: WizardCategoryTemplate) {
    setCategories((prev) => [
      ...prev,
      newCategoryRow(
        fromTemplate
          ? {
              name: fromTemplate.name,
              priceEuro: (fromTemplate.priceGrossCents / 100).toFixed(2),
              capacity: String(fromTemplate.capacity),
              maxPerOrder: String(fromTemplate.maxPerOrder),
            }
          : {
              name: `Kategorie ${prev.length + 1}`,
              priceEuro: "39.90",
            },
      ),
    ]);
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!name.trim()) return "Bitte einen Event-Titel eingeben.";
      if (!eventStartsAt) return "Bitte den Beginn angeben.";
    }
    if (index === 1) {
      if (locationMode === "existing" && !locationId) {
        return "Bitte einen Ort wählen oder einen neuen anlegen.";
      }
      if (locationMode === "new" && !newLocName.trim()) {
        return "Bitte den Namen des neuen Orts eingeben.";
      }
    }
    if (index === 2) {
      if (categories.length === 0) return "Mindestens eine Ticketkategorie ist nötig.";
      if (categories.some((c) => !c.name.trim())) {
        return "Jede Ticketkategorie braucht einen Namen.";
      }
      if (
        categories.some((c) => {
          const price = Number(c.priceEuro.replace(",", "."));
          return !Number.isFinite(price) || price < 0;
        })
      ) {
        return "Bitte gültige Preise (ab 0 €) eingeben.";
      }
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    setStepError(err);
    if (err) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function openSaalplanEditor() {
    setStepError(null);
    if (locationMode === "new" && !newLocName.trim()) {
      setStepError("Bitte den Namen des neuen Orts eingeben.");
      return;
    }
    if (locationMode === "existing" && !locationId) {
      setStepError("Bitte einen Ort wählen oder einen neuen anlegen.");
      return;
    }

    startPlanBusy(async () => {
      try {
        const fd = new FormData();
        fd.set("locationMode", locationMode);
        fd.set("locationId", locationId);
        fd.set("newLocationName", newLocName);
        fd.set("newLocationStreet", newLocStreet);
        fd.set("newLocationHouseNumber", newLocHouse);
        fd.set("newLocationPostalCode", newLocZip);
        fd.set("newLocationCity", newLocCity);
        fd.set("newLocationCountry", newLocCountry);
        const formEl = document.getElementById(
          "create-event-wizard-form",
        ) as HTMLFormElement | null;
        const phoneFromForm = formEl
          ? String(new FormData(formEl).get("newLocationPhone") ?? "")
          : newLocPhone;
        fd.set("newLocationPhone", phoneFromForm);
        fd.set("newLocationHomepage", newLocHomepage);
        fd.set("newLocationMaxCapacity", newLocCapacity);
        fd.set("planName", planName.trim() || "Saalplan");
        fd.set("widthM", planWidthM);
        fd.set("depthM", planDepthM);
        if (planWithStage) fd.set("withStage", "true");

        const result = await prepareWizardLocationPlanAction(fd);
        const planEntry: WizardVenuePlan = {
          id: result.venuePlanId,
          name: result.planName,
          seatCapacity: result.seatCapacity,
          sizeLabel: result.sizeLabel,
        };

        setLocList((prev) => {
          const existing = prev.find((l) => l.id === result.locationId);
          if (existing) {
            return prev.map((l) =>
              l.id === result.locationId
                ? {
                    ...l,
                    venuePlans: l.venuePlans.some((p) => p.id === planEntry.id)
                      ? l.venuePlans
                      : [...l.venuePlans, planEntry],
                  }
                : l,
            );
          }
          return [
            ...prev,
            {
              id: result.locationId,
              name: result.locationName,
              city: result.locationCity,
              venuePlans: [planEntry],
            },
          ];
        });
        setLocationMode("existing");
        setLocationId(result.locationId);
        setVenuePlanId(result.venuePlanId);
        setSeatingBookingMode("seat_map_and_best");
        setEditorPlan({
          id: result.venuePlanId,
          name: result.planName,
          widthCm: result.widthCm,
          depthCm: result.depthCm,
          objects: result.objects,
        });
        setWantSaalplan(false);
      } catch (e) {
        setStepError(
          e instanceof Error && e.message === "LOCATION_NAME_REQUIRED"
            ? "Bitte den Namen des neuen Orts eingeben."
            : "Saalplan konnte nicht vorbereitet werden.",
        );
      }
    });
  }

  const checklist: { ok: boolean; label: string; soft?: boolean }[] = [
    { ok: Boolean(name.trim()), label: "Event-Titel" },
    { ok: Boolean(eventStartsAt), label: "Termin (Beginn)" },
    {
      ok:
        (locationMode === "existing" && Boolean(locationId)) ||
        (locationMode === "new" && Boolean(newLocName.trim())),
      label: "Ort",
    },
    {
      ok: categories.length > 0 && categories.every((c) => c.name.trim()),
      label: "Mindestens 1 Ticketkategorie",
    },
    { ok: true, label: "Cover (empfohlen)", soft: true },
  ];

  return (
    <form
      id="create-event-wizard-form"
      action={action}
      noValidate
      className="mt-6 w-full space-y-6"
    >
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li
              key={s.id}
              className={`rounded-xl border px-3 py-2.5 ${
                active
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                  : done
                    ? "border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)]"
                    : "border-[var(--tf-line)]"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                Schritt {i + 1}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--tf-navy)]">{s.title}</p>
            </li>
          );
        })}
      </ol>

      {stepError ? (
        <p className="rounded-lg border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-sm text-[var(--danger)]">
          {stepError}
        </p>
      ) : null}

      {/* Step 1 — Inhalte */}
      <section className={step === 0 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 space-y-8 text-sm">
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-7">
              {tours.length > 0 ? (
                <label className="grid gap-1">
                  <span className="font-medium">Tour (optional)</span>
                  <select
                    name="tourId"
                    className="tf-input"
                    value={tourId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTourId(next);
                      const tour = tours.find((t) => t.id === next);
                      if (tour) {
                        if (!name.trim()) {
                          setName(tour.name);
                          if (!slugManual) setSlug(slugify(tour.name));
                        }
                        if (!description.trim() && tour.description) {
                          setDescription(tour.description);
                        }
                        if (coverImageUrl) setCoverImageUrl("");
                      }
                    }}
                  >
                    <option value="">Kein Tour-Termin (einzelnes Event)</option>
                    {tours.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="tourId" value="" />
              )}

              <label className="grid gap-1">
                <span className="font-medium">
                  {tourId ? "Titel / Termin-Name" : "Event-Titel"}
                </span>
                <input
                  name="name"
                  className="tf-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugManual) setSlug(slugify(e.target.value));
                  }}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Untertitel (optional)</span>
                <input
                  name="subtitle"
                  className="tf-input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Kurztext</span>
                <textarea
                  name="shortDescription"
                  rows={2}
                  className="tf-input"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Ausführliche Beschreibung</span>
                <textarea
                  name="description"
                  rows={5}
                  className="tf-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>

            <div className="space-y-4 xl:col-span-5">
              <label className="grid gap-1">
                <span className="font-medium">Status / Verkaufsfreigabe</span>
                <select
                  name="status"
                  className="tf-input"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as (typeof CREATE_EVENT_STATUSES)[number])
                  }
                >
                  {CREATE_EVENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {eventStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="grid gap-1">
                  <span className="font-medium">Ticket-Umsatzsteuer</span>
                  <select
                    name="ticketTaxPercent"
                    className="tf-input"
                    value={ticketTaxPercent}
                    onChange={(e) => setTicketTaxPercent(e.target.value)}
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
                    value={feeTaxMode}
                    onChange={(e) => setFeeTaxMode(e.target.value)}
                  >
                    <option value="inherit">Steuersatz des Tickets übernehmen</option>
                    <option value="custom">Eigener Steuersatz</option>
                  </select>
                </label>
                {feeTaxMode === "custom" ? (
                  <label className="grid gap-1 sm:col-span-2 xl:col-span-1">
                    <span className="font-medium">Eigener Gebühren-Steuersatz (%)</span>
                    <input
                      name="administrationFeeCustomTaxPercent"
                      type="number"
                      min="0"
                      step="0.01"
                      className="tf-input"
                      value={feeTaxPercent}
                      onChange={(e) => setFeeTaxPercent(e.target.value)}
                    />
                  </label>
                ) : (
                  <input
                    type="hidden"
                    name="administrationFeeCustomTaxPercent"
                    value={feeTaxPercent}
                  />
                )}
              </div>

              <CoverImageField
                name="coverImageUrl"
                initialUrl={coverImageUrl || null}
                inheritUrl={selectedTour?.coverImageUrl}
                inheritLabel="Tour-Plakat"
                refreshOnUpload={false}
                onUploaded={setCoverImageUrl}
                onCleared={() => setCoverImageUrl("")}
              />

              <details className="rounded-xl border border-[var(--tf-line)] p-3">
                <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
                  Erweitert: Link-Name
                </summary>
                <label className="mt-3 grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-[var(--tf-text-secondary)]">
                      /event/
                    </span>
                    <input
                      name="slug"
                      className="tf-input"
                      value={webAddress}
                      onChange={(e) => {
                        setSlugManual(true);
                        setSlug(slugify(e.target.value));
                      }}
                    />
                  </div>
                </label>
              </details>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <SmartDateTimeInput
              name="eventStartsAt"
              label="Beginn"
              value={eventStartsAt}
              onChange={applyStartDerived}
            />
            <SmartDateTimeInput
              name="eventEndsAt"
              label="Ende"
              value={eventEndsAt}
              onChange={(v) => {
                setEndsManual(true);
                setEventEndsAt(v);
              }}
            />
            <SmartDateTimeInput
              name="doorsOpenAt"
              label="Einlass"
              value={doorsOpenAt}
              onChange={(v) => {
                setDoorsManual(true);
                setDoorsOpenAt(v);
              }}
            />
            <SmartDateTimeInput
              name="presaleStartsAt"
              label="Vorverkaufsstart"
              value={presaleStartsAt}
              onChange={setPresaleStartsAt}
            />
          </div>
        </div>
      </section>

      {/* Step 2 — Ort */}
      <section className={step === 1 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 grid gap-6 text-sm">
          <input type="hidden" name="locationMode" value={locationMode} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`tf-btn ${locationMode === "existing" ? "tf-btn-primary" : ""}`}
              onClick={() => setLocationMode("existing")}
              disabled={locList.length === 0}
            >
              Bestehenden Ort wählen
            </button>
            <button
              type="button"
              className={`tf-btn ${locationMode === "new" ? "tf-btn-primary" : ""}`}
              onClick={() => setLocationMode("new")}
            >
              Neuen Ort anlegen
            </button>
          </div>

          {locationMode === "existing" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium">Ort</span>
                <select
                  name="locationId"
                  className="tf-input"
                  value={locationId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLocationId(next);
                    const loc = locList.find((l) => l.id === next);
                    const stillOk = loc?.venuePlans.some((p) => p.id === venuePlanId);
                    if (!stillOk) {
                      const first = loc?.venuePlans[0]?.id ?? "";
                      setVenuePlanId(first);
                      setSeatingBookingMode(first ? "seat_map_and_best" : "none");
                    }
                    setEditorPlan(null);
                  }}
                >
                  <option value="">— bitte wählen —</option>
                  {locList.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.city ? ` (${loc.city})` : ""}
                      {loc.venuePlans.length > 0
                        ? ` · ${loc.venuePlans.length} Saalplan${loc.venuePlans.length === 1 ? "" : "e"}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Saalplan (optional)</span>
                <select
                  name="venuePlanId"
                  className="tf-input"
                  value={venuePlanId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVenuePlanId(next);
                    if (!next) setSeatingBookingMode("none");
                    else if (seatingBookingMode === "none") {
                      setSeatingBookingMode("seat_map_and_best");
                    }
                    if (!next || next !== editorPlan?.id) setEditorPlan(null);
                  }}
                  disabled={!selectedLocation}
                >
                  <option value="">— keiner (Steh / freie Platzwahl) —</option>
                  {(selectedLocation?.venuePlans ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.seatCapacity > 0 ? ` · ${p.seatCapacity} Sitze` : ""} · {p.sizeLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
              <input type="hidden" name="locationId" value="" />
              <input type="hidden" name="venuePlanId" value="" />
              <label className="grid gap-1 xl:col-span-12">
                <span className="font-medium">Name des Orts</span>
                <input
                  name="newLocationName"
                  className="tf-input"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="z. B. Stadthalle Musterstadt"
                />
              </label>
              <label className="grid gap-1 md:col-span-1 xl:col-span-8">
                <span className="font-medium">Straße</span>
                <input
                  name="newLocationStreet"
                  className="tf-input"
                  value={newLocStreet}
                  onChange={(e) => setNewLocStreet(e.target.value)}
                />
              </label>
              <label className="grid gap-1 xl:col-span-4">
                <span className="font-medium">Hausnr.</span>
                <input
                  name="newLocationHouseNumber"
                  className="tf-input"
                  value={newLocHouse}
                  onChange={(e) => setNewLocHouse(e.target.value)}
                />
              </label>
              <label className="grid gap-1 xl:col-span-3">
                <span className="font-medium">PLZ</span>
                <input
                  name="newLocationPostalCode"
                  className="tf-input"
                  value={newLocZip}
                  onChange={(e) => setNewLocZip(e.target.value)}
                />
              </label>
              <label className="grid gap-1 xl:col-span-5">
                <span className="font-medium">Stadt</span>
                <input
                  name="newLocationCity"
                  className="tf-input"
                  value={newLocCity}
                  onChange={(e) => setNewLocCity(e.target.value)}
                />
              </label>
              <div className="xl:col-span-4">
                <CountrySelect
                  name="newLocationCountry"
                  label="Land"
                  value={newLocCountry}
                  onChange={setNewLocCountry}
                />
              </div>
              <div className="xl:col-span-6">
                {hydrated ? (
                  <PhoneInput
                    name="newLocationPhone"
                    label="Telefon (optional)"
                    defaultValue={newLocPhone}
                  />
                ) : (
                  <input type="hidden" name="newLocationPhone" value={newLocPhone} />
                )}
              </div>
              <label className="grid gap-1 xl:col-span-6">
                <span className="font-medium">Homepage (optional)</span>
                <input
                  name="newLocationHomepage"
                  className="tf-input"
                  value={newLocHomepage}
                  onChange={(e) => setNewLocHomepage(e.target.value)}
                  placeholder="https://"
                />
              </label>
              <label className="grid gap-1 xl:col-span-12 md:max-w-xs">
                <span className="font-medium">Max. Kapazität (optional)</span>
                <input
                  name="newLocationMaxCapacity"
                  type="number"
                  min="1"
                  className="tf-input"
                  value={newLocCapacity}
                  onChange={(e) => setNewLocCapacity(e.target.value)}
                />
              </label>
            </div>
          )}

          {locationMode === "existing" && venuePlanId ? (
            <fieldset className="space-y-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
              <legend className="px-1 text-sm font-semibold text-[var(--tf-navy)]">
                Onlineshop-Verkauf
              </legend>
              <input type="hidden" name="seatingBookingMode" value={seatingBookingMode} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={seatingBookingMode === "seat_map_and_best"}
                  onChange={() => setSeatingBookingMode("seat_map_and_best")}
                />
                <span className="font-medium">Saalplan + Bestplatzbuchung</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={seatingBookingMode === "best_available"}
                  onChange={() => setSeatingBookingMode("best_available")}
                />
                <span className="font-medium">Nur Bestplatzbuchung</span>
              </label>
            </fieldset>
          ) : (
            <input type="hidden" name="seatingBookingMode" value="none" />
          )}

          {showSaalplanSection ? (
            <div className="space-y-4 rounded-xl border border-[var(--tf-line)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-[var(--tf-navy)]">Neuen Saalplan zeichnen</p>
                {!wantSaalplan ? (
                  <button
                    type="button"
                    className="tf-btn"
                    onClick={() => setWantSaalplan(true)}
                  >
                    Saalplan anlegen
                  </button>
                ) : null}
              </div>

              {wantSaalplan ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {!venuePlanId && locationMode === "new" ? (
                    <input type="hidden" name="createVenuePlan" value="on" />
                  ) : null}
                  <label className="grid gap-1 md:col-span-2 xl:col-span-2">
                    <span className="font-medium">Name</span>
                    <input
                      name="newVenuePlanName"
                      className="tf-input"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="z. B. Großer Saal"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-medium">Breite (m)</span>
                    <input
                      name="newVenuePlanWidthM"
                      className="tf-input"
                      inputMode="decimal"
                      value={planWidthM}
                      onChange={(e) => setPlanWidthM(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-medium">Tiefe (m)</span>
                    <input
                      name="newVenuePlanDepthM"
                      className="tf-input"
                      inputMode="decimal"
                      value={planDepthM}
                      onChange={(e) => setPlanDepthM(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
                    <input
                      type="checkbox"
                      name="newVenuePlanWithStage"
                      checked={planWithStage}
                      onChange={(e) => setPlanWithStage(e.target.checked)}
                    />
                    <span className="font-medium">Bühne</span>
                  </label>
                  <div className="md:col-span-2 xl:col-span-4">
                    <button
                      type="button"
                      className="tf-btn tf-btn-primary"
                      disabled={planBusy}
                      onClick={openSaalplanEditor}
                    >
                      {planBusy ? "Wird vorbereitet…" : "Saalplan-Editor öffnen"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {editorPlan ? (
            <div className="space-y-3">
              <p className="font-medium text-[var(--tf-navy)]">Saalplan bearbeiten</p>
              <SaalplanEditor
                planId={editorPlan.id}
                initialName={editorPlan.name}
                initialWidthCm={editorPlan.widthCm}
                initialDepthCm={editorPlan.depthCm}
                initialObjects={editorPlan.objects}
                saveAction={saveVenuePlanAction}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Step 3 — Tickets */}
      <section className={step === 2 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 grid gap-4 text-sm">
          <p className="font-medium text-[var(--tf-navy)]">Ticketkategorien</p>

          {templates.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--tf-text-secondary)]">Vorlage übernehmen:</span>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tf-btn text-xs"
                  onClick={() => addCategory(t)}
                >
                  {t.name} ({formatEuroFromCents(t.priceGrossCents)})
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {categories.map((cat, index) => (
              <div
                key={cat.key}
                className="grid gap-3 rounded-xl border border-[var(--tf-line)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
                    Kategorie {index + 1}
                  </p>
                  {categories.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--danger)]"
                      onClick={() =>
                        setCategories((prev) => prev.filter((c) => c.key !== cat.key))
                      }
                    >
                      Entfernen
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 md:col-span-2 xl:col-span-4">
                    <span className="font-medium">Name</span>
                    <input
                      name="categoryName"
                      className="tf-input"
                      value={cat.name}
                      onChange={(e) => updateCategory(cat.key, { name: e.target.value })}
                      placeholder="z. B. Kategorie 1, VIP, Early Bird"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-medium">Preis (€ brutto)</span>
                    <input
                      name="categoryPrice"
                      className="tf-input"
                      inputMode="decimal"
                      value={cat.priceEuro}
                      onChange={(e) => updateCategory(cat.key, { priceEuro: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-medium">Kontingent</span>
                    <input
                      name="categoryCapacity"
                      type="number"
                      min="1"
                      className="tf-input"
                      value={cat.capacity}
                      onChange={(e) => updateCategory(cat.key, { capacity: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-medium">Max. pro Bestellung</span>
                    <input
                      name="categoryMaxPerOrder"
                      type="number"
                      min="1"
                      className="tf-input"
                      value={cat.maxPerOrder}
                      onChange={(e) => updateCategory(cat.key, { maxPerOrder: e.target.value })}
                    />
                  </label>
                  <div className="md:col-span-2 xl:col-span-2">
                    <SmartDateTimeInput
                      name="categorySaleStartsAt"
                      label="Verkauf von (optional)"
                      value={cat.saleStartsAt}
                      onChange={(v) => updateCategory(cat.key, { saleStartsAt: v })}
                    />
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
                    <SmartDateTimeInput
                      name="categorySaleEndsAt"
                      label="Verkauf bis (optional)"
                      value={cat.saleEndsAt}
                      onChange={(v) => updateCategory(cat.key, { saleEndsAt: v })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="tf-btn w-fit" onClick={() => addCategory()}>
            + Weitere Kategorie
          </button>
        </div>
      </section>

      {/* Step 4 — Fertigstellen */}
      <section className={step === 3 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 grid gap-4 text-sm">
          <div>
            <p className="font-medium text-[var(--tf-navy)]">Kurzprüfung</p>
            <ul className="mt-2 space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span
                    className={
                      item.ok
                        ? "text-[var(--tf-teal)]"
                        : "text-[var(--tf-text-secondary)]"
                    }
                    aria-hidden
                  >
                    {item.ok ? "✓" : "○"}
                  </span>
                  <span
                    className={
                      item.ok || item.soft
                        ? "text-[var(--tf-text-secondary)]"
                        : "text-[var(--danger)]"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-1 text-xs text-[var(--tf-text-secondary)]">
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Titel: </dt>
                <dd className="inline">{name || "—"}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Termin: </dt>
                <dd className="inline">
                  {eventStartsAt
                    ? new Date(eventStartsAt).toLocaleString("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Ort: </dt>
                <dd className="inline">
                  {locationMode === "new"
                    ? newLocName || "—"
                    : selectedLocation
                      ? `${selectedLocation.name}${selectedLocation.city ? `, ${selectedLocation.city}` : ""}`
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Saalplan: </dt>
                <dd className="inline">
                  {selectedVenuePlan
                    ? `${selectedVenuePlan.name}${
                        selectedVenuePlan.seatCapacity > 0
                          ? ` (${selectedVenuePlan.seatCapacity} Sitze)`
                          : ""
                      }`
                    : "keiner"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Kategorien: </dt>
                <dd className="inline">
                  {categories.map((c) => c.name).filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-[var(--tf-navy)]">Web-Adresse: </dt>
                <dd className="inline">/event/{webAddress || "…"}</dd>
              </div>
            </dl>
          </div>

          <fieldset className="grid gap-3 rounded-xl border border-[var(--tf-line)] p-4">
            <legend className="px-1 font-semibold">Anzeige</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showRemainingAvailability" />
              <span>Restliche Verfügbarkeit öffentlich anzeigen</span>
            </label>
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-[var(--tf-line)] p-4">
            <legend className="px-1 font-semibold">Tracking</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="trackingUseOrgDefaults"
                defaultChecked
              />
              <span>Org-Tracking übernehmen</span>
            </label>
            <details className="rounded-lg border border-[var(--tf-line)] p-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
                Erweitert: eigene Tracking-IDs
              </summary>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span>GA4</span>
                  <input
                    name="trackingGa4MeasurementId"
                    className="tf-input"
                    placeholder="G-…"
                  />
                </label>
                <label className="grid gap-1">
                  <span>GTM</span>
                  <input
                    name="trackingGtmContainerId"
                    className="tf-input"
                    placeholder="GTM-…"
                  />
                </label>
                <label className="grid gap-1">
                  <span>Meta Pixel</span>
                  <input name="trackingMetaPixelId" className="tf-input" />
                </label>
                <label className="grid gap-1">
                  <span>Google Ads</span>
                  <input
                    name="trackingGoogleAdsId"
                    className="tf-input"
                    placeholder="AW-…"
                  />
                </label>
              </div>
            </details>
          </fieldset>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="tf-btn"
          onClick={goBack}
          disabled={step === 0}
        >
          Zurück
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="tf-btn tf-btn-primary" onClick={goNext}>
            Weiter
          </button>
        ) : (
          <button
            type="submit"
            className="tf-btn tf-btn-primary"
            onClick={(e) => {
              const err = validateStep(0) || validateStep(1) || validateStep(2);
              if (err) {
                e.preventDefault();
                setStepError(err);
                return;
              }
              try {
                sessionStorage.removeItem(DRAFT_KEY);
              } catch {
                /* ignore */
              }
            }}
          >
            Event anlegen
          </button>
        )}
      </div>
    </form>
  );
}
