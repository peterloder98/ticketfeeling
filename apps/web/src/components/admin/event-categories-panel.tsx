"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { formatEuroFromCents } from "@/lib/money";
import { DEFAULT_CATEGORY_COLORS, resolveCategoryColor } from "@/lib/seating/layout-config";
import { isPlanBackedTicketCategory } from "@/lib/seating/sync-category-capacity";
import { toDatetimeLocalValue } from "@/lib/admin/event-form";
import { SmartDateTimeField } from "@/components/admin/smart-datetime-input";

export type EventCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  extrasShortText?: string | null;
  priceGrossCents: number;
  capacity: number;
  maxPerOrder: number;
  categoryKind?: string;
  companionFree?: boolean;
  color?: string | null;
  freeSeating?: boolean;
  doorsOpenAt?: string | Date | null;
  doorsNote?: string | null;
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

function CategoryColorSwatches({
  defaultColor,
}: {
  defaultColor?: string | null;
}) {
  const initial = defaultColor?.trim() || "";
  const [color, setColor] = useState(initial);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="color" value={color} />
      <input
        type="color"
        className="h-7 w-8 cursor-pointer rounded border border-[var(--tf-line)] bg-white p-0.5"
        value={/^#([0-9A-Fa-f]{6})$/.test(color) ? color : "#14B8A6"}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Farbe im Saalplan"
        title="Farbe im Saalplan"
      />
      {COLOR_PRESETS.slice(0, 6).map((preset) => (
        <button
          key={preset}
          type="button"
          title={preset}
          className={`h-5 w-5 rounded-full border ${
            color === preset ? "border-[var(--tf-navy)] ring-1 ring-[var(--tf-teal)]" : "border-[var(--tf-line)]"
          }`}
          style={{ background: preset }}
          onClick={() => setColor(preset)}
        />
      ))}
    </div>
  );
}

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
      <span className={compact ? "text-xs text-[var(--tf-text-secondary)]" : "text-xs text-[var(--tf-text-secondary)]"}>
        Farbe
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          className="h-9 w-11 cursor-pointer rounded-lg border border-[var(--tf-line)] bg-white p-1"
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
          title="Hex-Farbe, z. B. #14B8A6 — leer = Standard"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          // Never use HTML pattern — browsers show „The string did not match the expected pattern.“
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

function CategoryKindFields({
  defaultKind = "standard",
  defaultCompanionFree = false,
  defaultDoorsOpenAt = null,
  defaultDoorsNote = null,
  defaultExtrasShortText = null,
  showDoors = true,
  compact = false,
}: {
  defaultKind?: string;
  defaultCompanionFree?: boolean;
  defaultDoorsOpenAt?: string | Date | null;
  defaultDoorsNote?: string | null;
  defaultExtrasShortText?: string | null;
  showDoors?: boolean;
  compact?: boolean;
}) {
  const [kind, setKind] = useState(defaultKind);
  const isVip = kind === "vip";
  const showDoorsFields =
    showDoors && (isVip || Boolean(defaultDoorsOpenAt) || Boolean(defaultDoorsNote));
  const doorsLabel = isVip ? "VIP-Einlass" : "Sonder-Einlass (optional)";
  const doorsHint = isVip
    ? "Steht auf VIP-Tickets & Check-in. Leer = normaler Event-Einlass. Oft 30 Min. früher."
    : "Leer = Event-Einlass.";
  const labelClass = compact
    ? "text-[11px] text-[var(--tf-text-secondary)]"
    : undefined;
  const inputClass = compact ? "tf-input !min-h-9 !py-1.5 text-sm" : "tf-input";

  return (
    <>
      <label className={`grid ${compact ? "gap-0.5" : "gap-1"}`}>
        <span className={labelClass}>{compact ? "Art" : "Art"}</span>
        <select
          name="categoryKind"
          className={inputClass}
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
          className={`flex items-center gap-2 ${
            compact
              ? "text-[11px] text-[var(--tf-text-secondary)]"
              : "text-xs text-[var(--tf-text-secondary)]"
          }`}
        >
          <input type="checkbox" name="companionFree" defaultChecked={defaultCompanionFree} />
          Begleitung frei
        </label>
      ) : null}
      {isVip ? (
        <label className={`grid ${compact ? "col-span-2 gap-0.5" : "gap-1"}`}>
          <span className={labelClass ?? "text-sm text-[var(--tf-text-secondary)]"}>
            Separat dabei (kurz)
          </span>
          <input
            name="extrasShortText"
            className={inputClass}
            maxLength={280}
            defaultValue={defaultExtrasShortText ?? ""}
            placeholder="z. B. Welcome-Drink & Meet and Greet"
          />
          <span className="text-[10px] leading-snug text-[var(--tf-text-secondary)]">
            Kurzer VIP-Hinweis auf der Eventseite („Separat dabei“). Hat Vorrang vor der
            Kategorie-Beschreibung.
          </span>
        </label>
      ) : null}
      {showDoorsFields ? (
        <>
          <div className={compact ? "col-span-2" : undefined}>
            <SmartDateTimeField
              name="doorsOpenAt"
              label={doorsLabel}
              hint={doorsHint}
              defaultValue={toDatetimeLocalValue(
                defaultDoorsOpenAt ? new Date(defaultDoorsOpenAt) : null,
              )}
            />
          </div>
          <label className={`grid ${compact ? "col-span-2 gap-0.5" : "gap-1"}`}>
            <span className={labelClass ?? "text-sm text-[var(--tf-text-secondary)]"}>
              Einlass-Hinweis (optional)
            </span>
            <input
              name="doorsNote"
              className={inputClass}
              maxLength={200}
              defaultValue={defaultDoorsNote ?? ""}
              placeholder={
                isVip
                  ? "z. B. VIP-Einlass über den Haupteingang"
                  : "z. B. Einlass über den Nebeneingang"
              }
            />
          </label>
        </>
      ) : null}
    </>
  );
}

