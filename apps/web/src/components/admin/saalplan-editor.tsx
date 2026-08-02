"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Plus, Save, ZoomIn, ZoomOut } from "lucide-react";
import type { VenuePlanObject } from "@/lib/saalplan/types";
import {
  cmToMetersLabel,
  objectTypeLabel,
  planSeatCapacity,
  seatCountOfObject,
} from "@/lib/saalplan/types";
import {
  createSeatBlock,
  createStage,
  nextBlockLabel,
  seatBlockSizeCm,
  snapObjectCenter,
  type SnapGuide,
} from "@/lib/saalplan/snap";

type Props = {
  planId: string;
  initialName: string;
  initialWidthCm: number;
  initialDepthCm: number;
  initialObjects: VenuePlanObject[];
  saveAction: (formData: FormData) => Promise<void>;
};

type DragMode =
  | { kind: "move"; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: "resize";
      corner: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: VenuePlanObject;
    }
  | null;

const PAD = 48;

export function SaalplanEditor({
  planId,
  initialName,
  initialWidthCm,
  initialDepthCm,
  initialObjects,
  saveAction,
}: Props) {
  const [name, setName] = useState(initialName);
  const [widthCm, setWidthCm] = useState(initialWidthCm);
  const [depthCm, setDepthCm] = useState(initialDepthCm);
  const [objects, setObjects] = useState<VenuePlanObject[]>(initialObjects);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialObjects[0]?.id ?? null,
  );
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragRef = useRef<DragMode>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const capacity = planSeatCapacity(objects);
  const hasStage = objects.some((o) => o.type === "stage");
  const hasSeats = capacity > 0;

  const viewW = 900;
  const viewH = 620;
  const scale = useMemo(() => {
    const availW = viewW - PAD * 2;
    const availH = viewH - PAD * 2;
    const s = Math.min(availW / widthCm, availH / depthCm) * zoom;
    return Math.max(0.05, s);
  }, [widthCm, depthCm, zoom]);

  const toPx = useCallback((cm: number) => cm * scale, [scale]);
  const hallLeft = PAD;
  const hallTop = PAD;
  const hallW = toPx(widthCm);
  const hallH = toPx(depthCm);

  function markDirty(next: VenuePlanObject[]) {
    setObjects(next);
    setDirty(true);
    setMessage(null);
  }

  function updateSelected(patch: Partial<VenuePlanObject>) {
    if (!selectedId) return;
    markDirty(objects.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)));
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
    });
    markDirty([...objects, block]);
    setSelectedId(block.id);
  }

  function onPointerDownObject(e: React.PointerEvent, obj: VenuePlanObject) {
    e.stopPropagation();
    setSelectedId(obj.id);
    if (obj.locked) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      origX: obj.xCm,
      origY: obj.yCm,
    };
  }

  function onPointerDownResize(
    e: React.PointerEvent,
    corner: "nw" | "ne" | "sw" | "se",
    obj: VenuePlanObject,
  ) {
    e.stopPropagation();
    setSelectedId(obj.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: "resize",
      corner,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...obj },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !selectedId) return;
    const dxCm = (e.clientX - drag.startX) / scale;
    const dyCm = (e.clientY - drag.startY) / scale;

    if (drag.kind === "move") {
      setObjects((prev) => {
        const current = prev.find((o) => o.id === selectedId);
        const snapped = snapObjectCenter({
          xCm: drag.origX + dxCm,
          yCm: drag.origY + dyCm,
          widthCm: current?.widthCm ?? 100,
          heightCm: current?.heightCm ?? 100,
          hallWidthCm: widthCm,
          hallDepthCm: depthCm,
        });
        setGuides(snapped.guides);
        return prev.map((o) =>
          o.id === selectedId ? { ...o, xCm: snapped.xCm, yCm: snapped.yCm } : o,
        );
      });
      setDirty(true);
      setMessage(null);
    } else if (drag.kind === "resize") {
      const o = drag.orig;
      const signX = drag.corner.includes("e") ? 1 : -1;
      const signY = drag.corner.includes("s") ? 1 : -1;
      const w = Math.max(40, o.widthCm + signX * dxCm * 2);
      const h = Math.max(40, o.heightCm + signY * dyCm * 2);
      let cx = o.xCm + (signX * (w - o.widthCm)) / 2;
      let cy = o.yCm + (signY * (h - o.heightCm)) / 2;
      const halfW = w / 2;
      const halfH = h / 2;
      cx = Math.min(widthCm - halfW, Math.max(halfW, cx));
      cy = Math.min(depthCm - halfH, Math.max(halfH, cy));
      setGuides([]);
      setObjects((prev) =>
        prev.map((obj) =>
          obj.id === selectedId
            ? { ...obj, widthCm: w, heightCm: h, xCm: cx, yCm: cy }
            : obj,
        ),
      );
      setDirty(true);
      setMessage(null);
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    setGuides([]);
  }

  function save() {
    const fd = new FormData();
    fd.set("planId", planId);
    fd.set("name", name);
    fd.set("widthCm", String(widthCm));
    fd.set("depthCm", String(depthCm));
    fd.set("objects", JSON.stringify(objects));
    startTransition(async () => {
      try {
        await saveAction(fd);
        setDirty(false);
        setMessage("Gespeichert — der Plan ist bereit für Events.");
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
      {/* Guided steps */}
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
            text: "Einfügen, ziehen, Größe anpassen",
          },
          {
            n: 3,
            title: "Sitzblöcke",
            done: hasSeats,
            text: "Reihen × Sitze — Kapazität zählt mit",
          },
          {
            n: 4,
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
            Kapazität: {capacity} Sitze
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

      <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
        <div className="overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--tf-line)] px-3 py-2">
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Ziehen = verschieben · Ecken = Größe · Teal-Linien = zentriert
              {dirty ? " · ungespeichert" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)]"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                aria-label="Verkleinern"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[3rem] text-center text-xs tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[rgba(15,39,71,0.06)]"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
                aria-label="Vergrößern"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="h-[min(70vh,620px)] w-full touch-none select-none bg-[#f8fafc]"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerDown={() => setSelectedId(null)}
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
              fill="rgba(255,255,255,0.85)"
              stroke="var(--tf-navy)"
              strokeWidth={1.5}
              rx={2}
            />

            {meterLabelsX.map((l) => (
              <text
                key={`x-${l.text}-${l.x}`}
                x={l.x}
                y={PAD - 14}
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
                x={PAD - 8}
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
                const seats = seatCountOfObject(obj);
                return (
                  <g
                    key={obj.id}
                    transform={`rotate(${obj.rotationDeg} ${cx} ${cy})`}
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
                          : "rgba(20,184,166,0.1)"
                      }
                      stroke={isSel ? "var(--tf-teal)" : "var(--tf-navy)"}
                      strokeWidth={isSel ? 2 : 1.25}
                    />

                    {obj.type === "stage" ? (
                      <path
                        d={`M ${cx - 10} ${cy + 4} L ${cx - 10} ${cy - 2} L ${cx - 5} ${cy + 2} L ${cx} ${cy - 6} L ${cx + 5} ${cy + 2} L ${cx + 10} ${cy - 2} L ${cx + 10} ${cy + 4} Z`}
                        fill="var(--tf-navy)"
                        opacity={0.85}
                      />
                    ) : null}

                    {obj.type === "seat_block" && (obj.rows ?? 0) > 0 && (obj.seatsPerRow ?? 0) > 0
                      ? renderSeatDots(obj, x, y, w, h)
                      : null}

                    <text
                      x={cx}
                      y={
                        obj.type === "stage"
                          ? cy + 22
                          : cy + (obj.type === "seat_block" ? h * 0.05 + 4 : 4)
                      }
                      textAnchor="middle"
                      style={{ fontSize: 11, fontWeight: 600, fill: "var(--tf-navy)" }}
                    >
                      {obj.label || objectTypeLabel(obj.type)}
                      {obj.type === "seat_block" ? ` · ${seats}` : ""}
                    </text>

                    {isSel
                      ? (["nw", "ne", "sw", "se"] as const).map((corner) => {
                          const hx = corner.includes("w") ? x : x + w;
                          const hy = corner.includes("n") ? y : y + h;
                          return (
                            <circle
                              key={corner}
                              cx={hx}
                              cy={hy}
                              r={5}
                              fill="var(--tf-teal)"
                              stroke="white"
                              strokeWidth={1.5}
                              style={{ cursor: `${corner}-resize` }}
                              onPointerDown={(e) => onPointerDownResize(e, corner, obj)}
                            />
                          );
                        })
                      : null}
                  </g>
                );
              })}
          </svg>
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
          <button type="button" className="tf-btn tf-btn-secondary w-full justify-start text-sm" onClick={addSeatBlock}>
            <Plus className="mr-1 inline h-4 w-4" /> Sitzblock einfügen
          </button>
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Tipp: Beim Ziehen erscheinen Hilfslinien in der Mitte — dort rastet das Objekt ein.
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
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Reihen</span>
                    <input
                      type="number"
                      min={1}
                      max={80}
                      className="tf-input !min-h-10"
                      value={selected.rows ?? 1}
                      onChange={(e) => {
                        const rows = Math.max(1, Math.round(Number(e.target.value) || 1));
                        const seatsPerRow = selected.seatsPerRow ?? 10;
                        const size = seatBlockSizeCm(rows, seatsPerRow);
                        updateSelected({
                          rows,
                          ...size,
                          widthCm: Math.min(size.widthCm, widthCm * 0.95),
                          heightCm: Math.min(size.heightCm, depthCm * 0.7),
                        });
                      }}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--tf-text-secondary)]">Sitze / Reihe</span>
                    <input
                      type="number"
                      min={1}
                      max={80}
                      className="tf-input !min-h-10"
                      value={selected.seatsPerRow ?? 1}
                      onChange={(e) => {
                        const seatsPerRow = Math.max(1, Math.round(Number(e.target.value) || 1));
                        const rows = selected.rows ?? 5;
                        const size = seatBlockSizeCm(rows, seatsPerRow);
                        updateSelected({
                          seatsPerRow,
                          ...size,
                          widthCm: Math.min(size.widthCm, widthCm * 0.95),
                          heightCm: Math.min(size.heightCm, depthCm * 0.7),
                        });
                      }}
                    />
                  </label>
                  <p className="col-span-2 text-xs text-[var(--tf-text-secondary)]">
                    = {seatCountOfObject(selected)} Sitze in diesem Block
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
                className="text-left text-xs text-[var(--danger)] underline"
                onClick={() => {
                  markDirty(objects.filter((o) => o.id !== selected.id));
                  setSelectedId(null);
                }}
              >
                Objekt löschen
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--tf-text-secondary)]">
              Klicke ein Objekt an — oder füge links Bühne / Sitzblock ein.
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
                  {o.type === "seat_block" ? ` (${seatCountOfObject(o)})` : ""}
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

function renderSeatDots(obj: VenuePlanObject, x: number, y: number, w: number, h: number) {
  const rows = Math.min(obj.rows ?? 0, 24);
  const cols = Math.min(obj.seatsPerRow ?? 0, 40);
  if (rows < 1 || cols < 1) return null;
  const padX = w * 0.08;
  const padY = h * 0.14;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const r = Math.max(1.2, Math.min(cellW, cellH) * 0.28);
  const nodes: ReactNode[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      nodes.push(
        <circle
          key={`${row}-${col}`}
          cx={x + padX + cellW * (col + 0.5)}
          cy={y + padY + cellH * (row + 0.5)}
          r={r}
          fill="var(--tf-navy)"
          opacity={0.35}
        />,
      );
    }
  }
  if ((obj.rows ?? 0) > rows || (obj.seatsPerRow ?? 0) > cols) {
    nodes.push(
      <text
        key="more"
        x={x + w / 2}
        y={y + h - 6}
        textAnchor="middle"
        style={{ fontSize: 9, fill: "var(--tf-text-secondary)" }}
      >
        Ausschnitt
      </text>,
    );
  }
  return <g>{nodes}</g>;
}
