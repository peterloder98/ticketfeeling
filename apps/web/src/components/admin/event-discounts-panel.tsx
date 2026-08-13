"use client";

import { useCallback, useEffect, useState } from "react";
import { SmartDateTimeInput } from "@/components/admin/smart-datetime-input";
import { parseDatetimeLocalBerlin, toDatetimeLocalValue } from "@/lib/admin/event-form";
import { clampCampaignToEventEnd } from "@/lib/commerce/schedule-change";
import { formatDeDateTime } from "@/lib/datetime-de";
import { formatEuroFromCents } from "@/lib/money";

type CategoryOpt = { id: string; name: string; priceGrossCents: number };

type TourSibling = {
  id: string;
  name: string;
  eventStartsAt: string | null;
  locationName: string | null;
  city: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  active: boolean;
  validFrom: string;
  validUntil: string;
  type: "percent" | "fixed";
  valueDisplay: number;
  channels: string;
  applyMode: "unit" | "order";
  minQuantity: number;
  badgeLabel: string | null;
  badgeDisclaimer: string | null;
  categoryIds: string[];
  campaignGroupId?: string | null;
  matchedSiblingEventIds?: string[];
};

type AccessibilityState = {
  enabled: boolean;
  label: string;
  description: string;
  type: "percent" | "fixed";
  valueDisplay: number;
};

type CampaignDraft = {
  campaignId?: string;
  name: string;
  active: boolean;
  validFrom: string;
  validUntil: string;
  type: "percent" | "fixed";
  valueDisplay: number;
  channels: "online" | "box_office" | "both";
  applyMode: "unit" | "order";
  minQuantity: number;
  badgeLabel: string;
  badgeDisclaimer: string;
  categoryIds: string[];
};

const CAMPAIGN_END_CLAMP_MSG =
  "Aktionsende lag nach dem Eventende und wurde auf das Eventende gesetzt.";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toDatetimeLocalValue(d);
}

function fromLocalInput(local: string) {
  const d = parseDatetimeLocalBerlin(local);
  if (!d) throw new Error("Bitte gültige Daten für Von und Bis angeben.");
  return d.toISOString();
}

