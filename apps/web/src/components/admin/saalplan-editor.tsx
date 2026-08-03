"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Eraser, Paintbrush, Plus, Save, ZoomIn, ZoomOut } from "lucide-react";
import type { VenuePlanObject } from "@/lib/saalplan/types";
import {
  areaSqm,
  cmToMetersLabel,
  estimateStandingCapacity,
  objectTypeLabel,
  planSeatCapacity,
  planStandingEstimate,
  seatCountOfObject,
  visualSeatCountOfObject,
} from "@/lib/saalplan/types";
import {
  createSeatBlock,
  createStage,
  createStandingArea,
  nextBlockLabel,
  seatBlockSizeCm,
  snapObjectCenter,
  type SnapGuide,
} from "@/lib/saalplan/snap";
import {
  colorForSlotKey,
  defaultSlotColor,
  paintBlockCategory,
  paintRowCategory,
  paintSeatCategory,
  parsePlanCategorySlots,
  pruneCategoryAssignments,
  resolveSeatCategoryKey,
  slotKeyFromName,
  type PlanCategorySlot,
} from "@/lib/saalplan/category-slots";

type Props = {
  planId: string;
  initialName: string;
  initialWidthCm: number;
  initialDepthCm: number;
  initialObjects: VenuePlanObject[];
  initialCategorySlots?: PlanCategorySlot[];
  /** Optional seed from event ticket categories (names/colors). */
  seedCategorySlots?: PlanCategorySlot[];
  saveAction: (formData: FormData) => Promise<void>;
};

type EditorMode = "layout" | "paint";
type PaintTarget = "block" | "row" | "seat";