function ContingentField({
  capacity,
  planBacked,
  standingEditable = false,
  minCapacity = 0,
  hint,
}: {
  capacity: number;
  planBacked: boolean;
  /** Stehplatz after Saalplan assignment — editable with sold floor. */
  standingEditable?: boolean;
  minCapacity?: number;
  hint?: string;
}) {
  if (planBacked && !standingEditable) {
    return (
      <label className="grid gap-0.5">
        <span className="text-[11px] text-[var(--tf-text-secondary)]">Kontingent</span>
        <input
          name="capacity"
          type="number"
          className="tf-input !min-h-9 !py-1.5 bg-[rgba(15,39,71,0.04)] text-sm"
          value={capacity}
          readOnly
          aria-readonly="true"
        />
        {hint ? (
          <span className="text-[10px] leading-snug text-[var(--tf-text-secondary)]">{hint}</span>
        ) : null}
      </label>
    );
  }
  return (
    <label className="grid gap-0.5">
      <span className="text-[11px] text-[var(--tf-text-secondary)]">Kontingent</span>
      <input
        name="capacity"
        type="number"
        className="tf-input !min-h-9 !py-1.5 text-sm"
        defaultValue={capacity}
        key={`${capacity}-${minCapacity}`}
        min={Math.max(0, minCapacity)}
        required
      />
      {hint ? (
        <span className="text-[10px] leading-snug text-[var(--tf-text-secondary)]">{hint}</span>
      ) : null}
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
      seatingEnabled,
    });
  const isVip = kind === "vip";

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
        />
      </div>
      {isVip ? (
        <>
          <SmartDateTimeField
            name="doorsOpenAt"
            label="VIP-Einlass"
            hint="Steht auf VIP-Tickets & Check-in. Leer = normaler Event-Einlass. Oft 30 Min. früher."
            defaultValue=""
          />
          <label className="grid gap-1">
            <span>Einlass-Hinweis (optional)</span>
            <input
              name="doorsNote"
              className="tf-input"
              maxLength={200}
              placeholder="z. B. VIP-Einlass über den Haupteingang"
            />
          </label>
          <label className="grid gap-1">
            <span>Separat dabei (kurz)</span>
            <input
              name="extrasShortText"
              className="tf-input"
              maxLength={280}
              placeholder="z. B. Welcome-Drink & Meet and Greet"
            />
          </label>
        </>
      ) : null}
    </>
  );
}

