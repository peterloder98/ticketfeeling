"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CoverImageField } from "@/components/admin/cover-image-field";
import {
  shiftDateTimeLocal,
  SmartDateTimeInput,
} from "@/components/admin/smart-datetime-input";
import { CountrySelect } from "@/components/country-select";
import { PhoneInput } from "@/components/phone-input";
import {
  discardVenuePlanQuietAction,
  prepareWizardLocationPlanAction,
} from "@/app/admin/saalplan/actions";
import { ArtistLineupEditor } from "@/components/admin/artist-lineup-editor";
import {
  emptyLineupArtist,
  type LibraryArtist,
  type LineupArtistRow,
} from "@/lib/admin/lineup-artist";
import { CREATE_EVENT_STATUSES, slugify } from "@/lib/admin/event-form";
import { eventStatusLabel } from "@/lib/admin/nav";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  filterPostalCodeInput,
  filterStreetNameInput,
} from "@/lib/commerce/address";
import { formatEuroFromCents } from "@/lib/money";

const DRAFT_KEY_LEGACY = "tf-create-event-wizard-v1";

type DraftGate = "checking" | "offer" | "ready";

function draftLocalKey(organizationId: string) {
  return organizationId
    ? `${DRAFT_KEY_LEGACY}:${organizationId}`
    : DRAFT_KEY_LEGACY;
}

function draftSessionKey(organizationId: string) {
  return draftLocalKey(organizationId);
}

