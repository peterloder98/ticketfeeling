"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { PublicSeat, PublicStandingArea, SeatMapPayload } from "@/lib/seating/types";
import { categoryFillRgba, resolveCategoryColor } from "@/lib/seating/layout-config";
import { useCanvasPan } from "@/lib/saalplan/use-canvas-pan";
import { formatEuroFromCents } from "@/lib/money";
import { discountBadgeLabel } from "@/lib/commerce/campaign-price-ui";

/** Public buy flow: two zoom steps further out than the previous 2.25 default. */
const DEFAULT_BUY_ZOOM = 1.75;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 4;

export type SeatMapCategoryPrice = {
  id: string;
  name: string;
  priceGrossCents: number;
  listPriceGrossCents?: number;
  campaignName?: string | null;
};

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
  /** @deprecated Kept for callers; selection caps are enforced in the booking panel. */
  maxPerCategory?: number | null;
  /** @deprecated Kept for callers; free-seat count no longer shown on the map chrome. */
  availableCount?: number;
  /** Hint under the map, e.g. companion info */
  hint?: string | null;
  /** Higher default zoom for public buy flow */
  initialZoom?: number;
  /** Category prices for hover tooltips (campaign / sale aware). */
  categoryPrices?: SeatMapCategoryPrice[];
  /** e.g. „zzgl. 4 % Verwaltungsgebühr“ */
  feeSurchargeNote?: string | null;
};

type HoverTooltip = {
  x: number;
  y: number;
  lines: {
    kind: "title" | "price" | "sale" | "strike" | "fee" | "meta" | "badge" | "promo";
    text: string;
  }[];
};

