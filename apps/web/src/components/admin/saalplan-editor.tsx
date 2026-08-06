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
import { Plus, Save, ZoomIn, ZoomOut } from "lucide-react";
import type { VenuePlanObject } from "@/lib/saalplan/types";
import {
  adaptiveMeterTickStepCm,
  areaSqm,
  cmToMetersTickLabel,
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
  pruneCategoryAssignments,
  stripPlanCategoryPaint,
} from "@/lib/saalplan/category-slots";
import {
  DEFAULT_VIEW_ZOOM,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  VIEW_ZOOM_STEP,
  clampViewZoom,
  fitViewZoom,
  readableScalePxPerCm,
} from "@/lib/saalplan/view-zoom";
import { useCanvasPan } from "@/lib/saalplan/use-canvas-pan";
import { SaalplanReturnButton } from "@/components/admin/saalplan-return-button";

type Props = {
  planId: string;
  initialName: string;
  initialWidthCm: number;
  initialDepthCm: number;
  initialObjects: VenuePlanObject[];
  saveAction: (
    formData: FormData,
  ) => Promise<void | { ok: true } | { ok: false; error: string; code?: string }>;
  /** When true, structural geometry edits are blocked (sale started / seats sold). */
  geometryFrozen?: boolean;
  geometryFrozenMessage?: string | null;
  /** Optional return path shown after save (wizard / event). */
  returnTo?: string | null;
  returnLabel?: string | null;
};

type DragState = {
  kind: "move";
  objectId: string;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
};

/** Hard caps for block layout — real halls need more than the old silent max of 80. */
const MAX_ROWS = 200;
const MAX_SEATS_PER_ROW = 200;

