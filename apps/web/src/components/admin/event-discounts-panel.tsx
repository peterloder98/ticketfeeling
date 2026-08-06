"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEuroFromCents } from "@/lib/money";

type CategoryOpt = { id: string; name: string; priceGrossCents: number };

type CampaignRow = {
  id: string;
  name: string;
  active: boolean;
  validFrom: string;
  validUntil: string;
  type: "percent" | "fixed";
  valueDisplay: number;
  channels: string;
  categoryIds: string[];
};

type AccessibilityState = {
  enabled: boolean;
  label: string;
  description: string;
  type: "percent" | "fixed";
  valueDisplay: number;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string) {
  const d = new Date(local);
  return d.toISOString();
}

export function EventDiscountsPanel({
  eventId,
  canWrite,
}: {
  eventId: string;
  canWrite: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [access, setAccess] = useState<AccessibilityState>({
    enabled: false,
    label: "Rollstuhl / Ermäßigt",
    description: "",
    type: "percent",
    valueDisplay: 10,
  });

  const [draft, setDraft] = useState<{
    campaignId?: string;
    name: string;
    active: boolean;
    validFrom: string;
    validUntil: string;
    type: "percent" | "fixed";
    valueDisplay: number;
    channels: "online" | "box_office" | "both";
    categoryIds: string[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/events/campaigns?eventId=${eventId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.code ?? "LOAD_FAILED");
      setCategories(data.categories ?? []);
      setCampaigns(
        (data.campaigns ?? []).map((c: CampaignRow) => ({
          ...c,
          type: c.type === "fixed" ? "fixed" : "percent",
        })),
      );
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
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAccessibility() {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
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
      if (!res.ok) throw new Error(data?.error?.code ?? "SAVE_FAILED");
      setOkMsg("Ermäßigung gespeichert.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function saveCampaign() {
    if (!canWrite || !draft) return;
    if (draft.categoryIds.length < 1) {
      setError("Bitte mindestens eine Preiskategorie wählen.");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/v1/admin/events/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          campaignId: draft.campaignId,
          name: draft.name,
          active: draft.active,
          validFrom: fromLocalInput(draft.validFrom),
          validUntil: fromLocalInput(draft.validUntil),
          type: draft.type,
          valueDisplay: draft.valueDisplay,
          channels: draft.channels,
          categoryIds: draft.categoryIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.code ?? "SAVE_FAILED");
      setDraft(null);
      setOkMsg("Preisaktion gespeichert.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function removeCampaign(campaignId: string) {
    if (!canWrite) return;
    if (!window.confirm("Diese Preisaktion wirklich löschen?")) return;
    setSaving(true);
    setError(null);
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

  function startNewCampaign() {
    const from = new Date();
    const until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    setDraft({
      name: "Frühbucher",
      active: true,
      validFrom: toLocalInput(from.toISOString()),
      validUntil: toLocalInput(until.toISOString()),
      type: "fixed",
      valueDisplay: 10,
      channels: "both",
      categoryIds: categories.map((c) => c.id),
    });
  }

  function editCampaign(c: CampaignRow) {
    setDraft({
      campaignId: c.id,
      name: c.name,
      active: c.active,
      validFrom: toLocalInput(c.validFrom),
      validUntil: toLocalInput(c.validUntil),
      type: c.type === "fixed" ? "fixed" : "percent",
      valueDisplay: c.valueDisplay,
      channels: (c.channels as "online" | "box_office" | "both") || "both",
      categoryIds: c.categoryIds,
    });
  }

  if (loading) {
    return (
      <section className="tf-card space-y-3 !p-6">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Rabatte & Aktionen</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">Laden…</p>
      </section>
    );
  }

  return (
    <section className="tf-card space-y-6 !p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Rabatte & Aktionen</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Preisaktionen ohne Gutscheincode (Frühbucher, Black Week, …). Mehrere möglich — nicht
          kombinierbar; bei Überlappung gilt der höhere Nachlass. Ermäßigung/Rollstuhl ist optional
          und kommt danach zusätzlich.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
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
                type="number"
                min={0}
                step={access.type === "percent" ? 1 : 0.01}
                className="tf-input mt-1 w-full"
                value={access.valueDisplay}
                disabled={!canWrite}
                onChange={(e) =>
                  setAccess((a) => ({ ...a, valueDisplay: Number(e.target.value) || 0 }))
                }
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
                  {c.type === "percent"
                    ? `${c.valueDisplay} %`
                    : `${formatEuroFromCents(Math.round(c.valueDisplay * 100))} günstiger`}
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
          <div className="space-y-3 rounded-xl border border-[var(--tf-teal)]/40 bg-[var(--tf-surface)] p-4">
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
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Von</span>
                <input
                  type="datetime-local"
                  className="tf-input mt-1 w-full"
                  value={draft.validFrom}
                  onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--tf-text-secondary)]">Bis</span>
                <input
                  type="datetime-local"
                  className="tf-input mt-1 w-full"
                  value={draft.validUntil}
                  onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                />
              </label>
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
                  type="number"
                  min={0}
                  step={draft.type === "percent" ? 1 : 0.01}
                  className="tf-input mt-1 w-full"
                  value={draft.valueDisplay}
                  onChange={(e) =>
                    setDraft({ ...draft, valueDisplay: Number(e.target.value) || 0 })
                  }
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
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Aktiv
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm text-[var(--tf-text-secondary)]">
                  Preiskategorien
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const on = draft.categoryIds.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                          on
                            ? "border-[var(--tf-teal)] bg-[var(--tf-teal)]/10 text-[var(--tf-navy)]"
                            : "border-[var(--tf-border)] text-[var(--tf-text-secondary)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
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
                        {cat.name} · {formatEuroFromCents(cat.priceGrossCents)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-10 text-sm"
                disabled={saving}
                onClick={() => void saveCampaign()}
              >
                Aktion speichern
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                onClick={() => setDraft(null)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
