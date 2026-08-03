"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";
import { resolveCategoryColor } from "@/lib/seating/layout-config";

type Props = {
  map: SeatMapPayload;
  selectedIds: string[];
  onToggle: (seat: PublicSeat) => void;
  maxSelect: number;
  /** When set, only seats for this category are selectable (once assignments exist). */
  activeCategoryId?: string | null;
  /** Hint under the map, e.g. companion info */
  hint?: string | null;
};

export function SeatMap({
  map,
  selectedIds,
  onToggle,
  maxSelect,
  activeCategoryId,
  hint,
}: Props) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [zoom, setZoom] = useState(1);

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

  const pad = 48;
  const baseW = 920;
  const baseH = 660;
  const viewW = baseW;
  const viewH = baseH;
  const scale =
    Math.min((viewW - pad * 2) / map.widthCm, (viewH - pad * 2) / map.depthCm) * zoom;
  const contentW = map.widthCm * scale;
  const contentH = map.depthCm * scale;
  const offsetX = (viewW - contentW) / 2;
  const offsetY = (viewH - contentH) / 2;
  const toX = (cm: number) => offsetX + cm * scale;
  const toY = (cm: number) => offsetY + cm * scale;
  const toS = (cm: number) => cm * scale;

  function isSelectable(seat: PublicSeat) {
    if (seat.status === "taken" || seat.status === "locked" || seat.locked) return false;
    if (seat.status === "held_by_you") return true;
    if (!hasAssignments) return seat.status === "available";
    if (!activeCategoryId) return false;
    return seat.status === "available" && seat.categoryId === activeCategoryId;
  }

  function seatFill(seat: PublicSeat, isSel: boolean) {
    if (seat.status === "locked" || seat.locked) return "#CBD5E1";
    if (seat.status === "taken") return "#94A3B8";
    if (isSel || seat.status === "held_by_you") return "#14B8A6";
    if (seat.categoryId) {
      const catColor = colorByCategory.get(seat.categoryId);
      if (catColor) {
        if (hasAssignments && activeCategoryId && seat.categoryId !== activeCategoryId) {
          return fadeHex(catColor, 0.35);
        }
        return fadeHex(catColor, 0.55);
      }
    }
    return "#E2E8F0";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
        <Legend color="#14B8A6" label="Ausgewählt" />
        <Legend color="#E2E8F0" border="#0F2747" label="Frei" />
        <Legend color="#94A3B8" label="Belegt" />
        <Legend color="#CBD5E1" border="#64748B" dashed label="Gesperrt" />
        <div className="ml-auto flex items-center gap-2">
          <span className="tabular-nums">
            {selectedIds.length}/{maxSelect} · {map.availableCount} frei
          </span>
          <div className="inline-flex items-center rounded-lg border border-[var(--tf-line)] bg-white">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center disabled:opacity-40"
              disabled={zoom <= 0.75}
              onClick={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100))}
              aria-label="Verkleinern"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border-x border-[var(--tf-line)]"
              onClick={() => setZoom(1)}
              aria-label="Zoom zurücksetzen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center disabled:opacity-40"
              disabled={zoom >= 2}
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.25) * 100) / 100))}
              aria-label="Vergrößern"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-[var(--tf-line)] bg-[#eef2f7] shadow-inner">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="h-auto min-h-[340px] w-full max-h-[72vh]"
          role="img"
          aria-label={`Saalplan ${map.planName}`}
        >
          <defs>
            <pattern id="tf-seat-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(15,39,71,0.04)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={viewW} height={viewH} fill="#f8fafc" />
          <rect x={0} y={0} width={viewW} height={viewH} fill="url(#tf-seat-grid)" />
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
                  {area.estimatedCapacity > 0
                    ? ` · ca. ${area.estimatedCapacity} Pers.`
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
            const padX = w * (numbered ? 0.05 : 0.03);
            const padY = h * 0.05;
            const cols = Math.max(1, block.seatsPerRow);
            const rows = Math.max(1, block.rows);
            const cellW = (w - padX * 2) / cols;
            const cellH = (h - padY * 2) / rows;

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
                  y={top - 8}
                  textAnchor="middle"
                  style={{ fontSize: 12, fontWeight: 700, fill: "#0F2747" }}
                >
                  {block.label}
                  {!numbered ? " · freie Platzwahl" : ""}
                </text>
                {numbered
                  ? Array.from({ length: rows }, (_, ri) => {
                      const rowNum = ri + 1;
                      const cy = top + padY + cellH * (rowNum - 0.5);
                      const fontSize = Math.max(6, Math.min(10, cellH * 0.28));
                      return (
                        <g key={`row-${rowNum}`}>
                          <text
                            x={left + Math.max(6, padX * 0.55)}
                            y={cy + 3}
                            textAnchor="middle"
                            style={{ fontSize, fontWeight: 600, fill: "#64748B" }}
                          >
                            {rowNum}
                          </text>
                          <text
                            x={left + w - Math.max(6, padX * 0.55)}
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
                      const cx = left + padX + cellW * (seat.seatIndex - 0.5);
                      const cy = top + padY + cellH * (seat.rowIndex - 0.5);
                      const r = Math.max(3.5, Math.min(cellW, cellH) * 0.34);
                      const fill = seatFill(seat, isSel);
                      const stroke = locked
                        ? "#64748B"
                        : isSel || heldByYou
                          ? "#0F766E"
                          : "#0F2747";
                      const lightText = taken || isSel || heldByYou || Boolean(seat.categoryId && !locked);
                      return (
                        <g key={seat.id}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isSel ? 2.25 : locked ? 1.5 : 1}
                            strokeDasharray={locked ? "3 2" : undefined}
                            opacity={selectable || isSel || heldByYou || locked || taken ? 1 : 0.45}
                            style={{
                              cursor: selectable ? "pointer" : "not-allowed",
                              transition: "fill 120ms ease, opacity 200ms ease",
                            }}
                            onClick={() => {
                              if (selectable) onToggle(seat);
                            }}
                          >
                            <title>
                              {seat.blockLabel} · Reihe {seat.rowLabel} · Platz {seat.seatNumber}
                              {locked
                                ? " (noch nicht freigegeben)"
                                : taken
                                  ? " (belegt)"
                                  : heldByYou
                                    ? " (in deinem Warenkorb)"
                                    : !selectable && hasAssignments
                                      ? " (andere Kategorie)"
                                      : ""}
                            </title>
                          </circle>
                          {r >= 6 ? (
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

      {map.categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
          <span className="font-medium text-[var(--tf-navy)]">Kategorien</span>
          {map.categories.map((c, i) => (
            <Legend
              key={c.id}
              color={resolveCategoryColor(c.color, i)}
              label={c.name}
              emphasize={activeCategoryId === c.id}
            />
          ))}
        </div>
      ) : null}

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
  emphasize,
}: {
  color: string;
  label: string;
  border?: string;
  dashed?: boolean;
  emphasize?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        emphasize ? "font-semibold text-[var(--tf-navy)]" : ""
      }`}
    >
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{
          background: color,
          border: `1px ${dashed ? "dashed" : "solid"} ${border ?? color}`,
        }}
      />
      {label}
    </span>
  );
}