export function SeatMap({
  map,
  selectedIds,
  onToggle,
  activeCategoryId,
  multiCategory = false,
  hint,
  initialZoom = DEFAULT_BUY_ZOOM,
  categoryPrices,
  feeSurchargeNote,
}: Props) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [zoom, setZoom] = useState(initialZoom);
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null);
  const [tooltipMounted, setTooltipMounted] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { panning, panHandlers } = useCanvasPan(canvasRef, { panOverInteractive: true });

  useEffect(() => {
    setTooltipMounted(true);
  }, []);

  const colorByCategory = useMemo(() => {
    const m = new Map<string, string>();
    map.categories.forEach((c, i) => {
      m.set(c.id, resolveCategoryColor(c.color, i));
    });
    return m;
  }, [map.categories]);

  const priceByCategory = useMemo(() => {
    const m = new Map<string, SeatMapCategoryPrice>();
    for (const c of categoryPrices ?? []) m.set(c.id, c);
    return m;
  }, [categoryPrices]);

  /** Once any seat is assigned, only matching-category seats sell (legacy: all unlocked). */
  const hasAssignments = useMemo(
    () => map.blocks.some((b) => b.seats.some((s) => s.categoryId)),
    [map.blocks],
  );

  // Crop the SVG to the plan geometry — no fixed 1100×780 grey sheet around it.
  const padX = 20;
  const padBottom = 20;
  // Stage centered near y≈0 can overhang above the hall; keep just enough room + block labels.
  const stageOverhangCm = map.stage
    ? Math.max(0, map.stage.heightCm / 2 - map.stage.yCm)
    : 0;
  const labelRoomCm = 18;
  const padTopCm = stageOverhangCm + labelRoomCm;
  const fitW = 1100;
  const fitH = 780;
  const fitScale = Math.min(
    (fitW - padX * 2) / map.widthCm,
    (fitH - 40) / (map.depthCm + padTopCm),
  );
  const scale = fitScale * zoom;
  const contentW = map.widthCm * scale;
  const contentH = map.depthCm * scale;
  const padTop = padTopCm * scale;
  const svgWidth = contentW + padX * 2;
  const svgHeight = contentH + padTop + padBottom;
  const offsetX = padX;
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
        const stageTop = toY(map.stage.yCm) - toS(map.stage.heightCm) / 2;
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
    if (
      seat.status === "taken" ||
      seat.status === "held" ||
      seat.status === "locked" ||
      seat.locked
    ) {
      return false;
    }
    // Already held by this cart — visible but not pickable again.
    if (seat.status === "held_by_you") return false;
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
    // Other carts' holds — solid grey, not sold X-hatch.
    if (seat.status === "held") return "#94A3B8";
    if (isSel) return "#14B8A6";
    // Soft mint — distinct from solid teal selection and from sold hatch.
    if (seat.status === "held_by_you") return "#99F6E4";
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

  function pushPriceLines(
    lines: HoverTooltip["lines"],
    categoryId: string | null | undefined,
  ) {
    if (!categoryId) return;
    const price = priceByCategory.get(categoryId);
    if (price) {
      const list = price.listPriceGrossCents ?? price.priceGrossCents;
      const unit = price.priceGrossCents;
      // Same visual language as CampaignPriceDisplay (no countdown in hover).
      if (list > unit) {
        lines.push({ kind: "strike", text: formatEuroFromCents(list) });
        const badge = discountBadgeLabel(list, unit);
        if (badge) lines.push({ kind: "badge", text: badge });
        lines.push({ kind: "sale", text: formatEuroFromCents(unit) });
        if (price.campaignName) {
          lines.push({ kind: "promo", text: price.campaignName });
        } else {
          lines.push({ kind: "meta", text: price.name });
        }
      } else {
        lines.push({
          kind: "price",
          text: `${price.name} · ${formatEuroFromCents(unit)}`,
        });
      }
      if (feeSurchargeNote) {
        lines.push({ kind: "fee", text: feeSurchargeNote });
      }
      return;
    }
    const legend = map.categories.find((c) => c.id === categoryId);
    if (legend) lines.push({ kind: "meta", text: legend.name });
  }

  function setFixedTooltip(
    clientX: number,
    clientY: number,
    lines: HoverTooltip["lines"],
  ) {
    setTooltip({
      x: clientX + 14,
      y: clientY + 14,
      lines,
    });
  }

  function buildSeatTooltip(seat: PublicSeat, clientX: number, clientY: number) {
    const lines: HoverTooltip["lines"] = [
      {
        kind: "title",
        text: `${seat.blockLabel} · Reihe ${seat.rowLabel} · Platz ${seat.seatNumber}`,
      },
    ];

    pushPriceLines(lines, seat.categoryId);

    if (seat.status === "taken") lines.push({ kind: "meta", text: "Bereits verkauft" });
    else if (seat.status === "held") lines.push({ kind: "meta", text: "Zurzeit nicht verfügbar" });
    else if (seat.status === "locked" || seat.locked) {
      lines.push({ kind: "meta", text: "Noch nicht freigegeben" });
    } else if (seat.status === "held_by_you") {
      lines.push({ kind: "meta", text: "Bereits im Warenkorb" });
    }

    setFixedTooltip(clientX, clientY, lines);
  }

  function buildStandingTooltip(
    area: PublicStandingArea,
    clientX: number,
    clientY: number,
  ) {
    const capacity = area.capacity ?? area.estimatedCapacity;
    const available =
      typeof area.availableCount === "number" ? area.availableCount : null;
    const lines: HoverTooltip["lines"] = [{ kind: "title", text: "Stehplatz" }];
    if (available != null && capacity > 0) {
      lines.push({
        kind: "meta",
        text: `Gesamtkapazität ${capacity} · ${available} verfügbar`,
      });
    } else if (capacity > 0) {
      lines.push({ kind: "meta", text: `Gesamtkapazität ${capacity}` });
    }
    pushPriceLines(lines, area.categoryId);
    setFixedTooltip(clientX, clientY, lines);
  }

  const tooltipNode =
    tooltipMounted && tooltip
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[80] max-w-[240px] rounded-lg border border-[var(--tf-line)] bg-white px-2.5 py-2 shadow-[0_8px_24px_rgba(15,39,71,0.14)]"
            style={{
              left: Math.min(tooltip.x, window.innerWidth - 248),
              top: Math.min(tooltip.y, window.innerHeight - 12),
            }}
            role="tooltip"
          >
            {(() => {
              const nodes: ReactNode[] = [];
              let i = 0;
              while (i < tooltip.lines.length) {
                const line = tooltip.lines[i]!;
                if (line.kind === "strike" || line.kind === "badge" || line.kind === "sale") {
                  const row: HoverTooltip["lines"] = [];
                  while (
                    i < tooltip.lines.length &&
                    (tooltip.lines[i]!.kind === "strike" ||
                      tooltip.lines[i]!.kind === "badge" ||
                      tooltip.lines[i]!.kind === "sale")
                  ) {
                    row.push(tooltip.lines[i]!);
                    i += 1;
                  }
                  nodes.push(
                    <div
                      key={`sale-row-${i}`}
                      className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                    >
                      {row.map((r, j) => {
                        if (r.kind === "strike") {
                          return (
                            <span
                              key={j}
                              className="text-[11px] tabular-nums text-[var(--tf-text-secondary)] line-through"
                            >
                              {r.text}
                            </span>
                          );
                        }
                        if (r.kind === "badge") {
                          return (
                            <span
                              key={j}
                              className="tf-badge tf-badge-sale !px-1.5 !py-0.5 text-[10px] font-semibold leading-none"
                            >
                              {r.text}
                            </span>
                          );
                        }
                        return (
                          <span
                            key={j}
                            className="text-xs font-bold tabular-nums text-[var(--tf-sale)]"
                          >
                            {r.text}
                          </span>
                        );
                      })}
                    </div>,
                  );
                  continue;
                }
                if (line.kind === "price") {
                  nodes.push(
                    <p
                      key={`p-${i}`}
                      className="text-xs font-semibold tabular-nums text-[var(--tf-navy)]"
                    >
                      {line.text}
                    </p>,
                  );
                } else if (line.kind === "promo") {
                  nodes.push(
                    <p
                      key={`promo-${i}`}
                      className="mt-0.5 text-[11px] font-medium text-[var(--tf-navy)]"
                    >
                      {line.text}
                    </p>,
                  );
                } else if (line.kind === "fee") {
                  nodes.push(
                    <p
                      key={`f-${i}`}
                      className="mt-0.5 text-[10px] text-[var(--tf-text-secondary)]"
                    >
                      {line.text}
                    </p>,
                  );
                } else if (line.kind === "meta") {
                  nodes.push(
                    <p
                      key={`m-${i}`}
                      className="mt-0.5 text-[11px] text-[var(--tf-text-secondary)]"
                    >
                      {line.text}
                    </p>,
                  );
                } else {
                  nodes.push(
                    <p key={`t-${i}`} className="text-[11px] font-medium text-[var(--tf-navy)]">
                      {line.text}
                    </p>,
                  );
                }
                i += 1;
              }
              return nodes;
            })()}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute right-2 top-2 z-10">
        <div className="pointer-events-auto inline-flex items-center rounded-lg border border-[var(--tf-line)] bg-white/95 shadow-sm backdrop-blur-sm">
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
      <div
        ref={canvasRef}
        className={`tf-saalplan-viewport max-h-[min(86vh,920px)] overflow-auto overscroll-none rounded-2xl border border-[var(--tf-line)] bg-white shadow-inner ${
          panning ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        style={{ touchAction: "none" }}
        {...panHandlers}
        onMouseLeave={() => {
          setTooltip(null);
        }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block h-auto max-w-full"
          role="img"
          aria-label={`Saalplan ${map.planName}`}
          style={{ touchAction: "none" }}
        >
          <defs>
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
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#ffffff" />
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
            const assignedColor = area.color
              ? resolveCategoryColor(area.color, 0)
              : null;
            const fill = assignedColor
              ? categoryFillRgba(assignedColor)
              : "rgba(15,39,71,0.06)";
            const labelSize = Math.max(11, Math.min(16, Math.min(w, h) * 0.18));
            return (
              <g
                key={area.objectId}
                transform={`rotate(${area.rotationDeg} ${toX(area.xCm)} ${toY(area.yCm)})`}
                onMouseEnter={(e) => {
                  buildStandingTooltip(area, e.clientX, e.clientY);
                }}
                onMouseMove={(e) => {
                  buildStandingTooltip(area, e.clientX, e.clientY);
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "default" }}
              >
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke="#0F2747"
                  strokeWidth={assignedColor ? 1.5 : 1.25}
                  strokeDasharray={assignedColor ? undefined : "6 4"}
                  rx={5}
                />
                <text
                  x={toX(area.xCm)}
                  y={toY(area.yCm) + labelSize * 0.35}
                  textAnchor="middle"
                  style={{
                    fontSize: labelSize,
                    fontWeight: 800,
                    fill: "#0F2747",
                    pointerEvents: "none",
                    letterSpacing: "0.02em",
                  }}
                >
                  Stehplatz
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
                      const fontSize = Math.max(7, Math.min(11, cellH * 0.32));
                      return (
                        <g key={`row-${rowNum}`}>
                          <text
                            x={left + Math.max(6, seatPadX * 0.55)}
                            y={cy + 3}
                            textAnchor="middle"
                            style={{ fontSize, fontWeight: 700, fill: "#475569" }}
                          >
                            {rowNum}
                          </text>
                          <text
                            x={left + w - Math.max(6, seatPadX * 0.55)}
                            y={cy + 3}
                            textAnchor="middle"
                            style={{ fontSize, fontWeight: 700, fill: "#475569" }}
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
                      const heldOther = seat.status === "held";
                      const locked = seat.status === "locked" || seat.locked;
                      const heldByYou = seat.status === "held_by_you";
                      const cx = left + seatPadX + cellW * (seat.seatIndex - 0.5);
                      const cy = top + seatPadY + cellH * (seat.rowIndex - 0.5);
                      const r = Math.max(4.5, Math.min(cellW, cellH) * 0.4);
                      const fill = seatFill(seat, isSel);
                      const stroke = locked
                        ? "#64748B"
                        : taken || heldOther
                          ? "#64748B"
                          : isSel
                            ? "#0F766E"
                            : heldByYou
                              ? "#0F766E"
                              : "#0F2747";
                      // White numbers only on solid teal / mint; navy on light category fills.
                      const lightNumber = isSel || heldByYou;
                      const numberSize = Math.max(8, Math.min(13, r * 1.05));
                      return (
                        <g key={seat.id} data-saalplan-interactive="">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={
                              isSel
                                ? 2.25
                                : heldByYou || locked || taken || heldOther
                                  ? 1.75
                                  : 1.25
                            }
                            strokeDasharray={locked ? "3 2" : taken ? "2 2" : undefined}
                            opacity={
                              selectable ||
                              isSel ||
                              heldByYou ||
                              locked ||
                              taken ||
                              heldOther
                                ? 1
                                : 0.45
                            }
                            style={{
                              cursor: selectable ? "pointer" : "default",
                              transition: "fill 120ms ease, opacity 200ms ease",
                            }}
                            onClick={() => {
                              if (selectable) onToggle(seat);
                            }}
                            onMouseEnter={(e) => {
                              buildSeatTooltip(seat, e.clientX, e.clientY);
                            }}
                            onMouseMove={(e) => {
                              buildSeatTooltip(seat, e.clientX, e.clientY);
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
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
                          {heldByYou && r >= 5 ? (
                            <g pointerEvents="none" aria-hidden>
                              <path
                                d={`M ${cx - r * 0.35} ${cy} L ${cx - r * 0.08} ${cy + r * 0.32} L ${cx + r * 0.4} ${cy - r * 0.28}`}
                                fill="none"
                                stroke="#0F766E"
                                strokeWidth={Math.max(1.5, r * 0.28)}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </g>
                          ) : null}
                          {r >= 5 && !taken && !heldByYou && !heldOther ? (
                            <text
                              x={cx}
                              y={cy + numberSize * 0.35}
                              textAnchor="middle"
                              style={{
                                fontSize: numberSize,
                                fontWeight: 800,
                                fill: lightNumber ? "#fff" : "#0F2747",
                                paintOrder: "stroke",
                                stroke: lightNumber
                                  ? "rgba(15,39,71,0.15)"
                                  : "rgba(255,255,255,0.85)",
                                strokeWidth: 2.5,
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

      {tooltipNode}

      {hint ? (
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">{hint}</p>
      ) : null}
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
