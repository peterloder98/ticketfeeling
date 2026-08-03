"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Paintbrush, Plus } from "lucide-react";
import { DEFAULT_CATEGORY_COLORS, resolveCategoryColor } from "@/lib/seating/layout-config";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";

type Category = {
  id: string;
  name: string;
  color: string | null;
  freeSeating: boolean;
  categoryKind: string;
};

type SeatRow = {
  id: string;
  seatKey: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  status: string;
  categoryId: string | null;
  locked: boolean;
};

type Mode = "assign" | "lock" | "unlock";
type Target = "seat" | "row" | "block";

const QUICK_COLORS = ["#14B8A6", "#0F2747", "#3B82F6", "#D6A642", ...DEFAULT_CATEGORY_COLORS].filter(
  (c, i, arr) => arr.indexOf(c) === i,
);

/**
 * Primary Eventim-style UX: assign ticket categories on the event plan
 * (block / row / seat), create categories on the fly, lock under Erweitert.
 */
export function EventSeatingAssignmentPanel({
  eventId,
  canWrite,
}: {
  eventId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [planObjects, setPlanObjects] = useState<
    ReturnType<typeof parseVenuePlanObjects>
  >([]);
  const [planSize, setPlanSize] = useState({ widthCm: 2000, depthCm: 1500 });
  const [venuePlanId, setVenuePlanId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("assign");
  const [target, setTarget] = useState<Target>("block");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#14B8A6");
  const autoAssignedRef = useRef(false);

  const seatingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
      ),
    [categories],
  );

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    seatingCategories.forEach((c, i) => {
      map.set(c.id, resolveCategoryColor(c.color, i));
    });
    return map;
  }, [seatingCategories]);

  const seatsByBlock = useMemo(() => {
    const map = new Map<string, SeatRow[]>();
    for (const seat of seats) {
      const list = map.get(seat.blockObjectId) ?? [];
      list.push(seat);
      map.set(seat.blockObjectId, list);
    }
    return map;
  }, [seats]);

  const assignedCount = seats.filter((s) => s.categoryId).length;
  const unassignedCount = seats.length - assignedCount;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/events/seating?eventId=${eventId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Laden fehlgeschlagen");
        return;
      }
      setEnabled(Boolean(data.enabled));
      setSeats(data.seats ?? []);
      setCategories(data.categories ?? []);
      if (data.venuePlan) {
        setVenuePlanId(data.venuePlan.id ?? null);
        setPlanObjects(parseVenuePlanObjects(data.venuePlan.objects));
        setPlanSize({
          widthCm: data.venuePlan.widthCm,
          depthCm: data.venuePlan.depthCm,
        });
      } else {
        setVenuePlanId(null);
      }
      const seatingCats = (data.categories as Category[] | undefined)?.filter(
        (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
      );
      if (seatingCats?.length) {
        setSelectedCategoryId((prev) =>
          prev && seatingCats.some((c) => c.id === prev) ? prev : seatingCats[0]!.id,
        );
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyPatch(patch: {
    seatIds?: string[];
    blockObjectId?: string;
    rowIndex?: number;
  }) {
    if (!canWrite) return;
    if (mode === "assign" && !selectedCategoryId) {
      setError("Bitte zuerst eine Preiskategorie wählen oder anlegen.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { eventId, ...patch };
      if (mode === "assign") body.categoryId = selectedCategoryId;
      if (mode === "lock") body.locked = true;
      if (mode === "unlock") body.locked = false;
      const res = await fetch("/api/v1/admin/events/seating", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Speichern fehlgeschlagen");
        return;
      }
      setMessage(`${data.updated ?? 0} Plätze aktualisiert.`);
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onSeatClick(seat: SeatRow) {
    if (busy || !canWrite) return;
    if (target === "seat") {
      void applyPatch({ seatIds: [seat.id] });
    } else if (target === "row") {
      void applyPatch({ blockObjectId: seat.blockObjectId, rowIndex: seat.rowIndex });
    } else {
      void applyPatch({ blockObjectId: seat.blockObjectId });
    }
  }

  function onBlockClick(blockObjectId: string) {
    if (busy || !canWrite || target !== "block") return;
    void applyPatch({ blockObjectId });
  }

  async function createCategory() {
    const name = newCatName.trim();
    if (!name) {
      setError("Bitte einen Namen für die Preiskategorie eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/events/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name,
          priceEuro: 0,
          capacity: Math.max(seats.length, 1),
          maxPerOrder: 10,
          categoryKind: "standard",
          color: newCatColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Kategorie konnte nicht angelegt werden");
        return;
      }
      const created = data.category as Category;
      setShowAddCategory(false);
      setNewCatName("");
      setMessage(`Preiskategorie „${created.name}“ ist da — jetzt Bereiche zuweisen.`);
      setMode("assign");
      await load();
      setSelectedCategoryId(created.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const assignAllToSingleCategory = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canWrite || seatingCategories.length !== 1) return false;
      const catId = seatingCategories[0]!.id;
      const unassigned = seats.filter((s) => !s.categoryId).map((s) => s.id);
      if (unassigned.length === 0) return false;
      setBusy(true);
      setError(null);
      if (!opts?.silent) setMessage(null);
      try {
        const res = await fetch("/api/v1/admin/events/seating", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            categoryId: catId,
            seatIds: unassigned,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.code ?? "Speichern fehlgeschlagen");
          return false;
        }
        setMessage(
          `Geschafft — ${data.updated ?? unassigned.length} Plätze sind „${seatingCategories[0]!.name}“.`,
        );
        setSelectedCategoryId(catId);
        await load();
        router.refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [canWrite, seatingCategories, seats, eventId, load, router],
  );

  useEffect(() => {
    if (loading || !enabled || !canWrite || busy || autoAssignedRef.current) return;
    if (seatingCategories.length !== 1) return;
    const unassigned = seats.filter((s) => !s.categoryId);
    if (unassigned.length === 0) return;
    autoAssignedRef.current = true;
    void assignAllToSingleCategory({ silent: true });
  }, [
    loading,
    enabled,
    canWrite,
    busy,
    seatingCategories.length,
    seats,
    assignAllToSingleCategory,
  ]);

  if (loading) {
    return (
      <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">Wird geladen…</p>
      </section>
    );
  }

  if (!enabled) {
    return (
      <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Zuerst einen Saalplan zuweisen und den Sitzplatzmodus aktivieren — dann kannst du hier
          Bereiche und Plätze den Preiskategorien zuordnen.
        </p>
      </section>
    );
  }

  const pad = 40;
  const viewW = 920;
  const viewH = 560;
  const scale = Math.min(
    (viewW - pad * 2) / planSize.widthCm,
    (viewH - pad * 2) / planSize.depthCm,
  );
  const toX = (cm: number) => pad + cm * scale;
  const toY = (cm: number) => pad + cm * scale;
  const toS = (cm: number) => cm * scale;
  const editorHref = venuePlanId
    ? `/admin/saalplan/${venuePlanId}?returnTo=${encodeURIComponent(`/admin/events/${eventId}#zuordnung`)}&returnLabel=${encodeURIComponent("Zurück zum Event")}`
    : null;

  return (
    <section id="zuordnung" className="tf-card !p-5 scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Preiskategorie wählen, dann Block, Reihe oder Plätze antippen — so wie bei Eventim, nur
            schlichter.
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--tf-navy)]">
            Zugewiesen: {assignedCount} / {seats.length} Plätze
            {unassignedCount > 0 ? (
              <span className="ml-2 font-normal text-[var(--tf-text-secondary)]">
                ({unassignedCount} offen)
              </span>
            ) : null}
          </p>
        </div>
        {editorHref ? (
          <a
            href={editorHref}
            target="_blank"
            rel="noreferrer"
            className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          >
            Geometrie bearbeiten
          </a>
        ) : null}
      </div>

      {canWrite && seatingCategories.length === 1 && unassignedCount > 0 ? (
        <div className="mt-4 rounded-xl border border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.1)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            Fast fertig — {unassignedCount} Plätze noch offen
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Mit einer Kategorie kannst du den ganzen Plan auf einmal zuweisen.
          </p>
          <button
            type="button"
            className="tf-btn tf-btn-primary mt-3 !min-h-10 text-sm"
            disabled={busy}
            onClick={() => void assignAllToSingleCategory()}
          >
            {busy ? "Wird zugewiesen…" : "Ganzen Saalplan zuweisen"}
          </button>
        </div>
      ) : null}

      {unassignedCount === 0 && seats.length > 0 ? (
        <p className="mt-4 rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Alles zugeordnet — als Nächstes Preise unter Preiskategorien setzen.
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
          Preiskategorien
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {seatingCategories.map((c, i) => {
            const color = resolveCategoryColor(c.color, i);
            const active = mode === "assign" && selectedCategoryId === c.id;
            const count = seats.filter((s) => s.categoryId === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setMode("assign");
                  setSelectedCategoryId(c.id);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  active
                    ? "border-[var(--tf-navy)] ring-2 ring-[rgba(15,39,71,0.15)]"
                    : "border-[var(--tf-line)]"
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                {c.name}
                <span className="text-xs font-normal text-[var(--tf-text-secondary)]">{count}</span>
              </button>
            );
          })}
          {canWrite ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--tf-teal)] px-3 py-1.5 text-sm font-semibold text-[var(--tf-navy)]"
              onClick={() => {
                setShowAddCategory((v) => !v);
                setNewCatColor(QUICK_COLORS[seatingCategories.length % QUICK_COLORS.length]!);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Preiskategorie hinzufügen
            </button>
          ) : null}
        </div>
      </div>

      {showAddCategory && canWrite ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-4 sm:grid-cols-[1fr_auto_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Name</span>
            <input
              className="tf-input"
              placeholder="z. B. Parkett, Rang, VIP"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createCategory();
                }
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Farbe</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--tf-line)] bg-white p-1"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_COLORS.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-6 w-6 rounded-full border border-[var(--tf-line)]"
                    style={{ background: c }}
                    onClick={() => setNewCatColor(c)}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="tf-btn tf-btn-primary !min-h-10 text-sm"
              disabled={busy}
              onClick={() => void createCategory()}
            >
              Anlegen
            </button>
            <button
              type="button"
              className="tf-btn !min-h-10 text-sm"
              onClick={() => setShowAddCategory(false)}
            >
              Abbrechen
            </button>
          </div>
          <p className="sm:col-span-3 text-xs text-[var(--tf-text-secondary)]">
            Preis kannst du danach unter Preiskategorien setzen — 0 € ist erstmal ok.
          </p>
        </div>
      ) : null}

      {seatingCategories.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
          Noch keine Preiskategorie — lege oben eine an, dann tippst du Bereiche auf dem Plan an.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            { id: "block", label: "Bereich / Block" },
            { id: "row", label: "Reihe(n)" },
            { id: "seat", label: "Einzelplätze" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              target === t.id
                ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
                : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)]"
            }`}
            onClick={() => setTarget(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <details
        className="mt-3 rounded-xl border border-[var(--tf-line)] p-3"
        open={showAdvanced || mode !== "assign"}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-[var(--tf-navy)]">
          Erweitert: Sperren / Freigeben
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { id: "assign", label: "Kategorie zuweisen", icon: Paintbrush },
              { id: "lock", label: "Sperren", icon: Lock },
              { id: "unlock", label: "Freigeben", icon: Unlock },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                mode === m.id
                  ? "border-[var(--tf-navy)] bg-[var(--tf-navy)] text-white"
                  : "border-[var(--tf-line)] bg-white text-[var(--tf-navy)]"
              }`}
              onClick={() => setMode(m.id)}
            >
              <m.icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>
      </details>

      {message ? <p className="mt-2 text-sm text-[var(--tf-teal)]">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-4 overflow-auto rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc]">
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-auto w-full min-h-[320px]">
          <rect
            x={toX(0)}
            y={toY(0)}
            width={toS(planSize.widthCm)}
            height={toS(planSize.depthCm)}
            fill="#fff"
            stroke="#0F2747"
            strokeWidth={1.5}
            rx={4}
          />
          {planObjects.map((obj) => {
            if (obj.type === "stage") {
              return (
                <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                  <rect
                    x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                    y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                    width={toS(obj.widthCm)}
                    height={toS(obj.heightCm)}
                    fill="rgba(15,39,71,0.08)"
                    stroke="#0F2747"
                    rx={4}
                  />
                  <text
                    x={toX(obj.xCm)}
                    y={toY(obj.yCm) + 4}
                    textAnchor="middle"
                    style={{ fontSize: 12, fontWeight: 700, fill: "#0F2747" }}
                  >
                    {obj.label || "Bühne"}
                  </text>
                </g>
              );
            }
            if (obj.type === "standing_area") {
              return (
                <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                  <rect
                    x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                    y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                    width={toS(obj.widthCm)}
                    height={toS(obj.heightCm)}
                    fill="rgba(15,39,71,0.05)"
                    stroke="#0F2747"
                    strokeDasharray="6 4"
                    rx={4}
                  />
                  <text
                    x={toX(obj.xCm)}
                    y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 3}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747" }}
                  >
                    {obj.label || "Stehbereich"}
                  </text>
                </g>
              );
            }
            if (obj.type !== "seat_block" || obj.numberedSeats === false) {
              if (obj.type === "seat_block") {
                return (
                  <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                    <rect
                      x={toX(obj.xCm) - toS(obj.widthCm) / 2}
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2}
                      width={toS(obj.widthCm)}
                      height={toS(obj.heightCm)}
                      fill="rgba(20,184,166,0.12)"
                      stroke="#0F2747"
                      rx={4}
                    />
                    <text
                      x={toX(obj.xCm)}
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 3}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747" }}
                    >
                      {obj.label || "Block"} · freie Platzwahl
                    </text>
                  </g>
                );
              }
              return null;
            }

            const left = toX(obj.xCm) - toS(obj.widthCm) / 2;
            const top = toY(obj.yCm) - toS(obj.heightCm) / 2;
            const w = toS(obj.widthCm);
            const h = toS(obj.heightCm);
            const padX = w * 0.12;
            const padY = h * 0.14;
            const cols = Math.max(1, obj.seatsPerRow ?? 1);
            const rows = Math.max(1, obj.rows ?? 1);
            const cellW = (w - padX * 2) / cols;
            const cellH = (h - padY * 2) / rows;
            const blockSeats = seatsByBlock.get(obj.id) ?? [];

            return (
              <g key={obj.id} transform={`rotate(${obj.rotationDeg} ${toX(obj.xCm)} ${toY(obj.yCm)})`}>
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  fill="rgba(20,184,166,0.04)"
                  stroke="#0F2747"
                  rx={4}
                  style={{ cursor: target === "block" ? "pointer" : "default" }}
                  onClick={() => onBlockClick(obj.id)}
                />
                <text
                  x={toX(obj.xCm)}
                  y={top - 3}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  style={{ fontSize: 11, fontWeight: 700, fill: "#0F2747", pointerEvents: "none" }}
                >
                  {obj.label || "Block"}
                </text>
                {Array.from({ length: rows }, (_, ri) => {
                  const rowNum = ri + 1;
                  const cy = top + padY + cellH * (rowNum - 0.5);
                  return (
                    <g key={`row-${rowNum}`}>
                      <text
                        x={left + padX * 0.4}
                        y={cy + 3}
                        textAnchor="middle"
                        style={{
                          fontSize: Math.max(8, Math.min(11, cellH * 0.35)),
                          fontWeight: 600,
                          fill: "#64748B",
                          cursor: target === "row" ? "pointer" : "default",
                        }}
                        onClick={() => {
                          if (target === "row") {
                            void applyPatch({ blockObjectId: obj.id, rowIndex: rowNum });
                          }
                        }}
                      >
                        {rowNum}
                      </text>
                      <text
                        x={left + w - padX * 0.4}
                        y={cy + 3}
                        textAnchor="middle"
                        style={{
                          fontSize: Math.max(8, Math.min(11, cellH * 0.35)),
                          fontWeight: 600,
                          fill: "#64748B",
                          cursor: target === "row" ? "pointer" : "default",
                        }}
                        onClick={() => {
                          if (target === "row") {
                            void applyPatch({ blockObjectId: obj.id, rowIndex: rowNum });
                          }
                        }}
                      >
                        {rowNum}
                      </text>
                    </g>
                  );
                })}
                {blockSeats.map((seat) => {
                  const cx = left + padX + cellW * (seat.seatIndex - 0.5);
                  const cy = top + padY + cellH * (seat.rowIndex - 0.5);
                  const r = Math.max(3, Math.min(cellW, cellH) * 0.34);
                  const color = seat.categoryId
                    ? colorById.get(seat.categoryId) ?? "#94A3B8"
                    : "#E2E8F0";
                  const fill = seat.locked
                    ? "#CBD5E1"
                    : seat.status === "sold" || seat.status === "held"
                      ? "#94A3B8"
                      : color;
                  return (
                    <g key={seat.id} style={{ cursor: "pointer" }} onClick={() => onSeatClick(seat)}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={fill}
                        stroke={seat.locked ? "#64748B" : "#0F2747"}
                        strokeWidth={seat.locked ? 1.5 : 1}
                        strokeDasharray={seat.locked ? "3 2" : undefined}
                      />
                      {r >= 6 ? (
                        <text
                          x={cx}
                          y={cy + 3}
                          textAnchor="middle"
                          style={{
                            fontSize: Math.min(9, r * 0.9),
                            fontWeight: 700,
                            fill: seat.locked || !seat.categoryId ? "#0F2747" : "#fff",
                            pointerEvents: "none",
                          }}
                        >
                          {seat.seatNumber}
                        </text>
                      ) : null}
                      <title>
                        {seat.locked ? "Gesperrt · " : ""}
                        Reihe {seat.rowLabel} Platz {seat.seatNumber}
                      </title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
        <span className="font-medium text-[var(--tf-navy)]">Legende:</span>
        {seatingCategories.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: resolveCategoryColor(c.color, i) }}
            />
            {c.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-dashed border-[#64748B] bg-[#CBD5E1]" />
          Gesperrt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-[#0F2747] bg-[#E2E8F0]" />
          Nicht zugeordnet
        </span>
      </div>
    </section>
  );
}
