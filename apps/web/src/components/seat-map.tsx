"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";
import { resolveCategoryColor } from "@/lib/seating/layout-config";
import { useCanvasPan } from "@/lib/saalplan/use-canvas-pan";

/** Public buy flow: closer default than the previous 1.5× framing. */
const DEFAULT_BUY_ZOOM = 2.25;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 4;

type Props = {
  map: SeatMapPayload;
  selectedIds: string[];
  onToggle: (seat: PublicSeat) => void;
  maxSelect: number;
  /**
   * When set without multiCategory, only seats for this category are selectable
   * (once assignments exist). Ignored when multiCategory is true.
   */
  activeCategoryId?: string | null;
  /**
   * Allow picking seats from any assigned price category in one selection.
   * Other categories stay fully visible (not faded).
   */
  multiCategory?: boolean;
  /**
   * When multiCategory: show this as the per-category ticket max in the status
   * line instead of implying a single global X/Y cap (which was summing all categories).
   */
  maxPerCategory?: number | null;
  /** Override free-seat count shown in the status line (defaults to map.availableCount). */
  availableCount?: number;
  /** Hint under the map, e.g. companion info */
  hint?: string | null;
  /** Higher default zoom for public buy flow */
  initialZoom?: number;
};

export function SeatMap({
  map,
  selectedIds,
  onToggle,
  maxSelect,
  activeCategoryId,
  multiCategory = false,
  maxPerCategory = null,
  availableCount: availableCountProp,
  hint,
  initialZoom = DEFAULT_BUY_ZOOM,
}: Props) {
  const freeCount = availableCountProp ?? map.availableCount;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [zoom, setZoom] = useState(initialZoom);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { panning, panHandlers } = useCanvasPan(canvasRef, { panOverInteractive: true });

  const colorByCategory = useMemo(() => {
    const m = new Map<string, string>();
    map.categories.forEach((c, i) => {
      m.set(c.id, resolveCategoryColor(c.color, i));
    });
    return m;
  }, [map.categories]);

  /** Once any seat is assigned, only matching-category seats sell (legacy: all unlocked). */
  const hasAssignments = useMemo(
    () => map.blocks.some((b) => b.seats.some((s) => s.categoryId)),
    [map.blocks],
  );

  const padX = 48;
  const padTop = 28;
  const padBottom = 48;
  const baseW = 1100;
  const baseH = 780;
  const viewW = baseW;
  const viewH = baseH;
  const scale =
    Math.min((viewW - padX * 2) / map.widthCm, (viewH - padTop - padBottom) / map.depthCm) *
    zoom;
  const contentW = map.widthCm * scale;
  const contentH = map.depthCm * scale;
  // Top-align the plan so the stage (usually at y≈0) sits at the top of the canvas.
  const svgWidth = Math.max(viewW, contentW + padX * 2);
  const svgHeight = Math.max(viewH, contentH + padTop + padBottom);
  const offsetX = (svgWidth - contentW) / 2;
  const offsetY = padTop;
  const toX = (cm: number) => offsetX + cm * scale;
  const toY = (cm: number) => offsetY + cm * scale;
  const toS = (cm: number) => cm * scale;

  // On open / zoom change: stage near top of the visible area, plan centered horizontally.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const frame = () => {
      const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollLeft = maxX / 2;
      if (map.stage) {
        const stageTop =
          toY(map.stage.yCm) - toS(map.stage.heightCm) / 2;
        el.scrollTop = Math.max(0, stageTop - 16);
      } else {
        el.scrollTop = 0;
      }
    };
    requestAnimationFrame(frame);
    // toY/toS are stable for this render's scale; zoom + plan size drive reframing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reframe on zoom/plan geometry
  }, [zoom, map.widthCm, map.depthCm, map.stage?.xCm, map.stage?.yCm, map.stage?.heightCm, scale, offsetY]);

  function isSelectable(seat: PublicSeat) {
    if (seat.status === "taken" || seat.status === "locked" || seat.locked) return false;
    if (seat.status === "held_by_you") return true;
    if (seat.status !== "available") return false;
    if (!hasAssignments) return true;
    if (!seat.categoryId) return false;
    if (multiCategory) return true;
    if (!activeCategoryId) return false;
    return seat.categoryId === activeCategoryId;
  }

  function seatFill(seat: PublicSeat, isSel: boolean) {
    if (seat.status === "locked" || seat.locked) return "#CBD5E1";
    if (seat.status === "taken") return "url(#tf-sold-hatch)";
    if (isSel || seat.status === "held_by_you") return "#14B8A6";
    if (seat.categoryId) {
      const catColor = colorByCategory.get(seat.categoryId);
      if (catColor) {
        if (
          hasAssignments &&
          !multiCategory &&
          activeCategoryId &&
          seat.categoryId !== activeCategoryId
        ) {
          return fadeHex(catColor, 0.35);
        }
        return fadeHex(catColor, 0.55);
      }
    }
    return "#E2E8F0";
  }

  function seatTitle(seat: PublicSeat, selectable: boolean, locked: boolean, taken: boolean) {
    const base = `${seat.blockLabel} · Reihe ${seat.rowLabel} · Platz ${seat.seatNumber}`;
    if (taken) return `${base} — Bereits verkauft`;
    if (locked) return `${base} — noch nicht freigegeben`;
    if (seat.status === "held_by_you") return `${base} — in deinem Warenkorb`;
    if (!selectable && hasAssignments && !multiCategory) return `${base} — andere Kategorie`;
    if (!selectable && hasAssignments && !seat.categoryId) {
      return `${base} — keiner Preiskategorie zugeordnet`;
    }
    return base;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
        <Legend color="#14B8A6" label="Ausgewählt" />
        <Legend color="#E2E8F0" border="#0F2747" label="Frei" />
        <Legend color="#94A3B8" hatch label="Bereits verkauft" />
        <Legend color="#CBD5E1" border="#64748B" dashed label="Gesperrt" />
        <div className="ml-auto flex items-center gap-2">
          <span className="tabular-nums">
            {multiCategory
              ? maxPerCategory != null && maxPerCategory > 0
                ? `${selectedIds.length} gewählt · max. ${maxPerCategory} pro Kategorie · ${freeCount} frei`
                : `${selectedIds.length} gewählt · ${freeCount} frei`
              : `${selectedIds.length}/${maxSelect} · ${freeCount} frei`}
          </span>
          <div className="inline-flex items-center rounded-lg border border-[var(--tf-line)] bg-white">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center disabled:opacity-40"
              disabled={zoom <= MIN_ZOOM}
              onClick={() =>
                setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.25) * 100) / 100))
              }
              aria-label="Verkleinern"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border-x border-[var(--tf-line)]"
              onClick={() => setZoom(initialZoom)}
              aria-label="Zoom zurücksetzen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center disabled:opacity-40"
              disabled={zoom >= MAX_ZOOM}
              onClick={() =>
                setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.25) * 100) / 100))
              }
              aria-label="Vergrößern"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--tf-text-secondary)]">
        Ziehe mit der Hand über den Saalplan, um ihn zu verschieben — kurze Tipps wählen Plätze.
      </p>

      <div
        ref={canvasRef}
        className={`max-h-[78vh] overflow-auto rounded-2xl border border-[var(--tf-line)] bg-[#eef2f7] shadow-inner ${
          panning ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        {...panHandlers}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block min-h-[480px] w-full min-w-[920px]"
          role="img"
          aria-label={`Saalplan ${map.planName}`}
          style={{ touchAction: "none" }}
        >
          <defs>
            <pattern id="tf-seat-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(15,39,71,0.04)" strokeWidth="1" />
            </pattern>
            <pattern
              id="tf-sold-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#94A3B8" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#64748B" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#f8fafc" />
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#tf-seat-grid)" />
          <rect
            x={toX(0)}
            y={toY(0)}
            width={toS(map.widthCm)}
            height={toS(map.depthCm)}
            fill="#ffffff"
            stroke="#0F2747"
            strokeWidth={1.5}
            rx={6}
          />

          {map.stage ? (
            <g
              transform={`rotate(${map.stage.rotationDeg} ${toX(map.stage.xCm)} ${toY(map.stage.yCm)})`}
            >
              <rect
                x={toX(map.stage.xCm) - toS(map.stage.widthCm) / 2}
                y={toY(map.stage.yCm) - toS(map.stage.heightCm) / 2}
                width={toS(map.stage.widthCm)}
                height={toS(map.stage.heightCm)}
                fill="rgba(15,39,71,0.1)"
                stroke="#0F2747"
                strokeWidth={1.5}
                rx={5}
              />
              <text
                x={toX(map.stage.xCm)}
                y={toY(map.stage.yCm) + 5}
                textAnchor="middle"
                style={{
                  fontSize: Math.max(11, Math.min(16, toS(map.stage.heightCm) * 0.35)),
                  fontWeight: 800,
                  fill: "#0F2747",
                  letterSpacing: "0.06em",
                }}
              >
                {(map.stage.label || "Bühne").toUpperCase()}
              </text>
            </g>
          ) : null}

          {map.standingAreas?.map((area) => {
            const left = toX(area.xCm) - toS(area.widthCm) / 2;
            const top = toY(area.yCm) - toS(area.heightCm) / 2;
            const w = toS(area.widthCm);
            const h = toS(area.heightCm);
            return (
              <g
                key={area.objectId}
                transform={`rotate(${area.rotationDeg} ${toX(area.xCm)} ${toY(area.yCm)})`}
              >
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  fill="rgba(15,39,71,0.06)"
                  stroke="#0F2747"
                  strokeWidth={1.25}
                  strokeDasharray="6 4"
                  rx={5}
                />
                <text
                  x={toX(area.xCm)}
                  y={top - 8}
                  textAnchor="middle"
                  style={{ fontSize: 12, fontWeight: 700, fill: "#0F2747" }}
                >
                  {area.label}
                  {(area.capacity ?? area.estimatedCapacity) > 0
                    ? ` · ${area.capacity ?? area.estimatedCapacity} Plätze`
                    : ""}
                </text>
                <text
                  x={toX(area.xCm)}
                  y={toY(area.yCm) + 4}
                  textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 600, fill: "#64748B", pointerEvents: "none" }}
                >
                  {area.standingMode === "standing_tables" ? "Stehtische" : "Stehplatz"}
                </text>
              </g>
            );
          })}

          {map.blocks.map((block) => {
            const left = toX(block.xCm) - toS(block.widthCm) / 2;
            const top = toY(block.yCm) - toS(block.heightCm) / 2;
            const w = toS(block.widthCm);
            const h = toS(block.heightCm);
            const numbered = block.numberedSeats !== false;
            const seatPadX = w * (numbered ? 0.05 : 0.03);
            const seatPadY = h * 0.05;
            const cols = Math.max(1, block.seatsPerRow);
            const rows = Math.max(1, block.rows);
            const cellW = (w - seatPadX * 2) / cols;
            const cellH = (h - seatPadY * 2) / rows;

            return (
              <g
                key={block.objectId}
                transform={`rotate(${block.rotationDeg} ${toX(block.xCm)} ${toY(block.yCm)})`}
              >
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  fill={numbered ? "rgba(20,184,166,0.05)" : "rgba(20,184,166,0.12)"}
                  stroke="#0F2747"
                  strokeWidth={1}
                  rx={5}
                />
                <text
                  x={toX(block.xCm)}
                  y={top - 3}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  style={{ fontSize: 12, fontWeight: 700, fill: "#0F2747" }}
                >
                  {block.label}
                  {!numbered ? " · freie Platzwahl" : ""}
                </text>
                {numbered
                  ? Array.from({ length: rows }, (_, ri) => {
                      const rowNum = ri + 1;
                      const cy = top + seatPadY + cellH * (rowNum - 0.5);
                      const fontSize = Math.max(6, Math.min(10, cellH * 0.28));
                      return (
                        <g key={`row-${rowNum}`}>
                          <text
                            x={left + Math.max(6, seatPadX * 0.55)}
                            y={cy + 3}
                            textAnchor="middle"
                            style={{ fontSize, fontWeight: 600, fill: "#64748B" }}
                          >
                            {rowNum}
                          </text>
                          <text
                            x={left + w - Math.max(6, seatPadX * 0.55)}
                            y={cy + 3}
                            textAnchor="middle"
                            style={{ fontSize, fontWeight: 600, fill: "#64748B" }}
                          >
                            {rowNum}
                          </text>
                        </g>
                      );
                    })
                  : null}
                {numbered
                  ? block.seats.map((seat) => {
                      const isSel = selected.has(seat.id);
                      const selectable = isSelectable(seat);
                      const taken = seat.status === "taken";
                      const locked = seat.status === "locked" || seat.locked;
                      const heldByYou = seat.status === "held_by_you";
                      const cx = left + seatPadX + cellW * (seat.seatIndex - 0.5);
                      const cy = top + seatPadY + cellH * (seat.rowIndex - 0.5);
                      const r = Math.max(3.5, Math.min(cellW, cellH) * 0.34);
                      const fill = seatFill(seat, isSel);
                      const stroke = locked
                        ? "#64748B"
                        : taken
                          ? "#64748B"
                          : isSel || heldByYou
                            ? "#0F766E"
                            : "#0F2747";
                      const lightText =
                        (taken || isSel || heldByYou || Boolean(seat.categoryId && !locked)) &&
                        !taken;
                      return (
                        <g key={seat.id} data-saalplan-interactive="">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isSel ? 2.25 : locked || taken ? 1.5 : 1}
                            strokeDasharray={locked ? "3 2" : taken ? "2 2" : undefined}
                            opacity={
                              selectable || isSel || heldByYou || locked || taken ? 1 : 0.45
                            }
                            style={{
                              cursor: selectable ? "pointer" : "not-allowed",
                              transition: "fill 120ms ease, opacity 200ms ease",
                            }}
                            onClick={() => {
                              if (selectable) onToggle(seat);
                            }}
                          >
                            <title>{seatTitle(seat, selectable, locked, taken)}</title>
                          </circle>
                          {taken && r >= 5 ? (
                            <g pointerEvents="none" opacity={0.9}>
                              <line
                                x1={cx - r * 0.45}
                                y1={cy - r * 0.45}
                                x2={cx + r * 0.45}
                                y2={cy + r * 0.45}
                                stroke="#475569"
                                strokeWidth={Math.max(1.25, r * 0.22)}
                                strokeLinecap="round"
                              />
                              <line
                                x1={cx + r * 0.45}
                                y1={cy - r * 0.45}
                                x2={cx - r * 0.45}
                                y2={cy + r * 0.45}
                                stroke="#475569"
                                strokeWidth={Math.max(1.25, r * 0.22)}
                                strokeLinecap="round"
                              />
                            </g>
                          ) : null}
                          {r >= 6 && !taken ? (
                            <text
                              x={cx}
                              y={cy + 3}
                              textAnchor="middle"
                              style={{
                                fontSize: Math.min(10, r * 0.95),
                                fontWeight: 700,
                                fill: lightText && !locked ? "#fff" : "#0F2747",
                                pointerEvents: "none",
                              }}
                            >
                              {seat.seatNumber}
                            </text>
                          ) : null}
                        </g>
                      );
                    })
                  : (
                    <text
                      x={toX(block.xCm)}
                      y={toY(block.yCm) + 4}
                      textAnchor="middle"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        fill: "#0F766E",
                        pointerEvents: "none",
                      }}
                    >
                      Freie Platzwahl
                    </text>
                  )}
              </g>
            );
          })}
        </svg>
      </div>

      {hint ? <p className="text-sm text-[var(--tf-text-secondary)]">{hint}</p> : null}
    </div>
  );
}

function fadeHex(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function Legend({
  color,
  label,
  border,
  dashed,
  hatch,
}: {
  color: string;
  label: string;
  border?: string;
  dashed?: boolean;
  hatch?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="relative inline-block h-3 w-3 overflow-hidden rounded-full"
        style={{
          background: hatch
            ? `repeating-linear-gradient(-45deg, #CBD5E1, #CBD5E1 1px, ${color} 1px, ${color} 3px)`
            : color,
          border: `1px ${dashed || hatch ? "dashed" : "solid"} ${border ?? (hatch ? "#64748B" : color)}`,
        }}
      />
      {label}
    </span>
  );
}