function readDraftRaw(organizationId: string): string | null {
  const primary = draftLocalKey(organizationId);
  try {
    const fromLocal = localStorage.getItem(primary);
    if (fromLocal) return fromLocal;
    // Migrate legacy unscoped key once.
    if (organizationId) {
      const legacy = localStorage.getItem(DRAFT_KEY_LEGACY);
      if (legacy) {
        localStorage.setItem(primary, legacy);
        localStorage.removeItem(DRAFT_KEY_LEGACY);
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const fromSession = sessionStorage.getItem(draftSessionKey(organizationId));
    if (fromSession) return fromSession;
    if (organizationId) {
      const legacy = sessionStorage.getItem(DRAFT_KEY_LEGACY);
      if (legacy) {
        sessionStorage.setItem(draftSessionKey(organizationId), legacy);
        sessionStorage.removeItem(DRAFT_KEY_LEGACY);
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeDraftRaw(organizationId: string, json: string) {
  try {
    localStorage.setItem(draftLocalKey(organizationId), json);
  } catch {
    /* quota / private mode */
  }
  try {
    sessionStorage.setItem(draftSessionKey(organizationId), json);
  } catch {
    /* ignore */
  }
}

function clearDraftRaw(organizationId: string) {
  try {
    localStorage.removeItem(draftLocalKey(organizationId));
    localStorage.removeItem(DRAFT_KEY_LEGACY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(draftSessionKey(organizationId));
    sessionStorage.removeItem(DRAFT_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

function isMeaningfulDraft(draft: Record<string, unknown>): boolean {
  const categories = Array.isArray(draft.categories) ? draft.categories : [];
  const lineup = Array.isArray(draft.lineup) ? draft.lineup : [];
  return Boolean(
    (typeof draft.name === "string" && draft.name.trim()) ||
      (typeof draft.eventStartsAt === "string" && draft.eventStartsAt) ||
      (typeof draft.venuePlanId === "string" && draft.venuePlanId) ||
      (typeof draft.step === "number" && draft.step > 0) ||
      (typeof draft.newLocName === "string" && draft.newLocName.trim()) ||
      (typeof draft.subtitle === "string" && draft.subtitle.trim()) ||
      (typeof draft.description === "string" && draft.description.trim()) ||
      (typeof draft.coverImageUrl === "string" && draft.coverImageUrl.trim()) ||
      categories.length > 0 ||
      lineup.some(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as { name?: unknown }).name === "string" &&
          Boolean((row as { name: string }).name.trim()),
      ),
  );
}

/** Prefer keeping a richer draft if a transient empty write races it. */
function draftWeight(draft: Record<string, unknown>): number {
  let w = 0;
  if (typeof draft.name === "string" && draft.name.trim()) w += 4;
  if (typeof draft.eventStartsAt === "string" && draft.eventStartsAt) w += 3;
  if (typeof draft.venuePlanId === "string" && draft.venuePlanId) w += 3;
  if (typeof draft.step === "number") w += draft.step;
  if (Array.isArray(draft.categories)) w += draft.categories.length * 2;
  if (Array.isArray(draft.lineup)) {
    w += draft.lineup.filter(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as { name?: unknown }).name === "string" &&
        Boolean((row as { name: string }).name.trim()),
    ).length;
  }
  if (typeof draft.newLocName === "string" && draft.newLocName.trim()) w += 2;
  if (typeof draft.coverImageUrl === "string" && draft.coverImageUrl.trim()) w += 1;
  return w;
}

function humanizeCreateEventError(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  switch (code) {
    case "COVER_REQUIRED_FOR_SALE":
      return "Für den gewählten Status brauchst du ein Cover-Bild. Dein Entwurf bleibt gespeichert.";
    case "TRACKING_REVIEW_REQUIRED":
      return "Bitte Tracking prüfen (Org-Defaults oder eigene IDs). Dein Entwurf bleibt gespeichert.";
    case "CATEGORIES_REQUIRED":
      return "Mindestens eine Ticketkategorie fehlt. Dein Entwurf bleibt gespeichert.";
    case "TAX_RATE_MISSING":
      return "Kein aktiver Steuersatz in der Organisation. Dein Entwurf bleibt gespeichert.";
    case "NAME_REQUIRED":
      return "Bitte einen Event-Titel eingeben.";
    case "LOCATION_REQUIRED":
    case "LOCATION_NAME_REQUIRED":
      return "Bitte einen Ort wählen oder anlegen.";
    case "LOCATION_NOT_FOUND":
      return "Der gewählte Ort wurde nicht gefunden.";
    case "VENUE_PLAN_NOT_FOUND":
    case "VENUE_PLAN_NEEDS_LOCATION":
      return "Der Saalplan konnte nicht zugeordnet werden — bitte im Schritt „Ort“ neu wählen.";
    case "FORBIDDEN":
      return "Keine Berechtigung zum Anlegen.";
    default:
      if (
        code === STREET_NO_NUMBERS_MESSAGE ||
        code === POSTAL_CODE_DIGITS_ONLY_MESSAGE ||
        code.includes("Straße") ||
        code.includes("Postleitzahl")
      ) {
        return code;
      }
      return "Event konnte nicht angelegt werden. Dein Entwurf bleibt gespeichert — bitte Angaben prüfen und erneut versuchen.";
  }
}

function shouldAutoResumeWizard(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("resume") === "1" || sp.get("from") === "saalplan";
  } catch {
    return false;
  }
}

function stripResumeParamsFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("resume") && !url.searchParams.has("from")) return;
    url.searchParams.delete("resume");
    url.searchParams.delete("from");
    const qs = url.searchParams.toString();
    window.history.replaceState(null, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

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
    priceEuro: "0",
    capacity: "100",
    maxPerOrder: "10",
    saleStartsAt: "",
    saleEndsAt: "",
    ...partial,
  };
}

function saalplanEditorUrl(planId: string) {
  // resume=1 → wizard auto-restores draft after return from the editor tab.
  const returnTo = encodeURIComponent("/admin/events/neu?resume=1");
  const returnLabel = encodeURIComponent("Zurück zum Wizard");
  return `/admin/saalplan/${planId}?returnTo=${returnTo}&returnLabel=${returnLabel}`;
}

function WizardSubmitButton({
  disabled,
  onValidate,
}: {
  disabled: boolean;
  onValidate: () => string | null;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="tf-btn tf-btn-primary"
      disabled={disabled || pending}
      onClick={(e) => {
        const err = onValidate();
        if (err) {
          e.preventDefault();
        }
      }}
    >
      {pending ? "Wird angelegt…" : "Event anlegen"}
    </button>
  );
}

type CreateEventActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

type Props = {
  organizationId: string;
  locations: WizardLocation[];
  templates: WizardCategoryTemplate[];
  tours?: WizardTour[];
  artists?: LibraryArtist[];
  initialTourId?: string;
  action: (formData: FormData) => Promise<CreateEventActionResult>;
};

export function CreateEventWizard({
  organizationId,
  locations,
  templates,
  tours = [],
  artists: artistLibrary = [],
  initialTourId = "",
  action,
}: Props) {
  const [draftGate, setDraftGate] = useState<DraftGate>("checking");
  const [pendingDraft, setPendingDraft] = useState<Record<string, unknown> | null>(null);
  /** Block auto-persist until restore/discard decision is applied — prevents empty writes wiping storage. */
  const allowPersistRef = useRef(false);
  const hydrated = draftGate === "ready";
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
  // Never auto-attach a saalplan — unfinished shells used to hijack every new event.
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [locationQuery, setLocationQuery] = useState("");
  const [venuePlanId, setVenuePlanId] = useState("");
  const [seatingBookingMode, setSeatingBookingMode] = useState("none");
  const [newLocName, setNewLocName] = useState("");
  const [newLocStreet, setNewLocStreet] = useState("");
  const [newLocStreetHint, setNewLocStreetHint] = useState<string | null>(null);
  const [newLocHouse, setNewLocHouse] = useState("");
  const [newLocZip, setNewLocZip] = useState("");
  const [newLocZipHint, setNewLocZipHint] = useState<string | null>(null);
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
  const [planBusy, startPlanBusy] = useTransition();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [lineup, setLineup] = useState<LineupArtistRow[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);

  function clearDraftStorage() {
    clearDraftRaw(organizationId);
  }

  function buildDraftSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      v: 1,
      savedAt: new Date().toISOString(),
      organizationId,
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
      locationQuery,
      venuePlanId,
      wantSaalplan,
      seatingBookingMode,
      planName,
      planWidthM,
      planDepthM,
      planWithStage,
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
      lineup,
      ...overrides,
    };
  }

  function persistDraftNow(overrides: Record<string, unknown> = {}) {
    const next = buildDraftSnapshot(overrides);
    try {
      const raw = readDraftRaw(organizationId);
      if (raw) {
        const prev = JSON.parse(raw) as Record<string, unknown>;
        // Never let a thinner/empty snapshot silently replace a richer draft.
        if (isMeaningfulDraft(prev) && draftWeight(next) < draftWeight(prev) && !isMeaningfulDraft(next)) {
          return;
        }
        if (isMeaningfulDraft(prev) && draftWeight(next) + 2 < draftWeight(prev) && !next.name && !next.eventStartsAt) {
          return;
        }
      }
    } catch {
      /* ignore parse issues — still write */
    }
    writeDraftRaw(organizationId, JSON.stringify(next));
  }

  function applyDraft(draft: Record<string, unknown>) {
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
    if (typeof draft.locationQuery === "string") setLocationQuery(draft.locationQuery);
    if (typeof draft.wantSaalplan === "boolean") setWantSaalplan(draft.wantSaalplan);
    if (typeof draft.seatingBookingMode === "string") {
      setSeatingBookingMode(draft.seatingBookingMode);
    }
    if (typeof draft.planName === "string") setPlanName(draft.planName);
    if (typeof draft.planWidthM === "string") setPlanWidthM(draft.planWidthM);
    if (typeof draft.planDepthM === "string") setPlanDepthM(draft.planDepthM);
    if (typeof draft.planWithStage === "boolean") setPlanWithStage(draft.planWithStage);
    // Restore plan from draft — localStorage survives the editor tab round-trip.
    if (typeof draft.venuePlanId === "string" && draft.venuePlanId) {
      const locId =
        typeof draft.locationId === "string" ? draft.locationId : locationId;
      const plan = locations
        .find((l) => l.id === locId)
        ?.venuePlans.find((p) => p.id === draft.venuePlanId);
      if (plan) {
        setVenuePlanId(plan.id);
        setWantSaalplan(true);
        if (
          draft.seatingBookingMode !== "best_available" &&
          draft.seatingBookingMode !== "seat_map_and_best"
        ) {
          setSeatingBookingMode("seat_map_and_best");
        }
      } else {
        // Plan may be newly created — still restore id so form submits it.
        setVenuePlanId(String(draft.venuePlanId));
        setWantSaalplan(true);
        if (
          draft.seatingBookingMode !== "best_available" &&
          draft.seatingBookingMode !== "seat_map_and_best"
        ) {
          setSeatingBookingMode("seat_map_and_best");
        }
      }
    }
    if (typeof draft.newLocName === "string") setNewLocName(draft.newLocName);
    if (typeof draft.newLocStreet === "string") setNewLocStreet(draft.newLocStreet);
    if (typeof draft.newLocHouse === "string") setNewLocHouse(draft.newLocHouse);
    if (typeof draft.newLocZip === "string") setNewLocZip(draft.newLocZip);
    if (typeof draft.newLocCity === "string") setNewLocCity(draft.newLocCity);
    if (typeof draft.newLocCountry === "string") setNewLocCountry(draft.newLocCountry);
    if (typeof draft.newLocPhone === "string") setNewLocPhone(draft.newLocPhone);
    if (typeof draft.newLocHomepage === "string") setNewLocHomepage(draft.newLocHomepage);
    if (typeof draft.newLocCapacity === "string") setNewLocCapacity(draft.newLocCapacity);
    // Always restore categories when present (including validating capacity strings).
    if (Array.isArray(draft.categories)) {
      setCategories(
        (draft.categories as CategoryRow[]).map((c) => ({
          ...newCategoryRow(),
          ...c,
          key: typeof c.key === "string" && c.key ? c.key : newCategoryRow().key,
          capacity:
            c.capacity === undefined || c.capacity === null || c.capacity === ""
              ? "100"
              : String(c.capacity),
          priceEuro:
            c.priceEuro === undefined || c.priceEuro === null || c.priceEuro === ""
              ? "0"
              : String(c.priceEuro),
          maxPerOrder:
            c.maxPerOrder === undefined || c.maxPerOrder === null || c.maxPerOrder === ""
              ? "10"
              : String(c.maxPerOrder),
        })),
      );
    }
    if (Array.isArray(draft.lineup)) {
      setLineup(
        (draft.lineup as Partial<LineupArtistRow>[]).map((row) =>
          emptyLineupArtist({
            ...row,
            ...(typeof row.key === "string" && row.key ? { key: row.key } : {}),
            profileImageUrl: row.profileImageUrl ?? "",
            headerImageUrl: row.headerImageUrl ?? "",
          }),
        ),
      );
    }
  }

  function continuePendingDraft() {
    if (pendingDraft) applyDraft(pendingDraft);
    allowPersistRef.current = true;
    setPendingDraft(null);
    setDraftGate("ready");
  }

  function discardPendingDraft() {
    const orphanPlanId =
      typeof pendingDraft?.venuePlanId === "string" ? pendingDraft.venuePlanId : "";
    clearDraftStorage();
    allowPersistRef.current = true;
    setPendingDraft(null);
    setVenuePlanId("");
    setSeatingBookingMode("none");
    setWantSaalplan(false);
    setStep(0);
    setDraftGate("ready");
    if (orphanPlanId) {
      const plan = locations
        .flatMap((l) => l.venuePlans)
        .find((p) => p.id === orphanPlanId);
      if (plan && plan.seatCapacity === 0) {
        void discardVenuePlanQuietAction(orphanPlanId).then((res) => {
          if (res.ok) {
            setLocList((prev) =>
              prev.map((l) => ({
                ...l,
                venuePlans: l.venuePlans.filter((p) => p.id !== orphanPlanId),
              })),
            );
          }
        });
      }
    }
  }

  function discardCurrentSaalplan() {
    const id = venuePlanId;
    if (!id) {
      setVenuePlanId("");
      setSeatingBookingMode("none");
      setWantSaalplan(false);
      return;
    }
    const plan =
      locList.flatMap((l) => l.venuePlans).find((p) => p.id === id) ?? null;
    const unfinished = !plan || plan.seatCapacity === 0;
    const msg = unfinished
      ? "Diesen Saalplan verwerfen? Er ist noch nicht fertig und wird gelöscht."
      : "Saalplan vom Event lösen? Der Plan bleibt am Ort erhalten.";
    if (!window.confirm(msg)) return;

    startPlanBusy(async () => {
      if (unfinished) {
        const res = await discardVenuePlanQuietAction(id);
        if (res.ok) {
          setLocList((prev) =>
            prev.map((l) => ({
              ...l,
              venuePlans: l.venuePlans.filter((p) => p.id !== id),
            })),
          );
        } else if (res.reason === "IN_USE") {
          setStepError("Dieser Saalplan hängt schon an einem Event und kann nicht gelöscht werden.");
          return;
        }
      }
      setVenuePlanId("");
      setSeatingBookingMode("none");
      setWantSaalplan(false);
      setStepError(null);
    });
  }

  // Restore drafts: auto-resume after saalplan return; otherwise offer resume/discard.
  useEffect(() => {
    allowPersistRef.current = false;
    try {
      const raw = readDraftRaw(organizationId);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        if (isMeaningfulDraft(draft)) {
          if (shouldAutoResumeWizard()) {
            applyDraft(draft);
            stripResumeParamsFromUrl();
            allowPersistRef.current = true;
            setDraftGate("ready");
            return;
          }
          setPendingDraft(draft);
          setDraftGate("offer");
          return;
        }
        // Empty placeholder only — safe to drop.
        clearDraftStorage();
      }
    } catch {
      // Keep storage on parse hiccups; start fresh UI without wiping a maybe-valid blob.
    }
    allowPersistRef.current = true;
    setDraftGate("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / tour / org change only
  }, [initialTourId, organizationId]);

  useEffect(() => {
    if (draftGate !== "ready" || !allowPersistRef.current) return;
    persistDraftNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot via persistDraftNow closures
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
    locationQuery,
    venuePlanId,
    wantSaalplan,
    seatingBookingMode,
    planName,
    planWidthM,
    planDepthM,
    planWithStage,
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
    lineup,
    draftGate,
    organizationId,
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
  const filteredLocations = useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    if (!q) return locList;
    return locList.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.city?.toLowerCase().includes(q) ?? false),
    );
  }, [locList, locationQuery]);

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
              priceEuro: "0",
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
      // Mit Saalplan: Kategorien später am Event — ohne Saalplan mind. eine Kategorie.
      if (venuePlanId && seatingBookingMode !== "none") return null;
      if (categories.length === 0) {
        return "Mindestens eine Ticketkategorie — oder Saalplan nutzen und später zuordnen.";
      }
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

    // Persist full draft before opening a new tab (localStorage — shared across tabs).
    persistDraftNow({
      wantSaalplan: true,
      seatingBookingMode:
        seatingBookingMode === "none" ? "seat_map_and_best" : seatingBookingMode,
    });

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
        setWantSaalplan(true);
        persistDraftNow({
          locationMode: "existing",
          locationId: result.locationId,
          venuePlanId: result.venuePlanId,
          wantSaalplan: true,
          seatingBookingMode: "seat_map_and_best",
        });
        window.open(saalplanEditorUrl(result.venuePlanId), "_blank", "noopener,noreferrer");
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
      ok:
        (Boolean(venuePlanId) && seatingBookingMode !== "none") ||
        (categories.length > 0 && categories.every((c) => c.name.trim())),
      label: venuePlanId
        ? "Saalplan (Kategorien am Event)"
        : "Mindestens 1 Ticketkategorie",
    },
    { ok: true, label: "Cover (empfohlen)", soft: true },
    {
      ok: lineup.some((a) => a.name.trim()),
      label: "Künstler (optional)",
      soft: true,
    },
  ];

  async function submitWizard(formData: FormData) {
    // Flush latest state first — never clear storage until create succeeds.
    persistDraftNow();
    setStepError(null);
    try {
      // createEventAction returns a result (no redirect()) so we never catch
      // NEXT_REDIRECT — that pattern caused production Application errors.
      const result = await action(formData);
      if (result.ok) {
        clearDraftStorage();
        window.location.assign(result.redirectTo);
        return;
      }
      setStepError(humanizeCreateEventError(new Error(result.error)));
    } catch (err) {
      setStepError(humanizeCreateEventError(err));
    }
  }

  return (
    <form
      id="create-event-wizard-form"
      action={submitWizard}
      noValidate
      className="mt-6 w-full space-y-6"
    >
      {draftGate === "offer" ? (
        <div className="rounded-xl border border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] px-4 py-4">
          <p className="font-medium text-[var(--tf-navy)]">Entwurf wiederherstellen</p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Es liegt ein gespeicherter Event-Entwurf vor (Titel, Kategorien, Kontingent, Künstler,
            Saalplan). Wiederherstellen oder verwerfen — nichts geht stillschweigend verloren.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="tf-btn tf-btn-primary"
              onClick={continuePendingDraft}
            >
              Entwurf wiederherstellen
            </button>
            <button type="button" className="tf-btn" onClick={discardPendingDraft}>
              Entwurf verwerfen
            </button>
          </div>
        </div>
      ) : null}

      <ol className={`grid gap-2 sm:grid-cols-4 ${draftGate !== "ready" ? "opacity-40 pointer-events-none" : ""}`}>
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

      <div className={draftGate !== "ready" ? "pointer-events-none opacity-40" : undefined}>
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
                  Erweitert: Steuer & Link-Name
                </summary>
                <div className="mt-3 grid gap-3">
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
                    <label className="grid gap-1">
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
                  <label className="grid gap-1">
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
                        placeholder="automatisch aus Titel"
                      />
                    </div>
                    <span className="text-xs text-[var(--tf-text-secondary)]">
                      Leer lassen = aus dem Titel erzeugen
                    </span>
                  </label>
                </div>
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

          <div className="border-t border-[var(--tf-line)] pt-6">
            <h2 className="text-base font-semibold text-[var(--tf-navy)]">Künstler</h2>
            <p className="mt-1 mb-3 text-sm text-[var(--tf-text-secondary)]">
              Wer steht auf der Bühne? Namen reichen erstmal — Bio, Homepage und YouTube kannst du
              bei Bedarf gleich mitnehmen.
            </p>
            <ArtistLineupEditor
              value={lineup}
              onChange={setLineup}
              library={artistLibrary}
              hint="Name tippen, Enter — fertig. Über „Details & Bild“ Profilbild und Infos ergänzen."
            />
          </div>
        </div>
      </section>

      {/* Step 2 — Ort */}
      <section className={step === 1 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 grid gap-6 text-sm">
          <input type="hidden" name="locationMode" value={locationMode} />
          <input type="hidden" name="locationId" value={locationMode === "existing" ? locationId : ""} />
          <input type="hidden" name="venuePlanId" value={venuePlanId} />

          {locationMode === "existing" ? (
            <div className="space-y-4">
              <label className="grid gap-1">
                <span className="font-medium">Location suchen</span>
                <input
                  className="tf-input"
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  placeholder="Name oder Stadt…"
                  autoComplete="off"
                />
              </label>
              <div className="max-h-56 overflow-auto rounded-xl border border-[var(--tf-line)]">
                {filteredLocations.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[var(--tf-text-secondary)]">
                    Keine Treffer — lege unten eine neue Location an.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--tf-line)]">
                    {filteredLocations.map((loc) => {
                      const active = loc.id === locationId;
                      return (
                        <li key={loc.id}>
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                              active
                                ? "bg-[rgba(20,184,166,0.12)] font-semibold text-[var(--tf-navy)]"
                                : "hover:bg-[rgba(15,39,71,0.04)]"
                            }`}
                            onClick={() => {
                              setLocationId(loc.id);
                              setVenuePlanId("");
                              setSeatingBookingMode("none");
                              setWantSaalplan(false);
                            }}
                          >
                            <span>
                              {loc.name}
                              {loc.city ? (
                                <span className="font-normal text-[var(--tf-text-secondary)]">
                                  {" "}
                                  · {loc.city}
                                </span>
                              ) : null}
                            </span>
                            {loc.venuePlans.length > 0 ? (
                              <span className="text-xs text-[var(--tf-text-secondary)]">
                                {loc.venuePlans.length} Saalplan
                                {loc.venuePlans.length === 1 ? "" : "e"}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-[var(--tf-teal)] hover:underline"
                onClick={() => setLocationMode("new")}
              >
                Location nicht dabei? Neu anlegen
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-12">
                {locList.length > 0 ? (
                  <button
                    type="button"
                    className="mb-2 text-sm font-semibold text-[var(--tf-teal)] hover:underline"
                    onClick={() => setLocationMode("existing")}
                  >
                    ← Bestehende Location suchen
                  </button>
                ) : null}
                <p className="font-medium text-[var(--tf-navy)]">Neue Location anlegen</p>
              </div>
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
                  onChange={(e) => {
                    const raw = e.target.value;
                    const filtered = filterStreetNameInput(raw);
                    setNewLocStreet(filtered);
                    setNewLocStreetHint(raw !== filtered ? STREET_NO_NUMBERS_MESSAGE : null);
                  }}
                />
                {newLocStreetHint ? (
                  <span className="text-xs text-[var(--danger)]">{newLocStreetHint}</span>
                ) : null}
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
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  value={newLocZip}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const filtered = filterPostalCodeInput(raw);
                    setNewLocZip(filtered);
                    setNewLocZipHint(raw !== filtered ? POSTAL_CODE_DIGITS_ONLY_MESSAGE : null);
                  }}
                />
                {newLocZipHint ? (
                  <span className="text-xs text-[var(--danger)]">{newLocZipHint}</span>
                ) : null}
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

          {showSaalplanSection ? (
            <div className="space-y-4 rounded-xl border border-[var(--tf-line)] p-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={wantSaalplan}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setWantSaalplan(on);
                    if (!on) {
                      setVenuePlanId("");
                      setSeatingBookingMode("none");
                    }
                  }}
                />
                <span className="font-medium text-[var(--tf-navy)]">Saalplan verwenden</span>
              </label>

              {wantSaalplan ? (
                <div className="space-y-4">
                  {locationMode === "existing" &&
                  (selectedLocation?.venuePlans.length ?? 0) > 0 ? (
                    <label className="grid gap-1">
                      <span className="font-medium">Bestehenden Saalplan wählen</span>
                      <select
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
                      >
                        <option value="">— neuen zeichnen —</option>
                        {(selectedLocation?.venuePlans ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.seatCapacity > 0
                              ? ` · ${p.seatCapacity} Sitze`
                              : " · noch unfertig"}{" "}
                            · {p.sizeLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {!venuePlanId ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                          {planBusy ? "Wird vorbereitet…" : "Saalplan zeichnen (neues Fenster)"}
                        </button>
                        <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
                          Öffnet den Geometrie-Editor in einem neuen Tab. Speichern, dann hierher
                          zurück — Buchungsmodus und Zuordnung folgen am Event.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[var(--tf-navy)]">
                        Saalplan gewählt
                        {selectedVenuePlan ? `: ${selectedVenuePlan.name}` : ""}.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={saalplanEditorUrl(venuePlanId)}
                          target="_blank"
                          rel="noreferrer"
                          className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                        >
                          Saalplan bearbeiten
                        </a>
                        <button
                          type="button"
                          className="tf-btn text-[var(--danger)] !min-h-10 text-sm"
                          disabled={planBusy}
                          onClick={discardCurrentSaalplan}
                        >
                          Saalplan verwerfen
                        </button>
                      </div>
                      <fieldset className="space-y-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
                        <legend className="px-1 text-sm font-semibold text-[var(--tf-navy)]">
                          Buchungsmodus
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
                    </div>
                  )}
                </div>
              ) : (
                <input type="hidden" name="seatingBookingMode" value="none" />
              )}
            </div>
          ) : (
            <input type="hidden" name="seatingBookingMode" value="none" />
          )}
        </div>
      </section>

      {/* Step 3 — Tickets */}
      <section className={step === 2 ? "space-y-4" : "hidden"}>
        <div className="tf-card !p-6 md:!p-8 grid gap-4 text-sm">
          {venuePlanId && seatingBookingMode !== "none" ? (
            <div className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-4 py-3">
              <p className="font-medium text-[var(--tf-navy)]">
                Kategorien und Preise kommen am Event
              </p>
              <p className="mt-1 text-[var(--tf-text-secondary)]">
                Nach dem Anlegen landest du bei der Saalplan-Zuordnung — dort Preiskategorien
                anlegen und Bereiche zuweisen. Preise darunter, Kontingent automatisch aus dem
                Plan.
              </p>
            </div>
          ) : (
            <>
              <p className="font-medium text-[var(--tf-navy)]">Ticketkategorien</p>
              <p className="text-[var(--tf-text-secondary)]">
                Ohne Saalplan legst du hier die Verkaufskategorien an. Preise ab 0 € sind ok.
              </p>

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
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 md:col-span-1">
                        <span className="font-medium">Name</span>
                        <input
                          name="categoryName"
                          className="tf-input"
                          value={cat.name}
                          onChange={(e) => updateCategory(cat.key, { name: e.target.value })}
                          placeholder="z. B. Kategorie 1, VIP"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="font-medium">Preis (€)</span>
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
                      <input type="hidden" name="categoryMaxPerOrder" value={cat.maxPerOrder} />
                      <input type="hidden" name="categorySaleStartsAt" value={cat.saleStartsAt} />
                      <input type="hidden" name="categorySaleEndsAt" value={cat.saleEndsAt} />
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="tf-btn w-fit" onClick={() => addCategory()}>
                + Weitere Kategorie
              </button>
            </>
          )}
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
                <dt className="inline font-medium text-[var(--tf-navy)]">Künstler: </dt>
                <dd className="inline">
                  {lineup.map((a) => a.name).filter(Boolean).join(", ") || "—"}
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

          <details className="rounded-xl border border-[var(--tf-line)] p-4">
            <summary className="cursor-pointer font-semibold text-[var(--tf-navy)]">
              Erweitert: Tracking
            </summary>
            <fieldset className="mt-3 grid gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="trackingUseOrgDefaults"
                  defaultChecked
                />
                <span>Org-Tracking übernehmen</span>
              </label>
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
            </fieldset>
          </details>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="tf-btn"
            onClick={goBack}
            disabled={step === 0 || draftGate !== "ready"}
          >
            Zurück
          </button>
          {draftGate === "ready" ? (
            <button
              type="button"
              className="text-sm text-[var(--tf-text-secondary)] underline-offset-2 hover:text-[var(--tf-navy)] hover:underline"
              onClick={() => {
                if (
                  !window.confirm(
                    "Entwurf verwerfen und von vorn beginnen? Unfertige Saalpläne werden gelöscht.",
                  )
                ) {
                  return;
                }
                const orphanId = venuePlanId;
                clearDraftStorage();
                setStep(0);
                setName("");
                setSlug("");
                setSlugManual(false);
                setSubtitle("");
                setShortDescription("");
                setDescription("");
                setStatus("draft");
                setEventStartsAt("");
                setEventEndsAt("");
                setDoorsOpenAt("");
                setPresaleStartsAt("");
                setEndsManual(false);
                setDoorsManual(false);
                setCoverImageUrl("");
                setTourId(initialTourId);
                setLocationMode(locations.length > 0 ? "existing" : "new");
                setLocationId(locations[0]?.id ?? "");
                setVenuePlanId("");
                setSeatingBookingMode("none");
                setNewLocName("");
                setNewLocStreet("");
                setNewLocStreetHint(null);
                setNewLocHouse("");
                setNewLocZip("");
                setNewLocZipHint(null);
                setNewLocCity("");
                setNewLocCountry("DE");
                setNewLocPhone("");
                setNewLocHomepage("");
                setNewLocCapacity("");
                setWantSaalplan(false);
                setCategories([]);
                setLineup([]);
                setStepError(null);
                allowPersistRef.current = true;
                if (orphanId) {
                  const plan = locList
                    .flatMap((l) => l.venuePlans)
                    .find((p) => p.id === orphanId);
                  if (!plan || plan.seatCapacity === 0) {
                    void discardVenuePlanQuietAction(orphanId).then((res) => {
                      if (res.ok) {
                        setLocList((prev) =>
                          prev.map((l) => ({
                            ...l,
                            venuePlans: l.venuePlans.filter((p) => p.id !== orphanId),
                          })),
                        );
                      }
                    });
                  }
                }
              }}
            >
              Entwurf verwerfen
            </button>
          ) : null}
        </div>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="tf-btn tf-btn-primary"
            onClick={goNext}
            disabled={draftGate !== "ready"}
          >
            Weiter
          </button>
        ) : (
          <WizardSubmitButton
            disabled={draftGate !== "ready"}
            onValidate={() => {
              const err = validateStep(0) || validateStep(1) || validateStep(2);
              setStepError(err);
              return err;
            }}
          />
        )}
      </div>
      </div>
    </form>
  );
}
