"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatEuroFromCents } from "@/lib/money";

type Category = {
  id: string;
  name: string;
  description: string | null;
  priceGrossCents: number;
  capacity: number;
  maxPerOrder: number;
  categoryKind?: string;
  companionFree?: boolean;
  pools: { channel: string; soldQuantity: number; heldQuantity: number; capacity: number }[];
};

const KIND_OPTIONS = [
  { value: "standard", label: "Normalpreis / Kategorie" },
  { value: "vip", label: "VIP" },
  { value: "standing", label: "Stehplatz" },
  { value: "free_choice", label: "Sitzplatz (freie Platzwahl)" },
  { value: "wheelchair", label: "Rollstuhlfahrer" },
] as const;

type Template = {
  id: string;
  name: string;
  priceGrossCents: number;
  capacity: number;
};

function CategoryKindFields({
  defaultKind = "standard",
  defaultCompanionFree = false,
  compact = false,
}: {
  defaultKind?: string;
  defaultCompanionFree?: boolean;
  /** Single-column create form */
  compact?: boolean;
}) {
  const [kind, setKind] = useState(defaultKind);
  return (
    <>
      <label className={`grid gap-1 ${compact ? "" : "md:col-span-2"}`}>
        <span className={compact ? undefined : "text-xs text-[var(--tf-text-secondary)]"}>Art</span>
        <select
          name="categoryKind"
          className="tf-input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {kind === "wheelchair" ? (
        <label
          className={`flex items-center gap-2 text-xs text-[var(--tf-text-secondary)] ${
            compact ? "" : "md:col-span-2"
          }`}
        >
          <input type="checkbox" name="companionFree" defaultChecked={defaultCompanionFree} />
          Begleitung frei
        </label>
      ) : null}
    </>
  );
}

