"use client";

import { useEffect, useMemo, useState } from "react";
import { CoverImageField } from "@/components/admin/cover-image-field";
import {
  shiftDateTimeLocal,
  SmartDateTimeInput,
} from "@/components/admin/smart-datetime-input";
import { CREATE_EVENT_STATUSES, slugify } from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import { formatEuroFromCents } from "@/lib/money";

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
  { id: "content", title: "Inhalte", hint: "Texte, Termin & Cover" },
  { id: "location", title: "Ort", hint: "Bestehend oder neu" },
  { id: "tickets", title: "Tickets", hint: "Kategorien & Preise" },
  { id: "finish", title: "Fertigstellen", hint: "Prüfen & anlegen" },
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
  action: (formData: FormData) => Promise<void>;
};

export function CreateEventWizard({ locations, templates, action }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
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
  }, []);

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
    () => locations.find((l) => l.id === locationId) ?? null,
    [locations, locationId],
  );
  const selectedVenuePlan = useMemo(
    () => selectedLocation?.venuePlans.find((p) => p.id === venuePlanId) ?? null,
    [selectedLocation, venuePlanId],
  );

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
    <form action={action} noValidate className="mt-6 space-y-6">
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
              <p className="text-xs text-[var(--tf-text-secondary)]">{s.hint}</p>
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
        <div className="tf-card grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="font-medium">Event-Titel</span>
            <span className="text-xs text-[var(--tf-text-secondary)]">
              Erscheint groß auf der Eventseite.
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
            <span className="text-xs text-[var(--tf-text-secondary)]">
              Für Karten, Listen und Teaser.
            </span>
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

          <div className="grid gap-4">
            <SmartDateTimeInput
              name="eventStartsAt"
              label="Beginn"
              hint="Nach Eingabe springt der Cursor weiter. Ende (+3 Std.) und Einlass (−2 Std.) werden automatisch gesetzt."
              value={eventStartsAt}
              onChange={applyStartDerived}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SmartDateTimeInput
                name="eventEndsAt"
                label="Ende"
                hint="Vorschlag: Beginn + 3 Stunden (auch über Mitternacht)."
                value={eventEndsAt}
                onChange={(v) => {
                  setEndsManual(true);
                  setEventEndsAt(v);
                }}
              />
              <SmartDateTimeInput
                name="doorsOpenAt"
                label="Einlass"
                hint="Vorschlag: Beginn − 2 Stunden."
                value={doorsOpenAt}
                onChange={(v) => {
                  setDoorsManual(true);
                  setDoorsOpenAt(v);
                }}
              />
            </div>
            <SmartDateTimeInput
              name="presaleStartsAt"
              label="Vorverkaufsstart"
              hint="Optional — gilt erst nach aktiver Verkaufsfreigabe."
              value={presaleStartsAt}
              onChange={setPresaleStartsAt}
            />
          </div>

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
            <span className="text-xs text-[var(--tf-text-secondary)]">
              Als Entwurf speichern: kein Verkauf, auch wenn das Vorverkaufsdatum schon erreicht ist.
              Zum Ticketverkauf später aktiv freigeben.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="font-medium">Ticket-Umsatzsteuer</span>
              <select
                name="ticketTaxPercent"
                className="tf-input"
                value={ticketTaxPercent}
                onChange={(e) => setTicketTaxPercent(e.target.value)}
              >
                <option value="0">0 %</option>
                <option value="7">7 % (häufig bei Konzerten)</option>
                <option value="19">19 %</option>
              </select>
              <span className="text-xs text-[var(--tf-text-secondary)]">
                Sonderfälle bitte mit der Steuerberatung prüfen.
              </span>
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
              <label className="grid gap-1 sm:col-span-2">
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
              <input type="hidden" name="administrationFeeCustomTaxPercent" value={feeTaxPercent} />
            )}
          </div>

          <CoverImageField
            name="coverImageUrl"
            initialUrl={coverImageUrl || null}
            refreshOnUpload={false}
            onUploaded={setCoverImageUrl}
          />

          <details className="rounded-xl border border-[var(--tf-line)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
              Erweitert: Link-Name
            </summary>
            <label className="mt-3 grid gap-1">
              <span className="text-xs text-[var(--tf-text-secondary)]">
                Kurzname in der Web-Adresse (wird automatisch aus dem Titel erzeugt). Nur ändern,
                wenn nötig.
              </span>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-[var(--tf-text-secondary)]">/event/</span>
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
      </section>

      {/* Step 2 — Ort */}
      <section className={step === 1 ? "space-y-4" : "hidden"}>
        <div className="tf-card grid gap-4 text-sm">
          <input type="hidden" name="locationMode" value={locationMode} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`tf-btn ${locationMode === "existing" ? "tf-btn-primary" : ""}`}
              onClick={() => setLocationMode("existing")}
              disabled={locations.length === 0}
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
            <>
              <label className="grid gap-1">
                <span className="font-medium">Ort</span>
                <select
                  name="locationId"
                  className="tf-input"
                  value={locationId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLocationId(next);
                    const loc = locations.find((l) => l.id === next);
                    const stillOk = loc?.venuePlans.some((p) => p.id === venuePlanId);
                    if (!stillOk) setVenuePlanId(loc?.venuePlans[0]?.id ?? "");
                  }}
                >
                  <option value="">— bitte wählen —</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.city ? ` (${loc.city})` : ""}
                      {loc.venuePlans.length > 0
                        ? ` · ${loc.venuePlans.length} Saalplan${loc.venuePlans.length === 1 ? "" : "e"}`
                        : ""}
                    </option>
                  ))}
                </select>
                {locations.length === 0 ? (
                  <span className="text-xs text-[var(--tf-text-secondary)]">
                    Noch keine Orte vorhanden — bitte einen neuen anlegen.
                  </span>
                ) : null}
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
                <span className="text-xs text-[var(--tf-text-secondary)]">
                  {selectedLocation && selectedLocation.venuePlans.length === 0 ? (
                    <>
                      Noch kein Plan für diesen Ort. Später unter{" "}
                      <a
                        href={`/admin/locations/${selectedLocation.id}`}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Locations → Saalplan
                      </a>{" "}
                      anlegen und hier zuweisen.
                    </>
                  ) : (
                    "Mit Saalplan: Bestplatz oder Selbstwahl einstellen. Kontingente im nächsten Schritt."
                  )}
                </span>
              </label>
              {venuePlanId ? (
                <fieldset className="space-y-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
                  <legend className="px-1 text-sm font-semibold text-[var(--tf-navy)]">
                    Onlineshop-Verkauf
                  </legend>
                  <input type="hidden" name="seatingBookingMode" value={seatingBookingMode} />
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={seatingBookingMode === "seat_map_and_best"}
                      onChange={() => setSeatingBookingMode("seat_map_and_best")}
                    />
                    <span>
                      <span className="font-medium">Saalplan + Bestplatzbuchung</span>
                      <span className="block text-xs text-[var(--tf-text-secondary)]">
                        Kunde wählt Sitze selbst oder lässt sich den besten Platz geben.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={seatingBookingMode === "best_available"}
                      onChange={() => setSeatingBookingMode("best_available")}
                    />
                    <span>
                      <span className="font-medium">Nur Bestplatzbuchung</span>
                      <span className="block text-xs text-[var(--tf-text-secondary)]">
                        System vergibt beste freie Plätze, möglichst nebeneinander.
                      </span>
                    </span>
                  </label>
                </fieldset>
              ) : (
                <input type="hidden" name="seatingBookingMode" value="none" />
              )}
            </>
          ) : (
            <>
              <input type="hidden" name="locationId" value="" />
              <input type="hidden" name="venuePlanId" value="" />
              <input type="hidden" name="seatingBookingMode" value="none" />
              <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                Nach dem Anlegen kannst du unter Locations einen Saalplan zeichnen und dem Event
                zuweisen.
              </p>
              <label className="grid gap-1">
                <span className="font-medium">Name des Orts</span>
                <input
                  name="newLocationName"
                  className="tf-input"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="z. B. Stadthalle Musterstadt"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                <label className="grid gap-1">
                  <span className="font-medium">Straße</span>
                  <input
                    name="newLocationStreet"
                    className="tf-input"
                    value={newLocStreet}
                    onChange={(e) => setNewLocStreet(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Hausnr.</span>
                  <input
                    name="newLocationHouseNumber"
                    className="tf-input"
                    value={newLocHouse}
                    onChange={(e) => setNewLocHouse(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr_5rem]">
                <label className="grid gap-1">
                  <span className="font-medium">PLZ</span>
                  <input
                    name="newLocationPostalCode"
                    className="tf-input"
                    value={newLocZip}
                    onChange={(e) => setNewLocZip(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Stadt</span>
                  <input
                    name="newLocationCity"
                    className="tf-input"
                    value={newLocCity}
                    onChange={(e) => setNewLocCity(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Land</span>
                  <input
                    name="newLocationCountry"
                    className="tf-input"
                    value={newLocCountry}
                    onChange={(e) => setNewLocCountry(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium">Telefon (optional)</span>
                  <input
                    name="newLocationPhone"
                    className="tf-input"
                    value={newLocPhone}
                    onChange={(e) => setNewLocPhone(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Homepage (optional)</span>
                  <input
                    name="newLocationHomepage"
                    className="tf-input"
                    value={newLocHomepage}
                    onChange={(e) => setNewLocHomepage(e.target.value)}
                    placeholder="https://"
                  />
                </label>
                <label className="grid gap-1 sm:col-span-2">
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
            </>
          )}
        </div>
      </section>

      {/* Step 3 — Tickets */}
      <section className={step === 2 ? "space-y-4" : "hidden"}>
        <div className="tf-card grid gap-4 text-sm">
          <div>
            <p className="font-medium text-[var(--tf-navy)]">Ticketkategorien</p>
            <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
              Mindestens eine Kategorie mit Preis und Kontingent. Optional Verkaufsfenster für Early
              Bird.
            </p>
          </div>

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
                className="grid gap-3 rounded-xl border border-[var(--tf-line)] p-3"
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 sm:col-span-2">
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
                  <div className="sm:col-span-2">
                    <SmartDateTimeInput
                      name="categorySaleStartsAt"
                      label="Verkauf von (optional)"
                      value={cat.saleStartsAt}
                      onChange={(v) => updateCategory(cat.key, { saleStartsAt: v })}
                    />
                  </div>
                  <div className="sm:col-span-2">
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
        <div className="tf-card grid gap-4 text-sm">
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
                  {locationMode === "new"
                    ? "später zuweisen"
                    : selectedVenuePlan
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
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="showRemainingAvailability"
                className="mt-1"
              />
              <span>
                Restliche Verfügbarkeit öffentlich anzeigen
                <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                  Zeigt z. B. „Noch 42 verfügbar“ und Knappheits-Hinweise. Standard: aus — später
                  einschalten, wenn nur noch wenige Tickets da sind.
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-[var(--tf-line)] p-4">
            <legend className="px-1 font-semibold">Tracking</legend>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="trackingUseOrgDefaults"
                className="mt-1"
                defaultChecked
              />
              <span>
                Org-Tracking übernehmen
                <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                  Empfohlen. Nutzt die Tracking-IDs aus den Stammdaten.
                </span>
              </span>
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