function siblingLabel(s: TourSibling): string {
  const when = s.eventStartsAt
    ? formatDeDateTime(new Date(s.eventStartsAt), {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const place = [s.locationName, s.city].filter(Boolean).join(", ") || null;
  if (when && place) return `${when} · ${place}`;
  if (when) return when;
  if (place) return place;
  return s.name;
}

export function EventDiscountsPanel({
  eventId,
  canWrite,
  eventEndsAt: eventEndsAtProp,
  tourId: tourIdProp = null,
  initialCategories,
  initialTourSiblings,
  /**
   * `tour` = Tour admin (no anchored “dieser Termin”).
   * `event` = Event admin (current date always included + optional siblings).
   */
  context = "event",
  /** When true (e.g. Tour admin), new Aktionen default to all tour dates. */
  defaultSelectAllTour = false,
  heading = "Rabatte & Aktionen",
}: {
  eventId: string;
  canWrite: boolean;
  /** ISO or null — preferred from server; API also returns it on load. */
  eventEndsAt?: string | null;
  /** When set, Tour-Termine scope UI is always shown (even before API returns). */
  tourId?: string | null;
  initialCategories?: CategoryOpt[];
  initialTourSiblings?: TourSibling[];
  context?: "event" | "tour";
  defaultSelectAllTour?: boolean;
  heading?: string;
}) {
  const isTourContext = context === "tour";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOpt[]>(initialCategories ?? []);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [tourSiblings, setTourSiblings] = useState<TourSibling[]>(initialTourSiblings ?? []);
  const [tourId, setTourId] = useState<string | null>(tourIdProp ?? null);
  const [eventEndsAt, setEventEndsAt] = useState<string | null>(eventEndsAtProp ?? null);
  const [access, setAccess] = useState<AccessibilityState>({
    enabled: false,
    label: "Rollstuhl / Ermäßigt",
    description: "",
    type: "percent",
    valueDisplay: 10,
  });

  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [tourScopeMode, setTourScopeMode] = useState<"this" | "multi">("this");
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<string[]>([]);
  const showTourScope = Boolean(tourId) || tourSiblings.length > 0 || isTourContext;

  const eventBoundDate = (() => {
    if (!eventEndsAt) return null;
    const d = new Date(eventEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  function clampDraftDates(
    validFromLocal: string,
    validUntilLocal: string,
  ): { validFrom: string; validUntil: string; clamped: boolean } {
    if (!eventBoundDate) {
      return { validFrom: validFromLocal, validUntil: validUntilLocal, clamped: false };
    }
    try {
      const from = parseDatetimeLocalBerlin(validFromLocal);
      const until = parseDatetimeLocalBerlin(validUntilLocal);
      if (!from || !until) {
        return { validFrom: validFromLocal, validUntil: validUntilLocal, clamped: false };
      }
      const next = clampCampaignToEventEnd({
        validFrom: from,
        validUntil: until,
        eventEndsAt: eventBoundDate,
      });
      if (!next.changed) {
        return { validFrom: validFromLocal, validUntil: validUntilLocal, clamped: false };
      }
      return {
        validFrom: toLocalInput(next.validFrom.toISOString()),
        validUntil: toLocalInput(next.validUntil.toISOString()),
        clamped: true,
      };
    } catch {
      return { validFrom: validFromLocal, validUntil: validUntilLocal, clamped: false };
    }
  }

  function updateDraftUntil(validUntil: string) {
    if (!draft) return;
    const clamped = clampDraftDates(draft.validFrom, validUntil);
    setDraft({
      ...draft,
      validFrom: clamped.validFrom,
      validUntil: clamped.validUntil,
    });
    setWarnMsg(clamped.clamped ? CAMPAIGN_END_CLAMP_MSG : null);
  }

  function updateDraftFrom(validFrom: string) {
    if (!draft) return;
    const clamped = clampDraftDates(validFrom, draft.validUntil);
    setDraft({
      ...draft,
      validFrom: clamped.validFrom,
      validUntil: clamped.validUntil,
    });
    setWarnMsg(clamped.clamped ? CAMPAIGN_END_CLAMP_MSG : null);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/events/campaigns?eventId=${eventId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.code ?? "LOAD_FAILED");
      setCategories(
        Array.isArray(data.categories) && data.categories.length > 0
          ? data.categories
          : (initialCategories ?? []),
      );
      setCampaigns(
        (data.campaigns ?? []).map((c: CampaignRow) => ({
          ...c,
          type: c.type === "fixed" ? "fixed" : "percent",
          applyMode: c.applyMode === "order" ? "order" : "unit",
          minQuantity: Math.max(1, c.minQuantity ?? 1),
          badgeLabel: c.badgeLabel ?? null,
          badgeDisclaimer: c.badgeDisclaimer ?? null,
          campaignGroupId: c.campaignGroupId ?? null,
          matchedSiblingEventIds: Array.isArray(c.matchedSiblingEventIds)
            ? c.matchedSiblingEventIds
            : [],
        })),
      );
      if (Array.isArray(data.healNotes) && data.healNotes.length > 0) {
        setWarnMsg(data.healNotes.join(" "));
      }
      const siblings: TourSibling[] = Array.isArray(data.tourSiblings)
        ? (data.tourSiblings as TourSibling[])
        : [];
      if (isTourContext && (initialTourSiblings?.length ?? 0) > 0) {
        // Tour admin passes the full date list (incl. category template event).
        const byId = new Map(siblings.map((s) => [s.id, s] as const));
        setTourSiblings(
          (initialTourSiblings ?? []).map((s) => byId.get(s.id) ?? s),
        );
      } else {
        setTourSiblings(siblings.length > 0 ? siblings : (initialTourSiblings ?? []));
      }
      setTourId(
        typeof data.tourId === "string" && data.tourId
          ? data.tourId
          : (tourIdProp ?? null),
      );
      if (data.eventEndsAt || data.eventStartsAt) {
        setEventEndsAt(data.eventEndsAt ?? data.eventStartsAt ?? null);
      } else if (eventEndsAtProp) {
        setEventEndsAt(eventEndsAtProp);
      }
      setAccess({
        enabled: Boolean(data.accessibility?.enabled),
        label: data.accessibility?.label || "Rollstuhl / Ermäßigt",
        description: data.accessibility?.description || "",
        type: data.accessibility?.type === "fixed" ? "fixed" : "percent",
        valueDisplay: Number(data.accessibility?.valueDisplay ?? 10),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [
    eventId,
    eventEndsAtProp,
    initialCategories,
    initialTourSiblings,
    isTourContext,
    tourIdProp,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAccessibility() {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    setWarnMsg(null);
    try {
      const res = await fetch("/api/v1/admin/events/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          enabled: access.enabled,
          label: access.label,
          description: access.description || null,
          type: access.type,
          valueDisplay: access.valueDisplay,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error?.message ||
            (data?.error?.code === "SERVER_ERROR"
              ? "Ermäßigung konnte nicht gespeichert werden."
              : data?.error?.code) ||
            "Speichern fehlgeschlagen",
        );
      }
      setOkMsg("Ermäßigung gespeichert.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function persistCampaign(
    nextDraft: CampaignDraft,
    opts: { alsoEventIds?: string[]; targetEventIds?: string[] },
  ) {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    setWarnMsg(null);
    try {
      const clamped = clampDraftDates(nextDraft.validFrom, nextDraft.validUntil);
      const clampedDraft = {
        ...nextDraft,
        validFrom: clamped.validFrom,
        validUntil: clamped.validUntil,
      };
      if (clamped.clamped) {
        setDraft(clampedDraft);
        setWarnMsg(CAMPAIGN_END_CLAMP_MSG);
      }

      const res = await fetch("/api/v1/admin/events/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          campaignId: clampedDraft.campaignId,
          name: clampedDraft.name,
          active: clampedDraft.active,
          validFrom: fromLocalInput(clampedDraft.validFrom),
          validUntil: fromLocalInput(clampedDraft.validUntil),
          type: clampedDraft.type,
          valueDisplay: clampedDraft.valueDisplay,
          channels: clampedDraft.channels,
          applyMode: clampedDraft.applyMode,
          minQuantity:
            clampedDraft.applyMode === "unit" ? 1 : clampedDraft.minQuantity,
          badgeLabel: clampedDraft.badgeLabel.trim() || null,
          badgeDisclaimer: clampedDraft.badgeDisclaimer.trim() || null,
          categoryIds: clampedDraft.categoryIds,
          alsoEventIds: opts.alsoEventIds ?? [],
          ...(opts.targetEventIds ? { targetEventIds: opts.targetEventIds } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = String(data?.error?.code ?? "");
        const friendly =
          data?.error?.message ||
          (code === "SCHEMA_OUTDATED"
            ? "Datenbank-Schema für Preisaktionen ist noch nicht aktuell. Bitte erneut speichern."
            : code === "SIBLING_CATEGORY_MISMATCH"
              ? "Bei einem gewählten Termin fehlen passende Preiskategorien. Bitte Kategorienamen angleichen."
            : code === "SERVER_ERROR"
              ? "Preisaktion konnte nicht gespeichert werden. Bitte erneut versuchen."
              : code === "VALIDATION"
                ? "Bitte Eingaben prüfen."
                : code || "Speichern fehlgeschlagen");
        throw new Error(friendly);
      }
      setDraft(null);
      setTourScopeMode("this");
      setSelectedSiblingIds([]);
      const warnParts: string[] = [];
      if (data.clampedToEventEnd || clamped.clamped) {
        warnParts.push(data.message || CAMPAIGN_END_CLAMP_MSG);
      }
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        warnParts.push(...data.warnings);
      }
      setWarnMsg(warnParts.length > 0 ? warnParts.join(" ") : null);
      const applied = Math.max(0, Number(data.appliedCount ?? 1));
      const extra = Math.max(0, applied - 1);
      const removed = Math.max(0, Number(data.removedCount ?? 0));
      setOkMsg(
        isTourContext
          ? applied === 1
            ? "Preisaktion für einen Termin gespeichert."
            : `Preisaktion für ${applied} Termine gespeichert.`
          : extra > 0
            ? extra === 1
              ? "Preisaktion gespeichert und auf einen weiteren Termin übernommen."
              : `Preisaktion gespeichert und auf ${extra} weitere Termine übernommen.`
            : removed > 0
              ? removed === 1
                ? "Preisaktion gespeichert und von einem weiteren Termin entfernt."
                : `Preisaktion gespeichert und von ${removed} weiteren Terminen entfernt.`
              : "Preisaktion gespeichert.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  /** Event context: sibling IDs only (current event is always applied). */
  function resolveAlsoEventIds(): string[] | null {
    if (tourSiblings.length < 1) return [];
    const also = selectedSiblingIds.filter((id) => id !== eventId);
    if (tourScopeMode === "this" || also.length < 1) return [];
    return also;
  }

  /** Tour context: full explicit target set (no phantom current event). */
  function resolveTourTargetEventIds(): string[] | null {
    const selected = selectedSiblingIds.filter((id) =>
      tourSiblings.some((s) => s.id === id),
    );
    if (selected.length < 1) {
      setError("Bitte mindestens einen Termin wählen.");
      return null;
    }
    return selected;
  }

  const allSiblingIds = tourSiblings.map((s) => s.id);
  const allTourSelected =
    allSiblingIds.length > 0 && allSiblingIds.every((id) => selectedSiblingIds.includes(id));

  function setAllTourDates(checked: boolean) {
    if (checked) {
      setTourScopeMode("multi");
      setSelectedSiblingIds(allSiblingIds);
    } else if (isTourContext) {
      setTourScopeMode("multi");
      setSelectedSiblingIds([]);
    } else {
      setTourScopeMode("this");
      setSelectedSiblingIds([]);
    }
    setError(null);
  }

  function requestSaveCampaign() {
    if (!canWrite || !draft) return;
    if (draft.categoryIds.length < 1) {
      setError("Bitte mindestens eine Preiskategorie wählen.");
      return;
    }
    if (!draft.name.trim()) {
      setError("Bitte einen Namen für die Aktion angeben.");
      return;
    }
    setError(null);
    if (isTourContext && showTourScope) {
      const targets = resolveTourTargetEventIds();
      if (targets === null) return;
      void persistCampaign(draft, { targetEventIds: targets });
      return;
    }
    const also = resolveAlsoEventIds();
    if (also === null) return;
    void persistCampaign(draft, { alsoEventIds: also });
  }

  async function removeCampaign(campaignId: string) {
    if (!canWrite) return;
    if (!window.confirm("Diese Preisaktion wirklich löschen?")) return;
    setSaving(true);
    setError(null);
    setWarnMsg(null);
    try {
      const res = await fetch(
        `/api/v1/admin/events/campaigns?eventId=${eventId}&campaignId=${campaignId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.code ?? "DELETE_FAILED");
      setOkMsg("Preisaktion gelöscht.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function resetTourScope() {
    setTourScopeMode("this");
    setSelectedSiblingIds([]);
  }

  function startNewCampaign() {
    const from = new Date();
    let until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    let warn: string | null = null;
    if (eventBoundDate && until.getTime() > eventBoundDate.getTime()) {
      until = new Date(eventBoundDate.getTime());
      warn = CAMPAIGN_END_CLAMP_MSG;
    }
    setWarnMsg(warn);
    if ((defaultSelectAllTour || isTourContext) && tourSiblings.length > 0) {
      setTourScopeMode("multi");
      setSelectedSiblingIds(tourSiblings.map((s) => s.id));
    } else {
      resetTourScope();
    }
    setDraft({
      name: "Frühbucher",
      active: true,
      validFrom: toLocalInput(from.toISOString()),
      validUntil: toLocalInput(until.toISOString()),
      type: "fixed",
      valueDisplay: 10,
      channels: "both",
      applyMode: "unit",
      minQuantity: 1,
      badgeLabel: "",
      badgeDisclaimer: "",
      categoryIds: categories.map((c) => c.id),
    });
  }

  const allCategoryIds = categories.map((c) => c.id);
  const allCategoriesSelected =
    allCategoryIds.length > 0 && allCategoryIds.every((id) => draft?.categoryIds.includes(id));

  function setAllCategories(checked: boolean) {
    if (!draft) return;
    setDraft({
      ...draft,
      categoryIds: checked ? allCategoryIds : [],
    });
  }

  function editCampaign(c: CampaignRow) {
    setWarnMsg(null);
    const linked = (c.matchedSiblingEventIds ?? []).filter((id) =>
      tourSiblings.some((s) => s.id === id),
    );
    if (isTourContext) {
      // Include the template event plus linked siblings — all equal checkboxes.
      const onTour = tourSiblings.some((s) => s.id === eventId);
      const selected = [
        ...new Set([...(onTour ? [eventId] : []), ...linked]),
      ].filter((id) => tourSiblings.some((s) => s.id === id));
      setTourScopeMode("multi");
      setSelectedSiblingIds(selected.length > 0 ? selected : linked);
    } else if (linked.length > 0) {
      setTourScopeMode("multi");
      setSelectedSiblingIds(linked);
    } else {
      resetTourScope();
    }
    setDraft({
      campaignId: c.id,
      name: c.name,
      active: c.active,
      validFrom: toLocalInput(c.validFrom),
      validUntil: toLocalInput(c.validUntil),
      type: c.type === "fixed" ? "fixed" : "percent",
      valueDisplay: c.valueDisplay,
      channels: (c.channels as "online" | "box_office" | "both") || "both",
      applyMode: c.applyMode === "order" ? "order" : "unit",
      minQuantity: Math.max(1, c.minQuantity ?? 1),
      badgeLabel: c.badgeLabel ?? "",
      badgeDisclaimer: c.badgeDisclaimer ?? "",
      categoryIds: c.categoryIds,
    });
  }

  if (loading) {
    return (
      <section id="preisaktionen" className="tf-card space-y-3 !p-6 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">{heading}</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">Laden…</p>
      </section>
    );
  }

  return (
    <section id="preisaktionen" className="tf-card space-y-6 !p-6 scroll-mt-24">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">{heading}</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Preisaktionen ohne Gutscheincode (Frühbucher, Black Week, …). Beim Anlegen wählst du
          Preiskategorien und — bei Touren — weitere Termine. Mehrere Aktionen möglich, nicht
          kombinierbar; bei Überlappung gilt der höhere Nachlass. Ermäßigung/Rollstuhl ist optional
          und kommt danach zusätzlich.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {warnMsg ? (
        <p className="text-sm text-[var(--tf-navy)]">
          <span className="font-medium">Hinweis:</span> {warnMsg}
        </p>
      ) : null}
      {okMsg ? <p className="text-sm text-[var(--tf-teal)]">{okMsg}</p> : null}

      <div className="space-y-3 rounded-xl border border-[var(--tf-border)] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
          Ermäßigung / Rollstuhl
        </h3>
        <label className="flex items-center gap-2 text-sm text-[var(--tf-navy)]">
          <input
            type="checkbox"
            checked={access.enabled}
            disabled={!canWrite}
            onChange={(e) => setAccess((a) => ({ ...a, enabled: e.target.checked }))}
          />
          Optional anbieten (Käufer wählt selbst)
        </label>
        {access.enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--tf-text-secondary)]">Bezeichnung</span>
              <input
                className="tf-input mt-1 w-full"
                value={access.label}
                disabled={!canWrite}
                onChange={(e) => setAccess((a) => ({ ...a, label: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--tf-text-secondary)]">Art</span>
              <select
                className="tf-input mt-1 w-full"
                value={access.type}
                disabled={!canWrite}
                onChange={(e) =>
                  setAccess((a) => ({
                    ...a,
                    type: e.target.value === "fixed" ? "fixed" : "percent",
                  }))
                }
              >
                <option value="percent">Prozent vom Preis</option>
                <option value="fixed">Fixbetrag günstiger (€)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--tf-text-secondary)]">
                {access.type === "percent" ? "Nachlass %" : "Nachlass €"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="tf-input mt-1 w-full"
                value={String(access.valueDisplay)}
                disabled={!canWrite}
                onChange={(e) => {
                  const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                  const n = Number(raw);
                  setAccess((a) => ({
                    ...a,
                    valueDisplay: Number.isFinite(n) ? n : 0,
                  }));
                }}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">
                Hinweis in den Event-Infos
              </span>
              <textarea
                className="tf-input mt-1 min-h-[80px] w-full"
                value={access.description}
                disabled={!canWrite}
                placeholder="z. B. Ermäßigung für Rollstuhlfahrerinnen und -fahrer — bitte beim Kauf auswählen."
                onChange={(e) => setAccess((a) => ({ ...a, description: e.target.value }))}
              />
            </label>
          </div>
        ) : null}
        {canWrite ? (
          <button
            type="button"
            className="tf-btn tf-btn-secondary !min-h-10 text-sm"
            disabled={saving}
            onClick={() => void saveAccessibility()}
          >
            Ermäßigung speichern
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
            Preisaktionen
          </h3>
          {canWrite ? (
            <button
              type="button"
              className="tf-btn tf-btn-secondary !min-h-9 text-sm"
              onClick={startNewCampaign}
            >
              + Aktion
            </button>
          ) : null}
        </div>

        {campaigns.length === 0 && !draft ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Noch keine Preisaktion — z. B. Frühbucher oder Black Week anlegen.
          </p>
        ) : null}

        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--tf-border)] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--tf-navy)]">
                  {c.name}
                  {!c.active ? (
                    <span className="ml-2 text-[var(--tf-text-secondary)]">(inaktiv)</span>
                  ) : null}
                </p>
                <p className="text-[var(--tf-text-secondary)]">
                  {c.applyMode === "order"
                    ? c.type === "percent"
                      ? `${c.valueDisplay} % einmalig ab ${c.minQuantity} Tickets`
                      : `${formatEuroFromCents(Math.round(c.valueDisplay * 100))} einmalig ab ${c.minQuantity} Tickets`
                    : c.type === "percent"
                      ? `${c.valueDisplay} %`
                      : `${formatEuroFromCents(Math.round(c.valueDisplay * 100))} günstiger`}
                  {c.badgeLabel ? ` · „${c.badgeLabel}“` : ""}
                  {" · "}
                  {new Date(c.validFrom).toLocaleString("de-DE")} –{" "}
                  {new Date(c.validUntil).toLocaleString("de-DE")}
                </p>
              </div>
              {canWrite ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="tf-btn tf-btn-secondary !min-h-8 text-xs"
                    onClick={() => editCampaign(c)}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="tf-btn tf-btn-secondary !min-h-8 text-xs"
                    onClick={() => void removeCampaign(c.id)}
                  >
                    Löschen
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {draft ? (
          <form
            className="space-y-3 rounded-xl border border-[var(--tf-teal)]/40 bg-[var(--tf-surface)] p-4"
            noValidate
            onInvalid={(e) => {
              // Never show native „The string did not match the expected pattern.“
              e.preventDefault();
            }}
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestSaveCampaign();
            }}
          >
            <p className="text-sm font-semibold text-[var(--tf-navy)]">
              {draft.campaignId ? "Aktion bearbeiten" : "Neue Aktion"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--tf-text-secondary)]">Name</span>
                <input
                  className="tf-input mt-1 w-full"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>

              <div className="sm:col-span-2 space-y-3 rounded-xl border-2 border-[var(--tf-teal)]/35 bg-[#f0fdfa] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--tf-navy)]">
                    1. Preiskategorien
                  </p>
                  <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                    Für welche Ticketkategorien gilt diese Preisaktion?
                  </p>
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-[var(--danger)]">
                    Keine Preiskategorien an diesem Termin — bitte zuerst unter Saalplan /
                    Preiskategorien anlegen.
                  </p>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--tf-teal)]/40 bg-white p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--tf-teal)]"
                        checked={allCategoriesSelected}
                        onChange={(e) => setAllCategories(e.target.checked)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-[var(--tf-navy)]">
                          Alle Kategorien
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                          {categories.length} Preiskategorie
                          {categories.length === 1 ? "" : "n"} an diesem Termin
                        </span>
                      </span>
                    </label>
                    <div className="space-y-2 rounded-xl border border-[var(--tf-line)] bg-white p-3">
                      {categories.map((cat) => {
                        const on = draft.categoryIds.includes(cat.id);
                        return (
                          <label
                            key={cat.id}
                            className="flex cursor-pointer items-start gap-3 text-sm text-[var(--tf-navy)]"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 accent-[var(--tf-teal)]"
                              checked={on}
                              onChange={() => {
                                setDraft({
                                  ...draft,
                                  categoryIds: on
                                    ? draft.categoryIds.filter((id) => id !== cat.id)
                                    : [...draft.categoryIds, cat.id],
                                });
                              }}
                            />
                            <span>
                              <span className="font-medium">{cat.name}</span>
                              <span className="text-[var(--tf-text-secondary)]">
                                {" "}
                                · {formatEuroFromCents(cat.priceGrossCents)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {showTourScope ? (
                <div className="sm:col-span-2 space-y-3 rounded-xl border-2 border-[var(--tf-navy)]/20 bg-[#f8fafc] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--tf-navy)]">
                      2. Tour-Termine
                    </p>
                    <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                      {isTourContext
                        ? "Für welche Termine gilt die Aktion?"
                        : draft.campaignId
                          ? "Geltungsbereich dieser Aktion. Abgewählte Termine verlieren die passende Preisaktion."
                          : "Gilt immer für diesen Termin. Weitere Tour-Termine optional mit denselben Einstellungen übernehmen."}
                    </p>
                  </div>
                  {tourSiblings.length < 1 ? (
                    <p className="text-sm text-[var(--tf-text-secondary)]">
                      {isTourContext
                        ? "Noch keine Termine in dieser Tour."
                        : "Diese Tour hat noch keine weiteren Termine — Aktion gilt nur hier."}
                    </p>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--tf-teal)]/40 bg-white p-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[var(--tf-teal)]"
                          checked={allTourSelected}
                          onChange={(e) => setAllTourDates(e.target.checked)}
                        />
                        <span>
                          <span className="block text-sm font-medium text-[var(--tf-navy)]">
                            Alle Termine der Tour
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                            {isTourContext
                              ? `${tourSiblings.length} Termine auswählen oder abwählen`
                              : `Dieser Termin plus alle ${tourSiblings.length} weiteren`}
                          </span>
                        </span>
                      </label>
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--tf-line)] bg-white p-3">
                        {isTourContext ? null : (
                          <>
                            <label className="flex items-start gap-3 text-sm text-[var(--tf-navy)] opacity-80">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-[var(--tf-teal)]"
                                checked
                                disabled
                                readOnly
                              />
                              <span>
                                <span className="font-medium">Dieser Termin</span>
                                <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                                  Immer enthalten
                                </span>
                              </span>
                            </label>
                            <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                              Weitere Termine
                            </p>
                          </>
                        )}
                        {tourSiblings.map((s) => {
                          const checked = selectedSiblingIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-start gap-3 text-sm text-[var(--tf-navy)]"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-[var(--tf-teal)]"
                                checked={checked}
                                onChange={() => {
                                  setSelectedSiblingIds((prev) => {
                                    const next = checked
                                      ? prev.filter((id) => id !== s.id)
                                      : [...prev, s.id];
                                    if (isTourContext) {
                                      setTourScopeMode("multi");
                                    } else {
                                      setTourScopeMode(next.length > 0 ? "multi" : "this");
                                    }
                                    return next;
                                  });
                                  setError(null);
                                }}
                              />
                              <span>{siblingLabel(s)}</span>
                            </label>
                          );
                        })}
                        {isTourContext && selectedSiblingIds.length === 0 ? (
                          <p className="text-xs text-[var(--tf-text-secondary)]">
                            Mindestens einen Termin wählen.
                          </p>
                        ) : null}
                        {!isTourContext && selectedSiblingIds.length === 0 ? (
                          <p className="text-xs text-[var(--tf-text-secondary)]">
                            Keine weiteren Termine gewählt — Aktion nur für diesen Termin
                            {draft.campaignId
                              ? " (beim Speichern von anderen Tour-Terminen entfernt, falls verknüpft)."
                              : "."}
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              <div className="sm:col-span-1">
                <SmartDateTimeInput
                  label="Aktionsbeginn"
                  value={draft.validFrom}
                  onChange={updateDraftFrom}
                />
              </div>
              <div className="sm:col-span-1">
                <SmartDateTimeInput
                  label="Aktionsende"
                  value={draft.validUntil}
                  onChange={updateDraftUntil}
                />
              </div>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Art</span>
                <select
                  className="tf-input mt-1 w-full"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      type: e.target.value === "fixed" ? "fixed" : "percent",
                    })
                  }
                >
                  <option value="percent">Prozent</option>
                  <option value="fixed">Euro günstiger</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">
                  {draft.type === "percent" ? "Nachlass %" : "Nachlass €"}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tf-input mt-1 w-full"
                  value={String(draft.valueDisplay)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                    const n = Number(raw);
                    setDraft({
                      ...draft,
                      valueDisplay: Number.isFinite(n) ? n : 0,
                    });
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Anwendung</span>
                <select
                  className="tf-input mt-1 w-full"
                  value={draft.applyMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      applyMode: e.target.value === "order" ? "order" : "unit",
                      minQuantity:
                        e.target.value === "order"
                          ? draft.minQuantity < 2
                            ? 2
                            : draft.minQuantity
                          : 1,
                    })
                  }
                >
                  <option value="unit">Pro Ticket (Aktionspreis)</option>
                  <option value="order">Einmalig ab Mindestmenge</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Mindestmenge</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="tf-input mt-1 w-full"
                  value={String(draft.minQuantity)}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value.replace(/\D/g, "") || "1"));
                    setDraft({
                      ...draft,
                      minQuantity: Math.min(99, Math.max(1, n || 1)),
                    });
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Kanäle</span>
                <select
                  className="tf-input mt-1 w-full"
                  value={draft.channels}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      channels: e.target.value as "online" | "box_office" | "both",
                    })
                  }
                >
                  <option value="both">Shop & Tageskasse</option>
                  <option value="online">Nur Shop</option>
                  <option value="box_office">Nur Tageskasse</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--tf-text-secondary)]">
                  Badge-Text (z. B. „10 € sparen“)
                </span>
                <input
                  className="tf-input mt-1 w-full"
                  value={draft.badgeLabel}
                  onChange={(e) => setDraft({ ...draft, badgeLabel: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--tf-text-secondary)]">
                  Hinweis klein (z. B. „* beim Kauf von 2 Tickets“)
                </span>
                <input
                  className="tf-input mt-1 w-full"
                  value={draft.badgeDisclaimer}
                  onChange={(e) => setDraft({ ...draft, badgeDisclaimer: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Aktiv
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                disabled={saving}
                formNoValidate
                onClick={() => requestSaveCampaign()}
              >
                Aktion speichern
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                onClick={() => {
                  setDraft(null);
                  setWarnMsg(null);
                  resetTourScope();
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