export function EventCategoriesPanel({
  eventId,
  categories: initialCategories,
  templates,
  canWrite,
  salesReleased = false,
}: {
  eventId: string;
  categories: Category[];
  templates: Template[];
  canWrite: boolean;
  /** True when event is freigegeben — no new categories allowed */
  salesReleased?: boolean;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newFormKey, setNewFormKey] = useState(0);

  async function saveCategory(form: HTMLFormElement, categoryId?: string) {
    if (!categoryId && salesReleased) {
      setError("Nach Verkaufsfreigabe dürfen keine neuen Kategorien angelegt werden.");
      return;
    }
    const fd = new FormData(form);
    setSavingId(categoryId ?? "new");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/events/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          categoryId,
          name: String(fd.get("name") ?? ""),
          description: String(fd.get("description") ?? "") || null,
          priceEuro: Number(String(fd.get("priceEuro") ?? "0").replace(",", ".")),
          capacity: Number(fd.get("capacity") ?? 0),
          maxPerOrder: Number(fd.get("maxPerOrder") ?? 10),
          categoryKind: String(fd.get("categoryKind") ?? "standard"),
          companionFree: fd.get("companionFree") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data?.error?.code === "CATEGORIES_LOCKED"
            ? "Nach Verkaufsfreigabe keine neuen Kategorien."
            : (data?.error?.code ?? "Speichern fehlgeschlagen"),
        );
        return;
      }
      const cat = data.category as Category;
      setCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === cat.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = cat;
          return next;
        }
        return [...prev, cat];
      });
      setMessage("Gespeichert.");
      if (!categoryId) {
        form.reset();
        setNewFormKey((k) => k + 1);
      }
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function removeCategory(categoryId: string) {
    if (!confirm("Kategorie wirklich löschen?")) return;
    setSavingId(categoryId);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/events/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.code ?? "Löschen fehlgeschlagen");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      setMessage("Kategorie gelöscht.");
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function applyTemplate(templateId: string) {
    if (salesReleased) {
      setError("Nach Verkaufsfreigabe dürfen keine neuen Kategorien angelegt werden.");
      return;
    }
    setSavingId("template");
    setError(null);
    try {
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return;
      const response = await fetch("/api/v1/admin/events/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name: tpl.name,
          priceEuro: tpl.priceGrossCents / 100,
          capacity: tpl.capacity,
          maxPerOrder: 10,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data?.error?.code === "CATEGORIES_LOCKED"
            ? "Nach Verkaufsfreigabe keine neuen Kategorien."
            : (data?.error?.code ?? "Vorlage fehlgeschlagen"),
        );
        return;
      }
      setCategories((prev) => [...prev, data.category as Category]);
      setMessage(`Vorlage „${tpl.name}“ übernommen.`);
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section id="kategorien" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Ticket-Kategorien</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          {salesReleased
            ? "Verkauf ist freigegeben — bestehende Kategorien kannst du anpassen, neue nicht mehr anlegen."
            : "Speichern bleibt auf dieser Stelle — die Seite springt nicht neu."}
        </p>
      </div>

      {message ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="space-y-3">
        {categories.map((cat) => {
          const sold = cat.pools.reduce((s, p) => s + p.soldQuantity, 0);
          const held = cat.pools.reduce((s, p) => s + p.heldQuantity, 0);
          return (
            <div key={cat.id} className="tf-card !p-4">
              {canWrite ? (
                <form
                  className="grid gap-3 text-sm md:grid-cols-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveCategory(e.currentTarget, cat.id);
                  }}
                >
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Name</span>
                    <input name="name" className="tf-input" defaultValue={cat.name} required />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Preis €</span>
                    <input
                      name="priceEuro"
                      type="number"
                      step="0.01"
                      className="tf-input"
                      defaultValue={(cat.priceGrossCents / 100).toFixed(2)}
                      required
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Kontingent</span>
                    <input
                      name="capacity"
                      type="number"
                      className="tf-input"
                      defaultValue={cat.capacity}
                      required
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Max./Best.</span>
                    <input
                      name="maxPerOrder"
                      type="number"
                      className="tf-input"
                      defaultValue={cat.maxPerOrder}
                      required
                    />
                  </label>
                  <CategoryKindFields
                    defaultKind={cat.categoryKind ?? "standard"}
                    defaultCompanionFree={Boolean(cat.companionFree)}
                  />
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Beschreibung</span>
                    <input
                      name="description"
                      className="tf-input"
                      defaultValue={cat.description ?? ""}
                    />
                  </label>
                  <p className="md:col-span-4 text-xs text-[var(--tf-text-secondary)]">
                    Verkauft {sold} · reserviert {held} · {formatEuroFromCents(cat.priceGrossCents)}
                  </p>
                  <div className="flex flex-wrap gap-2 md:col-span-4">
                    <button
                      type="submit"
                      className="tf-btn tf-btn-primary !min-h-10 text-sm"
                      disabled={savingId === cat.id}
                    >
                      {savingId === cat.id ? "Speichert…" : "Speichern"}
                    </button>
                    {sold === 0 && held === 0 && !salesReleased ? (
                      <button
                        type="button"
                        className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                        disabled={savingId === cat.id}
                        onClick={() => void removeCategory(cat.id)}
                      >
                        Löschen
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div>
                  <p className="font-semibold">{cat.name}</p>
                  <p className="text-sm text-[var(--tf-text-secondary)]">
                    {KIND_OPTIONS.find((k) => k.value === (cat.categoryKind ?? "standard"))?.label ??
                      "Kategorie"}
                    {cat.companionFree ? " · Begleitung frei" : ""}
                    {" · "}
                    {formatEuroFromCents(cat.priceGrossCents)} · {sold}/{cat.capacity} verkauft
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">
            Noch keine Kategorien für dieses Event.
          </p>
        ) : null}
      </div>

      {canWrite && !salesReleased ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            key={newFormKey}
            className="tf-card grid gap-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void saveCategory(e.currentTarget);
            }}
          >
            <h3 className="font-semibold text-[var(--tf-navy)]">Kategorie hinzufügen</h3>
            <label className="grid gap-1">
              <span>Name</span>
              <input
                name="name"
                className="tf-input"
                required
                placeholder="z. B. Kategorie 1, VIP, Stehplatz…"
              />
            </label>
            <CategoryKindFields key={newFormKey} compact />
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span>Preis €</span>
                <input
                  name="priceEuro"
                  type="number"
                  step="0.01"
                  className="tf-input"
                  defaultValue="45"
                  required
                />
              </label>
              <label className="grid gap-1">
                <span>Kontingent</span>
                <input
                  name="capacity"
                  type="number"
                  className="tf-input"
                  defaultValue="100"
                  required
                />
              </label>
            </div>
            <label className="grid gap-1">
              <span>Max. / Bestellung</span>
              <input name="maxPerOrder" type="number" className="tf-input" defaultValue="10" required />
            </label>
            <button type="submit" className="tf-btn tf-btn-primary w-fit" disabled={savingId === "new"}>
              {savingId === "new" ? "…" : "Anlegen"}
            </button>
          </form>

          {templates.length > 0 ? (
            <div className="tf-card grid gap-3 text-sm">
              <h3 className="font-semibold text-[var(--tf-navy)]">Aus Vorlage übernehmen</h3>
              <select
                className="tf-input"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) void applyTemplate(id);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  — wählen —
                </option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} · {formatEuroFromCents(tpl.priceGrossCents)} · {tpl.capacity} Plätze
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {canWrite && salesReleased ? (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
          Neue Kategorien sind gesperrt, solange das Event zum Verkauf freigegeben ist. Zum Ändern
          der Struktur den Status wieder auf Entwurf setzen (nur sinnvoll, wenn noch keine Tickets
          verkauft wurden).
        </p>
      ) : null}
    </section>
  );
}
