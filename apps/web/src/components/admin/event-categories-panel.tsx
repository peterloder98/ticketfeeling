"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { formatEuroFromCents } from "@/lib/money";
import { DEFAULT_CATEGORY_COLORS, resolveCategoryColor } from "@/lib/seating/layout-config";
import { isPlanBackedTicketCategory } from "@/lib/seating/sync-category-capacity";

export type EventCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  priceGrossCents: number;
  capacity: number;
  maxPerOrder: number;
  categoryKind?: string;
  companionFree?: boolean;
  color?: string | null;
  freeSeating?: boolean;
  pools: { channel: string; soldQuantity: number; heldQuantity: number; capacity: number }[];
};

type Category = EventCategoryRow;

const KIND_OPTIONS = [
  { value: "standard", label: "Normalpreis / Kategorie" },
  { value: "vip", label: "VIP" },
  { value: "standing", label: "Stehplatz" },
  { value: "free_choice", label: "Sitzplatz (freie Platzwahl)" },
  { value: "wheelchair", label: "Rollstuhlfahrer" },
] as const;

/** Brand-first presets for saalplan coloring (Gold = VIP only). */
const COLOR_PRESETS = [
  "#14B8A6",
  "#0F2747",
  "#D6A642",
  ...DEFAULT_CATEGORY_COLORS.filter((c) => !["#14B8A6", "#0F2747", "#D6A642"].includes(c)),
];

function CategoryColorField({
  defaultColor,
  compact = false,
}: {
  defaultColor?: string | null;
  compact?: boolean;
}) {
  const initial = defaultColor?.trim() || "";
  const [color, setColor] = useState(initial);
  return (
    <label className={`grid gap-1 ${compact ? "" : "md:col-span-2"}`}>
      <span className={compact ? undefined : "text-xs text-[var(--tf-text-secondary)]"}>
        Farbe im Saalplan
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--tf-line)] bg-white p-1"
          value={/^#([0-9A-Fa-f]{6})$/.test(color) ? color : "#14B8A6"}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Farbe wählen"
        />
        <input
          name="color"
          className="tf-input max-w-[9rem] font-mono text-sm"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#14B8A6"
          pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
        />
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PRESETS.slice(0, 6).map((preset) => (
            <button
              key={preset}
              type="button"
              title={preset}
              className="h-7 w-7 rounded-full border border-[var(--tf-line)]"
              style={{ background: preset }}
              onClick={() => setColor(preset)}
            />
          ))}
          {color ? (
            <button
              type="button"
              className="text-xs text-[var(--tf-text-secondary)] underline"
              onClick={() => setColor("")}
            >
              Zurücksetzen
            </button>
          ) : null}
        </div>
      </div>
    </label>
  );
}

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

function ContingentField({
  capacity,
  planBacked,
  compact = false,
}: {
  capacity: number;
  planBacked: boolean;
  compact?: boolean;
}) {
  if (planBacked) {
    return (
      <label className="grid gap-1">
        <span className={compact ? undefined : "text-xs text-[var(--tf-text-secondary)]"}>
          Kontingent
        </span>
        <input
          name="capacity"
          type="number"
          className="tf-input bg-[rgba(15,39,71,0.04)]"
          value={capacity}
          readOnly
          aria-readonly="true"
        />
      </label>
    );
  }
  return (
    <label className="grid gap-1">
      <span className={compact ? undefined : "text-xs text-[var(--tf-text-secondary)]"}>
        Kontingent
      </span>
      <input
        name="capacity"
        type="number"
        className="tf-input"
        defaultValue={capacity}
        min={0}
        required
      />
    </label>
  );
}

function NewCategoryCapacityFields({ seatingEnabled }: { seatingEnabled: boolean }) {
  const [kind, setKind] = useState("standard");
  const planBacked =
    seatingEnabled &&
    isPlanBackedTicketCategory({
      freeSeating: kind === "standing" || kind === "free_choice",
      categoryKind: kind,
    });

  return (
    <>
      <label className="grid gap-1">
        <span>Art</span>
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
        <label className="flex items-center gap-2 text-xs text-[var(--tf-text-secondary)]">
          <input type="checkbox" name="companionFree" />
          Begleitung frei
        </label>
      ) : null}
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
        <ContingentField
          key={planBacked ? "auto" : "manual"}
          capacity={planBacked ? 0 : 100}
          planBacked={planBacked}
          compact
        />
      </div>
    </>
  );
}