type DragState = {
  kind: "move";
  objectId: string;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
/** Hard caps for block layout — real halls need more than the old silent max of 80. */
const MAX_ROWS = 200;
const MAX_SEATS_PER_ROW = 200;

export function SaalplanEditor({
  planId,
  initialName,
  initialWidthCm,
  initialDepthCm,
  initialObjects,
  initialCategorySlots,
  seedCategorySlots,
  saveAction,
}: Props) {
  const [name, setName] = useState(initialName);
  const [widthCm, setWidthCm] = useState(initialWidthCm);
  const [depthCm, setDepthCm] = useState(initialDepthCm);
  const [objects, setObjects] = useState<VenuePlanObject[]>(initialObjects);
  const [categorySlots, setCategorySlots] = useState<PlanCategorySlot[]>(() => {
    const saved = parsePlanCategorySlots(initialCategorySlots ?? []);
    if (saved.length > 0) return saved;
    return parsePlanCategorySlots(seedCategorySlots ?? []);
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    initialObjects[0]?.id ?? null,
  );
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [viewport, setViewport] = useState({ w: 720, h: 520 });
  const [editorMode, setEditorMode] = useState<EditorMode>("layout");
  const [paintTarget, setPaintTarget] = useState<PaintTarget>("block");
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(
    () => categorySlots[0]?.key ?? null,
  );
  const [eraseMode, setEraseMode] = useState(false);
  const [newSlotName, setNewSlotName] = useState("");

  const dragRef = useRef<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const hallRef = useRef({ widthCm: initialWidthCm, depthCm: initialDepthCm });

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const capacity = planSeatCapacity(objects);
  const standingEstimate = planStandingEstimate(objects);
  const hasStage = objects.some((o) => o.type === "stage");
  const hasSeats = capacity > 0 || objects.some((o) => o.type === "seat_block" || o.type === "standing_area");
  const paintedSeatCount = useMemo(() => {
    let n = 0;
    for (const block of objects) {
      if (block.type !== "seat_block" || block.numberedSeats === false) continue;
      const rows = Math.max(0, Math.round(block.rows ?? 0));
      const cols = Math.max(0, Math.round(block.seatsPerRow ?? 0));
      for (let r = 1; r <= rows; r += 1) {
        for (let s = 1; s <= cols; s += 1) {
          if (resolveSeatCategoryKey(block, r, s)) n += 1;
        }
      }
    }
    return n;
  }, [objects]);
  const hasCategoryPaint = categorySlots.length > 0 && paintedSeatCount > 0;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewport({
        w: Math.max(280, Math.round(rect.width)),
        h: Math.max(280, Math.round(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  hallRef.current = { widthCm, depthCm };

  const pad = Math.max(12, Math.min(24, Math.round(Math.min(viewport.w, viewport.h) * 0.03)));
  const fitScale = Math.min(
    (viewport.w - pad * 2) / Math.max(1, widthCm),
    (viewport.h - pad * 2) / Math.max(1, depthCm),
  );
  const scale = Math.max(0.01, fitScale * zoom);
  scaleRef.current = scale;

  const hallW = widthCm * scale;
  const hallH = depthCm * scale;
  // View grows with zoom so the hall can fill / overflow the scrollable canvas.
  const viewW = Math.max(viewport.w, Math.ceil(hallW + pad * 2));
  const viewH = Math.max(viewport.h, Math.ceil(hallH + pad * 2));
  const hallLeft = (viewW - hallW) / 2;
  const hallTop = (viewH - hallH) / 2;

  const toPx = useCallback((cm: number) => cm * scale, [scale]);

  function markDirty(next: VenuePlanObject[]) {
    setObjects(next);
    setDirty(true);
    setMessage(null);
  }

  function updateSelected(patch: Partial<VenuePlanObject>, notice?: string | null) {
    if (!selectedId) return;
    setObjects((prev) => {
      const next = prev.map((o) => (o.id === selectedId ? { ...o, ...patch } : o));
      return next;
    });
    setDirty(true);
    setMessage(notice ?? null);
  }

  /** Grow block from row/seat counts; clamp physical size to hall and surface feedback. */
  function applySeatLayout(rawRows: number, rawSeatsPerRow: number) {
    if (!selectedId) return;
    const rows = Math.min(MAX_ROWS, Math.max(1, Math.round(rawRows) || 1));
    const seatsPerRow = Math.min(
      MAX_SEATS_PER_ROW,
      Math.max(1, Math.round(rawSeatsPerRow) || 1),
    );
    const size = seatBlockSizeCm(rows, seatsPerRow);
    const maxW = widthCm;
    const maxH = depthCm;
    const nextW = Math.min(size.widthCm, maxW);
    const nextH = Math.min(size.heightCm, maxH);
    let notice: string | null = null;
    if (rows !== Math.round(rawRows) || seatsPerRow !== Math.round(rawSeatsPerRow)) {
      notice = `Maximum erreicht: bis zu ${MAX_ROWS} Reihen und ${MAX_SEATS_PER_ROW} Sitze pro Reihe.`;
    } else if (size.widthCm > maxW || size.heightCm > maxH) {
      notice =
        "So groß wie der Saal hergibt — bei noch mehr Sitzen bleiben die Abmessungen gleich (Sitze rücken enger).";
    }
    const id = selectedId;
    setObjects((prev) =>
      prev.map((o) =>
        o.id === id
          ? pruneCategoryAssignments({
              ...o,
              rows,
              seatsPerRow,
              widthCm: nextW,
              heightCm: nextH,
            })
          : o,
      ),
    );
    setDirty(true);
    setMessage(notice);
  }

  function markSlotsDirty(next: PlanCategorySlot[]) {
    setCategorySlots(next);
    setDirty(true);
    setMessage(null);
    if (selectedSlotKey && !next.some((s) => s.key === selectedSlotKey)) {
      setSelectedSlotKey(next[0]?.key ?? null);
    }
  }

  function addCategorySlot() {
    const name = newSlotName.trim();
    if (!name) {
      setMessage("Bitte einen Kategorienamen eingeben (z. B. Parkett).");
      return;
    }
    let key = slotKeyFromName(name);
    if (categorySlots.some((s) => s.key === key)) {
      key = `${key}-${Math.random().toString(36).slice(2, 5)}`;
    }
    const next = [
      ...categorySlots,
      { key, name, color: defaultSlotColor(categorySlots.length) },
    ];
    markSlotsDirty(next);
    setSelectedSlotKey(key);
    setNewSlotName("");
    setEraseMode(false);
    setEditorMode("paint");
    setMessage(`Kategorie „${name}“ angelegt — jetzt Block, Reihe oder Platz antippen.`);
  }

  function removeCategorySlot(key: string) {
    markSlotsDirty(categorySlots.filter((s) => s.key !== key));
    setObjects((prev) =>
      prev.map((o) => {
        if (o.type !== "seat_block") return o;
        let next = o;
        if (o.categoryKey === key) next = { ...next, categoryKey: undefined };
        if (o.rowCategoryKeys) {
          const rows = { ...o.rowCategoryKeys };
          for (const [rk, rv] of Object.entries(rows)) {
            if (rv === key) delete rows[rk];
          }
          next = {
            ...next,
            rowCategoryKeys: Object.keys(rows).length ? rows : undefined,
          };
        }
        if (o.seatCategoryKeys) {
          const seats = { ...o.seatCategoryKeys };
          for (const [sk, sv] of Object.entries(seats)) {
            if (sv === key) delete seats[sk];
          }
          next = {
            ...next,
            seatCategoryKeys: Object.keys(seats).length ? seats : undefined,
          };
        }
        return next;
      }),
    );
  }

  function applyPaint(blockId: string, rowIndex?: number, seatIndex?: number) {
    const key = eraseMode ? null : selectedSlotKey;
    if (!eraseMode && !key) {
      setMessage("Zuerst eine Kategorie wählen oder anlegen.");
      return;
    }
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== blockId || o.type !== "seat_block") return o;
        if (paintTarget === "seat" && rowIndex && seatIndex) {
          return paintSeatCategory(o, rowIndex, seatIndex, key);
        }
        if (paintTarget === "row" && rowIndex) {
          return paintRowCategory(o, rowIndex, key);
        }
        return paintBlockCategory(o, key);
      }),
    );
    setDirty(true);
    setMessage(
      eraseMode
        ? "Zuordnung entfernt."
        : paintTarget === "seat"
          ? "Platz zugeordnet."
          : paintTarget === "row"
            ? "Reihe zugeordnet."
            : "Block zugeordnet.",
    );
  }

  function deleteSelected() {
    if (!selectedId) return;
    const id = selectedId;
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedId(null);
    setDirty(true);
    setMessage(null);
  }

  function addStage() {
    if (hasStage) {
      const existing = objects.find((o) => o.type === "stage");
      if (existing) setSelectedId(existing.id);
      return;
    }
    const stage = createStage(widthCm, depthCm);
    markDirty([...objects, stage]);
    setSelectedId(stage.id);
  }

  function addSeatBlock() {
    const block = createSeatBlock(widthCm, depthCm, {
      label: nextBlockLabel(objects),
      numberedSeats: true,
    });
    markDirty([...objects, block]);
    setSelectedId(block.id);
  }

  function addStandingArea() {
    const area = createStandingArea(widthCm, depthCm, {
      label: nextBlockLabel(objects),
      standingMode: "standing",
    });
    markDirty([...objects, area]);
    setSelectedId(area.id);
  }

  /** Screen pixels → SVG viewBox delta → cm */
  function clientDeltaToCm(e: PointerEvent, startClientX: number, startClientY: number) {
    const svg = svgRef.current;
    const s = scaleRef.current || 1;
    if (!svg) {
      return { dxCm: 0, dyCm: 0 };
    }
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return {
        dxCm: (e.clientX - startClientX) / s,
        dyCm: (e.clientY - startClientY) / s,
      };
    }
    const inv = ctm.inverse();
    const p0 = new DOMPoint(startClientX, startClientY).matrixTransform(inv);
    const p1 = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    return { dxCm: (p1.x - p0.x) / s, dyCm: (p1.y - p0.y) / s };
  }

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGuides([]);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const { widthCm: hallWCm, depthCm: hallDCm } = hallRef.current;
      const { dxCm, dyCm } = clientDeltaToCm(e, drag.startClientX, drag.startClientY);

      setObjects((prev) => {
        const current = prev.find((o) => o.id === drag.objectId);
        if (!current) return prev;
        const snapped = snapObjectCenter({
          xCm: drag.origX + dxCm,
          yCm: drag.origY + dyCm,
          widthCm: current.widthCm,
          heightCm: current.heightCm,
          hallWidthCm: hallWCm,
          hallDepthCm: hallDCm,
        });
        setGuides(snapped.guides);
        return prev.map((o) =>
          o.id === drag.objectId ? { ...o, xCm: snapped.xCm, yCm: snapped.yCm } : o,
        );
      });
      setDirty(true);
      setMessage(null);
    }

    function onUp() {
      if (dragRef.current) endDrag();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endDrag]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (!selectedId) return;
      e.preventDefault();
      const id = selectedId;
      setObjects((prev) => prev.filter((o) => o.id !== id));
      setSelectedId(null);
      setDirty(true);
      setMessage(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function onPointerDownObject(e: React.PointerEvent, obj: VenuePlanObject) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(obj.id);
    if (editorMode === "paint") {
      if (obj.type === "seat_block" && obj.numberedSeats !== false && paintTarget === "block") {
        applyPaint(obj.id);
      }
      return;
    }
    if (obj.locked) return;
    dragRef.current = {
      kind: "move",
      objectId: obj.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: obj.xCm,
      origY: obj.yCm,
    };
  }

  function save() {
    const fd = new FormData();
    fd.set("planId", planId);
    fd.set("name", name);
    fd.set("widthCm", String(widthCm));
    fd.set("depthCm", String(depthCm));
    fd.set("objects", JSON.stringify(objects.map((o) => pruneCategoryAssignments(o))));
    fd.set("categorySlots", JSON.stringify(categorySlots));
    startTransition(async () => {
      try {
        await saveAction(fd);
        setDirty(false);
        setMessage(
          categorySlots.length > 0
            ? "Gespeichert — Kategorien im Plan sind gesetzt. Beim Event werden gleichnamige Ticketkategorien automatisch verknüpft."
            : "Gespeichert — der Plan ist bereit für Events.",
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const step = 50;
    for (let x = 0; x <= widthCm; x += step) {
      lines.push({
        x1: hallLeft + toPx(x),
        y1: hallTop,
        x2: hallLeft + toPx(x),
        y2: hallTop + hallH,
        major: x % 100 === 0,
      });
    }
    for (let y = 0; y <= depthCm; y += step) {
      lines.push({
        x1: hallLeft,
        y1: hallTop + toPx(y),
        x2: hallLeft + hallW,
        y2: hallTop + toPx(y),
        major: y % 100 === 0,
      });
    }
    return lines;
  }, [widthCm, depthCm, hallLeft, hallTop, hallW, hallH, toPx]);

  const meterLabelsX = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    for (let x = 0; x <= widthCm; x += 100) {
      labels.push({ x: hallLeft + toPx(x), text: cmToMetersLabel(x) });
    }
    return labels;
  }, [widthCm, hallLeft, toPx]);

  const meterLabelsY = useMemo(() => {
    const labels: { y: number; text: string }[] = [];
    for (let y = 0; y <= depthCm; y += 100) {
      labels.push({ y: hallTop + toPx(y), text: cmToMetersLabel(y) });
    }
    return labels;
  }, [depthCm, hallTop, toPx]);

  return (
    <div className="space-y-4">
      <ol className="grid gap-2 rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm sm:grid-cols-5">
        {[
          {
            n: 1,
            title: "Saalgröße",
            done: widthCm >= 200 && depthCm >= 200,
            text: "Exakte Maße oben eintragen",
          },
          {
            n: 2,
            title: "Bühne",
            done: hasStage,
            text: "Einfügen und auf dem Plan platzieren",
          },
          {
            n: 3,
            title: "Blöcke",
            done: hasSeats,
            text: "Reihen und Sitze rechts einstellen",
          },
          {
            n: 4,
            title: "Kategorien",
            done: hasCategoryPaint || capacity === 0,
            text:
              capacity === 0
                ? "Optional bei nummerierten Sitzen"
                : hasCategoryPaint
                  ? `${paintedSeatCount} Plätze zugeordnet`
                  : "Im Plan Block/Reihe/Platz zuordnen",
          },
          {
            n: 5,
            title: "Speichern",
            done: !dirty && (hasStage || hasSeats),
            text: dirty ? "Noch ungespeicherte Änderungen" : "Fertig für Events",
          },
        ].map((s) => (
          <li
            key={s.n}
            className={`rounded-xl px-3 py-2 ${
              s.done ? "bg-[rgba(20,184,166,0.1)]" : "bg-[#f8fafc]"
            }`}
          >
            <p className="font-semibold text-[var(--tf-navy)]">
              <span
                className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  s.done
                    ? "bg-[var(--tf-teal)] text-white"
                    : "bg-[rgba(15,39,71,0.12)] text-[var(--tf-navy)]"
                }`}
              >
                {s.done ? "✓" : s.n}
              </span>
              {s.title}
            </p>
            <p className="mt-0.5 text-xs text-[var(--tf-text-secondary)]">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_7rem_7rem]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Name des Plans</span>
            <input
              className="tf-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Breite (m)</span>
            <input
              type="number"
              min={2}
              step={0.1}
              className="tf-input"
              value={Number((widthCm / 100).toFixed(2))}
              onChange={(e) => {
                const m = Number(String(e.target.value).replace(",", "."));
                if (!Number.isFinite(m) || m < 2) return;
                setWidthCm(Math.round(m * 100));
                setDirty(true);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Tiefe (m)</span>
            <input
              type="number"
              min={2}
              step={0.1}
              className="tf-input"
              value={Number((depthCm / 100).toFixed(2))}
              onChange={(e) => {
                const m = Number(String(e.target.value).replace(",", "."));
                if (!Number.isFinite(m) || m < 2) return;
                setDepthCm(Math.round(m * 100));
                setDirty(true);
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-full bg-[rgba(15,39,71,0.06)] px-3 py-1.5 text-sm font-medium text-[var(--tf-navy)]">
            {capacity} nummerierte Sitze
            {standingEstimate > 0 ? ` · ca. ${standingEstimate} stehend` : ""}
          </p>
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10 text-sm"
            disabled={pending || !dirty}
            onClick={save}
          >
            <Save className="mr-1 inline h-4 w-4" />
            {pending ? "Speichert…" : dirty ? "Speichern" : "Gespeichert"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-[var(--tf-teal)]">{message}</p> : null}

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--tf-navy)]">
              Im Saalplan Kategorien zuordnen
            </h2>
            <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
              Kategorien hier anlegen und auf Block, Reihe oder Einzelplatz malen. Beim Event werden
              Ticketkategorien mit gleichem Namen automatisch verknüpft.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                editorMode === "layout"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
                  : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)]"
              }`}
              onClick={() => setEditorMode("layout")}
            >
              Anordnen
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                editorMode === "paint"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
                  : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)]"
              }`}
              onClick={() => setEditorMode("paint")}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              Kategorien malen
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
            <span className="text-xs text-[var(--tf-text-secondary)]">Neue Kategorie</span>
            <input
              className="tf-input !min-h-10"
              placeholder="z. B. Parkett, Rang, VIP"
              value={newSlotName}
              onChange={(e) => setNewSlotName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategorySlot();
                }
              }}
            />
          </label>
          <button type="button" className="tf-btn tf-btn-primary !min-h-10 text-sm" onClick={addCategorySlot}>
            Hinzufügen
          </button>
        </div>

        {categorySlots.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {categorySlots.map((slot) => {
              const active = !eraseMode && selectedSlotKey === slot.key && editorMode === "paint";
              return (
                <div key={slot.key} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSlotKey(slot.key);
                      setEraseMode(false);
                      setEditorMode("paint");
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                      active
                        ? "border-[var(--tf-navy)] ring-2 ring-[rgba(15,39,71,0.15)]"
                        : "border-[var(--tf-line)]"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: slot.color }} />
                    {slot.name}
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 text-xs text-[var(--tf-text-secondary)] hover:text-[var(--danger)]"
                    title="Kategorie entfernen"
                    onClick={() => removeCategorySlot(slot.key)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setEraseMode(true);
                setEditorMode("paint");
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                eraseMode && editorMode === "paint"
                  ? "border-[var(--tf-navy)] bg-[var(--tf-navy)] text-white"
                  : "border-[var(--tf-line)] text-[var(--tf-navy)]"
              }`}
            >
              <Eraser className="h-3.5 w-3.5" />
              Entfernen
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--tf-text-secondary)]">
            Noch keine Kategorien — z. B. „Parkett“ anlegen, dann auf den Plan malen.
          </p>
        )}

        {editorMode === "paint" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                { id: "block", label: "Ganzer Block" },
                { id: "row", label: "Reihe" },
                { id: "seat", label: "Einzelplatz" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  paintTarget === t.id
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
                    : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)]"
                }`}
                onClick={() => setPaintTarget(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--tf-line)] px-3 py-2">
            <p className="text-xs text-[var(--tf-text-secondary)]">
              {editorMode === "paint"
                ? "Malmodus: Kategorie wählen, dann Block / Reihe / Platz antippen"
                : "Ziehen = verschieben · Größe über Maße / Reihen rechts · Entf = löschen"}
              {dirty ? " · ungespeichert" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
                aria-label="Verkleinern"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-xs tabular-nums hover:bg-[rgba(15,39,71,0.06)]"
                onClick={() => setZoom(1)}
                title="Saal auf Fläche einpassen"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
                aria-label="Vergrößern"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="h-[min(72vh,640px)] w-full overflow-auto bg-[#f8fafc]"
          >
            <svg
              ref={svgRef}
              width={viewW}
              height={viewH}
              viewBox={`0 0 ${viewW} ${viewH}`}
              className="touch-none select-none"
              onPointerDown={() => {
                if (!dragRef.current) setSelectedId(null);
              }}
            >
              {gridLines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={l.major ? "rgba(15,39,71,0.12)" : "rgba(15,39,71,0.06)"}
                  strokeWidth={l.major ? 1 : 0.6}
                />
              ))}

              <rect
                x={hallLeft}
                y={hallTop}
                width={hallW}
                height={hallH}
                fill="rgba(255,255,255,0.9)"
                stroke="var(--tf-navy)"
                strokeWidth={1.5}
                rx={2}
              />

              {meterLabelsX.map((l) => (
                <text
                  key={`x-${l.text}-${l.x}`}
                  x={l.x}
                  y={Math.max(12, hallTop - 10)}
                  textAnchor="middle"
                  className="fill-[var(--tf-text-secondary)]"
                  style={{ fontSize: 10 }}
                >
                  {l.text}
                </text>
              ))}
              {meterLabelsY.map((l) => (
                <text
                  key={`y-${l.text}-${l.y}`}
                  x={Math.max(4, hallLeft - 8)}
                  y={l.y + 3}
                  textAnchor="end"
                  className="fill-[var(--tf-text-secondary)]"
                  style={{ fontSize: 10 }}
                >
                  {l.text}
                </text>
              ))}

              {guides.map((g, i) =>
                g.orientation === "v" ? (
                  <line
                    key={`g-${i}`}
                    x1={hallLeft + toPx(g.atCm)}
                    y1={hallTop}
                    x2={hallLeft + toPx(g.atCm)}
                    y2={hallTop + hallH}
                    stroke="var(--tf-teal)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                ) : (
                  <line
                    key={`g-${i}`}
                    x1={hallLeft}
                    y1={hallTop + toPx(g.atCm)}
                    x2={hallLeft + hallW}
                    y2={hallTop + toPx(g.atCm)}
                    stroke="var(--tf-teal)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                ),
              )}

              {[...objects]
                .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                .map((obj) => {
                  const x = hallLeft + toPx(obj.xCm - obj.widthCm / 2);
                  const y = hallTop + toPx(obj.yCm - obj.heightCm / 2);
                  const w = toPx(obj.widthCm);
                  const h = toPx(obj.heightCm);
                  const isSel = obj.id === selectedId;
                  const cx = hallLeft + toPx(obj.xCm);
                  const cy = hallTop + toPx(obj.yCm);
                  const seats = visualSeatCountOfObject(obj);
                  const numbered = obj.type === "seat_block" && obj.numberedSeats !== false;
                  const standingCap =
                    obj.type === "standing_area"
                      ? estimateStandingCapacity(
                          obj.widthCm,
                          obj.heightCm,
                          obj.standingMode ?? "standing",
                        )
                      : 0;
                  const blockSlotColor =
                    obj.type === "seat_block" && obj.categoryKey
                      ? colorForSlotKey(categorySlots, obj.categoryKey)
                      : null;

                  return (
                    <g
                      key={obj.id}
                      transform={`rotate(${obj.rotationDeg} ${cx} ${cy})`}
                      onPointerDown={(e) => onPointerDownObject(e, obj)}
                      style={{ cursor: editorMode === "paint" ? "crosshair" : "move" }}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        rx={4}
                        fill={
                          obj.type === "stage"
                            ? "rgba(15,39,71,0.05)"
                            : obj.type === "standing_area"
                              ? "rgba(15,39,71,0.07)"
                              : blockSlotColor
                                ? `${blockSlotColor}22`
                                : numbered
                                  ? "rgba(20,184,166,0.1)"
                                  : "rgba(20,184,166,0.16)"
                        }
                        stroke={isSel ? "var(--tf-teal)" : "var(--tf-navy)"}
                        strokeWidth={isSel ? 2 : 1.25}
                        strokeDasharray={obj.type === "standing_area" ? "7 4" : undefined}
                      />

                      {obj.type === "stage" ? (
                        <path
                          d={`M ${cx - 10} ${cy + 4} L ${cx - 10} ${cy - 2} L ${cx - 5} ${cy + 2} L ${cx} ${cy - 6} L ${cx + 5} ${cy + 2} L ${cx + 10} ${cy - 2} L ${cx + 10} ${cy + 4} Z`}
                          fill="var(--tf-navy)"
                          opacity={0.85}
                          style={{ pointerEvents: "none" }}
                        />
                      ) : null}

                      {obj.type === "seat_block" &&
                      (obj.rows ?? 0) > 0 &&
                      (obj.seatsPerRow ?? 0) > 0
                        ? renderSeatDots(obj, x, y, w, h, {
                            slots: categorySlots,
                            interactive:
                              editorMode === "paint" &&
                              numbered &&
                              (paintTarget === "row" || paintTarget === "seat"),
                            onPaint: (rowIndex, seatIndex) =>
                              applyPaint(obj.id, rowIndex, seatIndex),
                          })
                        : null}

                      {obj.type === "standing_area" ? (
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            fill: "var(--tf-text-secondary)",
                            pointerEvents: "none",
                          }}
                        >
                          {obj.standingMode === "standing_tables" ? "Stehtische" : "Stehend"}
                          {standingCap > 0 ? ` · ca. ${standingCap}` : ""}
                        </text>
                      ) : null}

                      {/* Label tight above the block border (readable, no seat overlap) */}
                      <text
                        x={cx}
                        y={
                          obj.type === "stage"
                            ? cy + 22
                            : y - 3
                        }
                        textAnchor="middle"
                        dominantBaseline="auto"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fill: "var(--tf-navy)",
                          pointerEvents: "none",
                        }}
                      >
                        {obj.label || objectTypeLabel(obj.type)}
                        {obj.type === "seat_block"
                          ? numbered
                            ? ` · ${seats}`
                            : " · freie Platzwahl"
                          : obj.type === "standing_area" && standingCap > 0
                            ? ` · ca. ${standingCap}`
                            : ""}
                      </text>
                    </g>
                  );
                })}
            </svg>
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--tf-navy)]">Einfügen</h2>
          <button
            type="button"
            className="tf-btn w-full justify-start text-sm"
            onClick={addStage}
            disabled={hasStage}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            {hasStage ? "Bühne ist schon da" : "Bühne einfügen"}
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-primary w-full justify-start text-sm"
            onClick={addSeatBlock}
          >
            <Plus className="mr-1 inline h-4 w-4" /> Sitzblock einfügen
          </button>
          <button
            type="button"
            className="tf-btn w-full justify-start text-sm"
            onClick={addStandingArea}
          >
            <Plus className="mr-1 inline h-4 w-4" /> Stehbereich einfügen
          </button>
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Sitzblöcke können nummeriert oder freie Platzwahl sein. Stehbereiche nach Länge × Breite —
            Kapazität nur als grobe Orientierung.
          </p>

          <h3 className="pt-2 text-sm font-semibold text-[var(--tf-navy)]">Auswahl</h3>
          {selected ? (
            <div className="grid gap-2 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-[var(--tf-text-secondary)]">Bezeichnung</span>
                <input
                  className="tf-input !min-h-10"
                  value={selected.label ?? ""}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </label>

              {selected.type === "seat_block" ? (
                <div className="grid gap-2">
                  <label className="flex items-start gap-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.numberedSeats !== false}
                      onChange={(e) => updateSelected({ numberedSeats: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-[var(--tf-navy)]">
                        Plätze nummerieren
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                        An: feste Sitze (Reihe + Platz). Aus: freie Platzwahl in diesem Block —
                        unabhängig vom restlichen Event.
                      </span>
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="text-xs text-[var(--tf-text-secondary)]">Reihen</span>
                      <input
                        type="number"
                        min={1}
                        className="tf-input !min-h-10"
                        value={selected.rows ?? 1}
                        onChange={(e) => {
                          applySeatLayout(
                            Number(e.target.value) || 1,
                            selected.seatsPerRow ?? 10,
                          );
                        }}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-[var(--tf-text-secondary)]">Sitze / Reihe</span>
                      <input
                        type="number"
                        min={1}
                        className="tf-input !min-h-10"
                        value={selected.seatsPerRow ?? 1}
                        onChange={(e) => {
                          applySeatLayout(
                            selected.rows ?? 5,
                            Number(e.target.value) || 1,
                          );
                        }}
                      />
                    </label>
                    <p className="col-span-2 text-xs text-[var(--tf-text-secondary)]">
                      {selected.numberedSeats === false
                        ? `${visualSeatCountOfObject(selected)} Plätze (freie Wahl, nicht reservierbar)`
                        : `= ${seatCountOfObject(selected)} nummerierte Sitze in diesem Block`}
                    </p>
                  </div>
                </div>
              ) : null}

              {selected.type === "standing_area" ? (
                <div className="grid gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Art</span>
                    <select
                      className="tf-input !min-h-10"
                      value={selected.standingMode ?? "standing"}
                      onChange={(e) =>
                        updateSelected({
                          standingMode:
                            e.target.value === "standing_tables" ? "standing_tables" : "standing",
                        })
                      }
                    >
                      <option value="standing">Nur stehend</option>
                      <option value="standing_tables">Mit Stehtischen</option>
                    </select>
                  </label>
                  <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                    Fläche ca. {areaSqm(selected.widthCm, selected.heightCm).toFixed(1).replace(".", ",")}{" "}
                    m² · grobe Orientierung:{" "}
                    <strong className="text-[var(--tf-navy)]">
                      ca.{" "}
                      {estimateStandingCapacity(
                        selected.widthCm,
                        selected.heightCm,
                        selected.standingMode ?? "standing",
                      )}{" "}
                      Personen
                    </strong>
                    . Keine rechtliche Kapazitätsangabe — nur Schätzung für die Planung.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Breite (m)</span>
                  <input
                    type="number"
                    min={0.2}
                    step={0.05}
                    className="tf-input !min-h-10"
                    value={Number((selected.widthCm / 100).toFixed(2))}
                    onChange={(e) => {
                      const m = Number(String(e.target.value).replace(",", "."));
                      if (!Number.isFinite(m)) return;
                      updateSelected({ widthCm: Math.max(20, Math.round(m * 100)) });
                    }}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--tf-text-secondary)]">Tiefe (m)</span>
                  <input
                    type="number"
                    min={0.2}
                    step={0.05}
                    className="tf-input !min-h-10"
                    value={Number((selected.heightCm / 100).toFixed(2))}
                    onChange={(e) => {
                      const m = Number(String(e.target.value).replace(",", "."));
                      if (!Number.isFinite(m)) return;
                      updateSelected({ heightCm: Math.max(20, Math.round(m * 100)) });
                    }}
                  />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="text-xs text-[var(--tf-text-secondary)]">Drehung (°)</span>
                <input
                  type="number"
                  step={1}
                  className="tf-input !min-h-10"
                  value={selected.rotationDeg}
                  onChange={(e) => updateSelected({ rotationDeg: Number(e.target.value) || 0 })}
                />
              </label>
              <button
                type="button"
                className="tf-btn w-full !min-h-10 border border-[rgba(220,38,38,0.35)] bg-white text-sm text-[var(--danger)] hover:bg-[rgba(220,38,38,0.06)]"
                onClick={deleteSelected}
              >
                Objekt löschen
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Klicke ein Objekt an — oder füge Bühne, Sitzblock oder Stehbereich ein.
            </p>
          )}

          <h3 className="pt-2 text-sm font-semibold text-[var(--tf-navy)]">Objekte</h3>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {objects.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-2 py-1.5 text-left ${
                    o.id === selectedId
                      ? "bg-[rgba(20,184,166,0.12)] font-medium text-[var(--tf-navy)]"
                      : "hover:bg-[rgba(15,39,71,0.04)]"
                  }`}
                  onClick={() => setSelectedId(o.id)}
                >
                  {o.label || objectTypeLabel(o.type)}
                  {o.type === "seat_block"
                    ? o.numberedSeats === false
                      ? " (freie Wahl)"
                      : ` (${seatCountOfObject(o)})`
                    : o.type === "standing_area"
                      ? ` (ca. ${estimateStandingCapacity(o.widthCm, o.heightCm, o.standingMode ?? "standing")})`
                      : ""}
                </button>
              </li>
            ))}
            {objects.length === 0 ? (
              <li className="text-xs text-[var(--tf-text-secondary)]">
                Noch leer — starte mit „Bühne einfügen“.
              </li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function renderSeatDots(
  obj: VenuePlanObject,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: {
    slots: PlanCategorySlot[];
    interactive?: boolean;
    onPaint?: (rowIndex: number, seatIndex: number) => void;
  },
) {
  const rows = Math.min(obj.rows ?? 0, 24);
  const cols = Math.min(obj.seatsPerRow ?? 0, 40);
  if (rows < 1 || cols < 1) return null;
  const numbered = obj.numberedSeats !== false;
  // Tight inset — users place blocks themselves; don't waste space on empty margins.
  const padX = w * (numbered ? 0.05 : 0.03);
  const padY = h * 0.05;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const r = Math.max(1.2, Math.min(cellW, cellH) * (numbered ? 0.32 : 0.28));
  const nodes: ReactNode[] = [];
  const interactive = Boolean(opts?.interactive && numbered);

  if (numbered) {
    for (let row = 0; row < rows; row += 1) {
      const cy = y + padY + cellH * (row + 0.5);
      const rowLabel = String(row + 1);
      const fontSize = Math.max(6, Math.min(10, cellH * 0.28));
      nodes.push(
        <text
          key={`rl-${row}`}
          x={x + Math.max(6, padX * 0.55)}
          y={cy + fontSize * 0.35}
          textAnchor="middle"
          style={{
            fontSize,
            fontWeight: 600,
            fill: "var(--tf-text-secondary)",
            pointerEvents: "none",
          }}
        >
          {rowLabel}
        </text>,
        <text
          key={`rr-${row}`}
          x={x + w - Math.max(6, padX * 0.55)}
          y={cy + fontSize * 0.35}
          textAnchor="middle"
          style={{
            fontSize,
            fontWeight: 600,
            fill: "var(--tf-text-secondary)",
            pointerEvents: "none",
          }}
        >
          {rowLabel}
        </text>,
      );
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = x + padX + cellW * (col + 0.5);
      const cy = y + padY + cellH * (row + 0.5);
      const slotKey = numbered
        ? resolveSeatCategoryKey(obj, row + 1, col + 1)
        : null;
      const slotColor = colorForSlotKey(opts?.slots ?? [], slotKey);
      nodes.push(
        <circle
          key={`${row}-${col}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={slotColor ?? "var(--tf-navy)"}
          opacity={numbered ? (slotColor ? 0.92 : 0.45) : 0.28}
          style={{
            pointerEvents: interactive ? "auto" : "none",
            cursor: interactive ? "crosshair" : undefined,
          }}
          onPointerDown={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  opts?.onPaint?.(row + 1, col + 1);
                }
              : undefined
          }
        />,
      );
      if (numbered && r >= 5.5) {
        nodes.push(
          <text
            key={`n-${row}-${col}`}
            x={cx}
            y={cy + r * 0.35}
            textAnchor="middle"
            style={{
              fontSize: Math.min(9, r * 0.95),
              fontWeight: 700,
              fill: "#fff",
              pointerEvents: "none",
            }}
          >
            {col + 1}
          </text>,
        );
      }
    }
  }
  if ((obj.rows ?? 0) > rows || (obj.seatsPerRow ?? 0) > cols) {
    nodes.push(
      <text
        key="more"
        x={x + w / 2}
        y={y + h - 6}
        textAnchor="middle"
        style={{ fontSize: 9, fill: "var(--tf-text-secondary)", pointerEvents: "none" }}
      >
        Ausschnitt
      </text>,
    );
  }
  return <g style={{ pointerEvents: interactive ? "auto" : "none" }}>{nodes}</g>;
}