export function SaalplanEditor({
  planId,
  initialName,
  initialWidthCm,
  initialDepthCm,
  initialObjects,
  saveAction,
  geometryFrozen = false,
  geometryFrozenMessage = null,
  returnTo,
  returnLabel,
}: Props) {
  const [name, setName] = useState(initialName);
  const [widthCm, setWidthCm] = useState(initialWidthCm);
  const [depthCm, setDepthCm] = useState(initialDepthCm);
  const [objects, setObjects] = useState<VenuePlanObject[]>(initialObjects);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialObjects[0]?.id ?? null,
  );
  const [zoom, setZoom] = useState(DEFAULT_VIEW_ZOOM);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [viewport, setViewport] = useState({ w: 720, h: 520 });
  const [savedOnce, setSavedOnce] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { panning, isSpacePan, panHandlers } = useCanvasPan(canvasRef);
  const scaleRef = useRef(1);
  const hallRef = useRef({ widthCm: initialWidthCm, depthCm: initialDepthCm });

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const capacity = planSeatCapacity(objects);
  const standingEstimate = planStandingEstimate(objects);
  const hasStage = objects.some((o) => o.type === "stage");
  const hasSeats = capacity > 0 || objects.some((o) => o.type === "seat_block" || o.type === "standing_area");

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
  const readableScale = readableScalePxPerCm();
  const fitZoom = fitViewZoom(fitScale, readableScale);
  // 100% = readable seat labels; fit remains available via the % control.
  const scale = Math.max(0.01, readableScale * zoom);
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
    if (geometryFrozen || !selectedId) return;
    setObjects((prev) => {
      const next = prev.map((o) => (o.id === selectedId ? { ...o, ...patch } : o));
      return next;
    });
    setDirty(true);
    setMessage(notice ?? null);
  }

  /** Grow block from row/seat counts; clamp physical size to hall and surface feedback. */
  function applySeatLayout(rawRows: number, rawSeatsPerRow: number) {
    if (geometryFrozen || !selectedId) return;
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

  function deleteSelected() {
    if (geometryFrozen || !selectedId) return;
    const id = selectedId;
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedId(null);
    setDirty(true);
    setMessage(null);
  }

  function addStage() {
    if (geometryFrozen) return;
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
    if (geometryFrozen) return;
    const block = createSeatBlock(widthCm, depthCm, {
      label: nextBlockLabel(objects),
      numberedSeats: true,
    });
    markDirty([...objects, block]);
    setSelectedId(block.id);
  }

  function addStandingArea() {
    if (geometryFrozen) return;
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
      if (geometryFrozen) return;
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
  }, [selectedId, geometryFrozen]);

  function onPointerDownObject(e: React.PointerEvent, obj: VenuePlanObject) {
    // Space / Alt / middle-mouse → canvas pan, not object move.
    if (isSpacePan() || e.altKey || e.button === 1) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(obj.id);
    if (geometryFrozen || obj.locked) return;
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
    // Geometry only: never persist plan category paint / slots (incl. standing labels).
    fd.set(
      "objects",
      JSON.stringify(objects.map((o) => stripPlanCategoryPaint(pruneCategoryAssignments(o)))),
    );
    fd.set("categorySlots", JSON.stringify([]));
    startTransition(async () => {
      try {
        const result = await saveAction(fd);
        if (result && typeof result === "object" && "ok" in result && result.ok === false) {
          setMessage(result.error || "Speichern fehlgeschlagen");
          return;
        }
        setDirty(false);
        setSavedOnce(true);
        setMessage(
          geometryFrozen
            ? "Name gespeichert. Die Geometrie bleibt gesperrt, solange der Verkauf läuft."
            : "Gespeichert — Geometrie bereit. Preiskategorien und Zuordnung machst du am Event.",
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  const majorTickCm = useMemo(
    () => adaptiveMeterTickStepCm(scale, 56),
    [scale],
  );
  // Minor grid: half the major step, but never denser than 50 cm.
  const minorTickCm = Math.max(50, majorTickCm / 2);

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = 0; x <= widthCm; x += minorTickCm) {
      lines.push({
        x1: hallLeft + toPx(x),
        y1: hallTop,
        x2: hallLeft + toPx(x),
        y2: hallTop + hallH,
        major: x % majorTickCm === 0,
      });
    }
    for (let y = 0; y <= depthCm; y += minorTickCm) {
      lines.push({
        x1: hallLeft,
        y1: hallTop + toPx(y),
        x2: hallLeft + hallW,
        y2: hallTop + toPx(y),
        major: y % majorTickCm === 0,
      });
    }
    return lines;
  }, [widthCm, depthCm, hallLeft, hallTop, hallW, hallH, toPx, minorTickCm, majorTickCm]);

  const meterLabelsX = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    for (let x = 0; x <= widthCm; x += majorTickCm) {
      labels.push({
        x: hallLeft + toPx(x),
        text: cmToMetersTickLabel(x, x === 0),
      });
    }
    return labels;
  }, [widthCm, hallLeft, toPx, majorTickCm]);

  const meterLabelsY = useMemo(() => {
    const labels: { y: number; text: string }[] = [];
    for (let y = 0; y <= depthCm; y += majorTickCm) {
      labels.push({
        y: hallTop + toPx(y),
        text: cmToMetersTickLabel(y, y === 0),
      });
    }
    return labels;
  }, [depthCm, hallTop, toPx, majorTickCm]);

  return (
    <div className="space-y-4">
      {geometryFrozen ? (
        <div
          role="status"
          className="rounded-2xl border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.12)] px-4 py-3 text-sm text-[var(--tf-navy)]"
        >
          <p className="font-semibold">Saalplan-Geometrie gesperrt</p>
          <p className="mt-1 text-[var(--tf-text-secondary)]">
            {geometryFrozenMessage ||
              "Verkauf läuft oder Plätze sind verkauft/reserviert — Blöcke, Reihen und Sitze dürfen nicht mehr umgebaut werden. Name ändern und unverkaufte Plätze am Event sperren/freigeben bleibt möglich."}
          </p>
        </div>
      ) : null}

      <ol className="grid gap-2 rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm sm:grid-cols-4">
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
            title: "Speichern",
            done: !dirty && (hasStage || hasSeats),
            text: dirty ? "Noch ungespeicherte Änderungen" : "Fertig — weiter am Event",
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
              disabled={geometryFrozen}
              value={Number((widthCm / 100).toFixed(2))}
              onChange={(e) => {
                if (geometryFrozen) return;
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
              disabled={geometryFrozen}
              value={Number((depthCm / 100).toFixed(2))}
              onChange={(e) => {
                if (geometryFrozen) return;
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
          {returnTo && (!dirty || savedOnce) ? (
            <SaalplanReturnButton
              href={returnTo}
              planId={planId}
              label={returnLabel?.trim() || "Zurück zum Event"}
              className="tf-btn tf-btn-secondary !min-h-10 text-sm"
            />
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          className={`text-sm ${
            message.includes("gesperrt") || message.includes("fehlgeschlagen") || message.includes("nicht")
              ? "text-[var(--danger)]"
              : "text-[var(--tf-teal)]"
          }`}
        >
          {message}
        </p>
      ) : null}

      <p className="text-sm text-[var(--tf-text-secondary)]">
        Hier nur Geometrie: Bühne, Sitzblöcke und Stehbereiche. Preiskategorien ordnest du danach am
        Event zu.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--tf-line)] px-3 py-2">
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Ziehen am Block = verschieben · Leertaste/Alt + ziehen = Plan schieben · Entf = löschen
              {dirty ? " · ungespeichert" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
                disabled={zoom <= MIN_VIEW_ZOOM}
                onClick={() => setZoom((z) => clampViewZoom(z - VIEW_ZOOM_STEP))}
                aria-label="Verkleinern"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-xs tabular-nums hover:bg-[rgba(15,39,71,0.06)]"
                onClick={() => setZoom(DEFAULT_VIEW_ZOOM)}
                title="Standardzoom 50 %"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)] disabled:opacity-40"
                disabled={zoom >= MAX_VIEW_ZOOM}
                onClick={() => setZoom((z) => clampViewZoom(z + VIEW_ZOOM_STEP))}
                aria-label="Vergrößern"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="ml-1 rounded-md px-1.5 py-1 text-[10px] text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)]"
                onClick={() => setZoom(fitZoom)}
                title="Saal auf Fläche einpassen"
              >
                Einpassen
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className={`h-[min(72vh,640px)] w-full overflow-auto bg-[#f8fafc] ${
              panning ? "cursor-grabbing" : "cursor-grab"
            }`}
            {...panHandlers}
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
                  const labelFont = Math.max(
                    9,
                    Math.min(13, Math.min(w, h) * (obj.type === "stage" ? 0.22 : 0.14)),
                  );
                  const showStageIcon = obj.type === "stage" && h >= 36 && w >= 48;
                  const stageLabelY = showStageIcon
                    ? cy + Math.min(h * 0.28, labelFont + 10)
                    : cy + labelFont * 0.35;

                  return (
                    <g
                      key={obj.id}
                      transform={`rotate(${obj.rotationDeg} ${cx} ${cy})`}
                      data-saalplan-interactive=""
                      onPointerDown={(e) => onPointerDownObject(e, obj)}
                      style={{ cursor: "move" }}
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
                              : numbered
                                ? "rgba(20,184,166,0.1)"
                                : "rgba(20,184,166,0.16)"
                        }
                        stroke={isSel ? "var(--tf-teal)" : "var(--tf-navy)"}
                        strokeWidth={isSel ? 2 : 1.25}
                        strokeDasharray={obj.type === "standing_area" ? "7 4" : undefined}
                      />

                      {showStageIcon ? (
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
                        ? renderSeatDots(obj, x, y, w, h)
                        : null}

                      {obj.type === "standing_area" && Math.min(w, h) >= 28 ? (
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          style={{
                            fontSize: labelFont,
                            fontWeight: 600,
                            fill: "var(--tf-text-secondary)",
                            pointerEvents: "none",
                          }}
                        >
                          {obj.standingMode === "standing_tables" ? "Stehtische" : "Stehend"}
                          {standingCap > 0 ? ` · ca. ${standingCap}` : ""}
                        </text>
                      ) : null}

                      {/* Stage: label inside, scaled. Blocks: above border so seats stay clear. */}
                      {obj.type === "stage" || Math.min(w, h) >= 24 ? (
                        <text
                          x={cx}
                          y={obj.type === "stage" ? stageLabelY : y - 3}
                          textAnchor="middle"
                          dominantBaseline="auto"
                          style={{
                            fontSize: labelFont,
                            fontWeight: 700,
                            fill: "var(--tf-navy)",
                            pointerEvents: "none",
                          }}
                        >
                          {obj.label || objectTypeLabel(obj.type)}
                          {obj.type === "seat_block"
                            ? numbered
                              ? ` · ${seats}`
                              : w >= 90
                                ? " · freie Platzwahl"
                                : ""
                            : obj.type === "standing_area" && standingCap > 0
                              ? ` · ca. ${standingCap}`
                              : ""}
                        </text>
                      ) : null}
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
            disabled={geometryFrozen || hasStage}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            {hasStage ? "Bühne ist schon da" : "Bühne einfügen"}
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-primary w-full justify-start text-sm"
            onClick={addSeatBlock}
            disabled={geometryFrozen}
          >
            <Plus className="mr-1 inline h-4 w-4" /> Sitzblock einfügen
          </button>
          <button
            type="button"
            className="tf-btn w-full justify-start text-sm"
            onClick={addStandingArea}
            disabled={geometryFrozen}
          >
            <Plus className="mr-1 inline h-4 w-4" /> Stehbereich einfügen
          </button>
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Sitzblöcke: nummeriert oder freie Platzwahl. Stehbereiche: nur Geometrie (Form, grobe
            Kapazität) — keine Preiskategorie. Preise und Zuordnung legst du später am Event fest.
          </p>

          <h3 className="pt-2 text-sm font-semibold text-[var(--tf-navy)]">Auswahl</h3>
          {selected ? (
            <fieldset
              disabled={geometryFrozen}
              className={`grid gap-2 text-sm ${geometryFrozen ? "opacity-60" : ""}`}
            >
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
                    . Nur Geometrie — keine Preiskategorie. Preise und Kontingent legst du am Event fest.
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
                disabled={geometryFrozen}
              >
                Objekt löschen
              </button>
            </fieldset>
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
) {
  const rows = Math.min(obj.rows ?? 0, 24);
  const cols = Math.min(obj.seatsPerRow ?? 0, 40);
  if (rows < 1 || cols < 1) return null;
  const numbered = obj.numberedSeats !== false;
  const padX = w * (numbered ? 0.05 : 0.03);
  const padY = h * 0.05;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const r = Math.max(1.2, Math.min(cellW, cellH) * (numbered ? 0.32 : 0.28));
  const nodes: ReactNode[] = [];

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
      nodes.push(
        <circle
          key={`${row}-${col}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--tf-navy)"
          opacity={numbered ? 0.45 : 0.28}
          style={{ pointerEvents: "none" }}
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
  return <g style={{ pointerEvents: "none" }}>{nodes}</g>;
}