export function EventCategoriesPanel({
  eventId,
  categories: initialCategories,
  onCategoriesChange,
  templates,
  canWrite,
  categoriesCreateLocked = false,
  seatingEnabled = false,
}: {
  eventId: string;
  categories: Category[];
  /** When set, category list is shared with Saalplan assignment above. */
  onCategoriesChange?: Dispatch<SetStateAction<Category[]>>;
  templates: Template[];
  canWrite: boolean;
  /** True after first sold/held ticket — no new categories allowed */
  categoriesCreateLocked?: boolean;
  /** When true, plan-backed categories get Kontingent from Saalplan seats. */
  seatingEnabled?: boolean;
}) {
  const router = useRouter();
  const [localCategories, setLocalCategories] = useState(initialCategories);
  const categories = onCategoriesChange ? initialCategories : localCategories;
  const setCategories: Dispatch<SetStateAction<Category[]>> = onCategoriesChange ?? setLocalCategories;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newFormKey, setNewFormKey] = useState(0);

  useEffect(() => {
    if (!onCategoriesChange) setLocalCategories(initialCategories);
  }, [initialCategories, onCategoriesChange]);

  async function saveCategory(form: HTMLFormElement, categoryId?: string) {
    if (!categoryId && categoriesCreateLocked) {
      setError("Nach erstem Ticketverkauf dürfen keine neuen Kategorien angelegt werden.");
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
          color: String(fd.get("color") ?? "").trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data?.error?.code === "CATEGORIES_LOCKED"
            ? "Nach erstem Ticketverkauf keine neuen Kategorien."
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
      // Soft refresh for KPIs / sales table — do not scroll.
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
    if (categoriesCreateLocked) {
      setError("Nach erstem Ticketverkauf dürfen keine neuen Kategorien angelegt werden.");
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
            ? "Nach erstem Ticketverkauf keine neuen Kategorien."
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
    <section id="kategorien" className="space-y-4 scroll-mt-24">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Preiskategorien</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          {categoriesCreateLocked
            ? "Erstes Ticket verkauft oder reserviert — bestehende Preise kannst du anpassen, neue Kategorien nicht mehr anlegen."
            : seatingEnabled
              ? "Preis, Name, Farbe und Art hier bearbeiten."
              : "Preis, Kontingent, Name und Art bearbeiten."}
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
          const planBacked =
            seatingEnabled &&
            isPlanBackedTicketCategory({
              freeSeating: cat.freeSeating,
              categoryKind: cat.categoryKind,
            });
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
                  <div className="flex items-center gap-2 md:col-span-4">
                    <span
                      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--tf-line)]"
                      style={{
                        background: resolveCategoryColor(cat.color, categories.indexOf(cat)),
                      }}
                      title="Farbe im Saalplan"
                    />
                    <span className="text-xs text-[var(--tf-text-secondary)]">
                      Farbe im Saalplan
                    </span>
                  </div>
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
                  <ContingentField capacity={cat.capacity} planBacked={planBacked} />
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
                  <CategoryColorField defaultColor={cat.color} />
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
                    {sold === 0 && held === 0 ? (
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
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--tf-line)]"
                    style={{
                      background: resolveCategoryColor(cat.color, categories.indexOf(cat)),
                    }}
                  />
                  <div>
                    <p className="font-semibold">{cat.name}</p>
                    <p className="text-sm text-[var(--tf-text-secondary)]">
                      {KIND_OPTIONS.find((k) => k.value === (cat.categoryKind ?? "standard"))
                        ?.label ?? "Kategorie"}
                      {cat.companionFree ? " · Begleitung frei" : ""}
                      {" · "}
                      {formatEuroFromCents(cat.priceGrossCents)} · {sold}/{cat.capacity} verkauft
                    </p>
                  </div>
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

      {canWrite && !categoriesCreateLocked ? (
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
            <CategoryColorField key={`color-${newFormKey}`} compact />
            <NewCategoryCapacityFields key={`cap-${newFormKey}`} seatingEnabled={seatingEnabled} />
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

      {canWrite && categoriesCreateLocked ? (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
          Neue Kategorien sind gesperrt, sobald das erste Ticket verkauft oder reserviert wurde.
          Bestehende Kategorien kannst du weiter bearbeiten.
        </p>
      ) : null}

      <p className="text-sm text-[var(--tf-text-secondary)]">
        Noch Plätze ohne Kategorie?{" "}
        <a href="#zuordnung" className="font-semibold text-[var(--tf-teal)] hover:underline">
          Zur Saalplan-Zuordnung
        </a>
      </p>
    </section>
  );
}