export function EventCategoriesPanel({
  eventId,
  categories: initialCategories,
  onCategoriesChange,
  onCategorySaved,
  canWrite,
  categoriesCreateLocked = false,
  seatingEnabled = false,
}: {
  eventId: string;
  categories: Category[];
  /** When set, category list is shared with Saalplan assignment above. */
  onCategoriesChange?: Dispatch<SetStateAction<Category[]>>;
  /** After successful save — e.g. reload standing EventSeat units. */
  onCategorySaved?: (category: Category) => void;
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
    const colorRaw = String(fd.get("color") ?? "").trim();
    if (colorRaw && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorRaw)) {
      setError("Farbe bitte als Hex angeben, z. B. #14B8A6 — oder leer lassen.");
      return;
    }
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
          color: colorRaw || null,
          ...(fd.has("doorsOpenAt")
            ? { doorsOpenAt: String(fd.get("doorsOpenAt") ?? "").trim() || null }
            : {}),
          ...(fd.has("doorsNote")
            ? { doorsNote: String(fd.get("doorsNote") ?? "").trim() || null }
            : {}),
          ...(fd.has("extrasShortText")
            ? { extrasShortText: String(fd.get("extrasShortText") ?? "").trim() || null }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = data?.error?.code as string | undefined;
        setError(
          code === "CATEGORIES_LOCKED"
            ? "Nach erstem Ticketverkauf keine neuen Kategorien."
            : code === "CAPACITY_BELOW_SOLD"
              ? (data?.error?.message ??
                "Kontingent darf nicht unter bereits verkaufte oder reservierte Tickets sinken.")
              : code === "STANDING_NOT_ASSIGNED"
                ? (data?.error?.message ??
                  "Zuerst Stehplätze im Saalplan zuordnen — danach Kontingent anpassen.")
                : (data?.error?.message ?? code ?? "Speichern fehlgeschlagen"),
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
      onCategorySaved?.(cat);
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

  return (
    <section id="kategorien" className="space-y-3 scroll-mt-24">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Preiskategorien</h2>
        <p className="text-sm text-[var(--tf-text-secondary)]">
          {categoriesCreateLocked
            ? "Erstes Ticket verkauft oder reserviert — bestehende Preise kannst du anpassen, neue Kategorien nicht mehr anlegen."
            : seatingEnabled
              ? "Preis, Name, Farbe und Art hier bearbeiten. Stehplatz-Kontingent kannst du nach der Saalplan-Zuordnung anpassen."
              : "Preis, Kontingent, Name und Art bearbeiten."}
        </p>
      </div>

      {message ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((cat, catIndex) => {
          const sold = cat.pools.reduce((s, p) => s + p.soldQuantity, 0);
          const held = Math.max(
            0,
            cat.pools.reduce((s, p) => s + Math.max(0, p.heldQuantity), 0),
          );
          const planBacked =
            seatingEnabled &&
            isPlanBackedTicketCategory({
              freeSeating: cat.freeSeating,
              categoryKind: cat.categoryKind,
              seatingEnabled,
            });
          const standingEditable = planBacked && cat.categoryKind === "standing";
          const committed = sold + held;
          const contingentHint = standingEditable
            ? committed > 0
              ? `Mind. ${committed} (verkauft/reserviert).`
              : "Nach Zuordnung frei erhöhbar."
            : planBacked
              ? "Aus Saalplan-Zuordnung."
              : undefined;
          return (
            <div key={cat.id} className="tf-card !p-3">
              {canWrite ? (
                <form
                  className="grid grid-cols-2 gap-x-2 gap-y-2 text-sm"
                  noValidate
                  onInvalid={(e) => e.preventDefault()}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveCategory(e.currentTarget, cat.id);
                  }}
                >
                  <label className="col-span-2 grid gap-0.5">
                    <span className="text-[11px] text-[var(--tf-text-secondary)]">Name</span>
                    <input
                      name="name"
                      className="tf-input !min-h-9 !py-1.5 text-sm"
                      defaultValue={cat.name}
                      required
                    />
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-[11px] text-[var(--tf-text-secondary)]">Preis €</span>
                    <input
                      name="priceEuro"
                      type="number"
                      step="0.01"
                      className="tf-input !min-h-9 !py-1.5 text-sm"
                      defaultValue={(cat.priceGrossCents / 100).toFixed(2)}
                      required
                    />
                  </label>
                  <ContingentField
                    capacity={cat.capacity}
                    planBacked={planBacked}
                    standingEditable={standingEditable}
                    minCapacity={standingEditable ? committed : 0}
                    hint={contingentHint}
                  />
                  <label className="grid gap-0.5">
                    <span className="text-[11px] text-[var(--tf-text-secondary)]">Max./Best.</span>
                    <input
                      name="maxPerOrder"
                      type="number"
                      className="tf-input !min-h-9 !py-1.5 text-sm"
                      defaultValue={cat.maxPerOrder}
                      required
                    />
                  </label>
                  <CategoryKindFields
                    compact
                    defaultKind={cat.categoryKind ?? "standard"}
                    defaultCompanionFree={Boolean(cat.companionFree)}
                    defaultDoorsOpenAt={cat.doorsOpenAt}
                    defaultDoorsNote={cat.doorsNote}
                    defaultExtrasShortText={cat.extrasShortText}
                  />
                  <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
                    <CategoryColorSwatches defaultColor={cat.color} />
                    <p className="text-[11px] tabular-nums text-[var(--tf-text-secondary)]">
                      Verkauft {sold} · reserviert {held} ·{" "}
                      {formatEuroFromCents(cat.priceGrossCents)}
                    </p>
                  </div>
                  {/* Preserve description in DB without showing a bulky field */}
                  <input type="hidden" name="description" value={cat.description ?? ""} />
                  <div className="col-span-2 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="tf-btn tf-btn-primary !min-h-9 !px-3 text-sm"
                      disabled={savingId === cat.id}
                    >
                      {savingId === cat.id ? "Speichert…" : "Speichern"}
                    </button>
                    {sold === 0 && held === 0 ? (
                      <button
                        type="button"
                        className="tf-btn tf-btn-secondary !min-h-9 !px-3 text-sm"
                        disabled={savingId === cat.id}
                        onClick={() => void removeCategory(cat.id)}
                      >
                        Löschen
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full border border-[var(--tf-line)]"
                    style={{
                      background: resolveCategoryColor(cat.color, catIndex),
                    }}
                  />
                  <div>
                    <p className="font-semibold text-[var(--tf-navy)]">{cat.name}</p>
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
          <p className="text-sm text-[var(--tf-text-secondary)] md:col-span-2">
            Noch keine Kategorien für dieses Event.
          </p>
        ) : null}
      </div>

      {canWrite && !categoriesCreateLocked ? (
        <form
          key={newFormKey}
          className="tf-card grid max-w-xl gap-3 text-sm"
          noValidate
          onInvalid={(e) => e.preventDefault()}
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
