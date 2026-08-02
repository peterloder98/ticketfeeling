"use client";

import { useState } from "react";
import { formatEuroFromCents } from "@/lib/money";

type Slice = { label: string; value: number; color: string };

type TimelinePoint = {
  date: string;
  tickets: number;
  cumulative: number;
  revenueCents: number;
};

export function SalesPieChart({
  slices,
  centerLabel,
  centerSub,
}: {
  slices: Slice[];
  centerLabel: string;
  centerSub?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const stroke = 28;

  let angle = -Math.PI / 2;
  const arcs = slices.map((slice) => {
    const portion = slice.value / total;
    const sweep = portion * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;

    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);

    // For full circle, draw two arcs
    if (portion >= 0.999) {
      return {
        ...slice,
        d: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
        portion,
      };
    }

    return {
      ...slice,
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      portion,
    };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {arcs.map((arc) => (
          <path
            key={arc.label}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-[var(--tf-navy)]"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {centerLabel}
        </text>
        {centerSub ? (
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            className="fill-[var(--tf-text-secondary)]"
            style={{ fontSize: 12 }}
          >
            {centerSub}
          </text>
        ) : null}
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[var(--tf-text)]">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: slice.color }}
              />
              {slice.label}
            </span>
            <span className="tabular-nums text-[var(--tf-text-secondary)]">
              {slice.value}
              <span className="ml-1 text-xs">
                ({Math.round((slice.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SalesTimelineChart({ points }: { points: TimelinePoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--tf-text-secondary)]">
        Noch keine Verkäufe — der Verlauf erscheint ab dem ersten Ticket.
      </p>
    );
  }

  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 36, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(...points.map((p) => p.cumulative), 1);

  const coords = points.map((p, i) => {
    const x =
      pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = pad.top + innerH - (p.cumulative / maxY) * innerH;
    return { ...p, x, y, index: i };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${pad.top + innerH} Z`;

  const labelIdx = [0, Math.floor(points.length / 2), points.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  const salePoints = coords.filter((c) => c.tickets > 0);
  const hover = hoverIdx != null ? coords[hoverIdx] : null;
  const showDots = coords.length <= 60;

  const tooltipBelow = hover ? hover.y / height < 0.38 : false;
  const tooltipLeft = hover ? Math.min(88, Math.max(12, (hover.x / width) * 100)) : 50;

  return (
    <div className="relative z-20 w-full overflow-visible">
      <div className="relative min-w-0 overflow-visible pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label="Verkaufsverlauf über die Zeit"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="tfSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t) => {
            const y = pad.top + innerH * (1 - t);
            const val = Math.round(maxY * t);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="var(--tf-line)"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[var(--tf-text-secondary)]"
                  style={{ fontSize: 11 }}
                >
                  {val}
                </text>
              </g>
            );
          })}
          <path d={area} fill="url(#tfSalesFill)" />
          <path d={line} fill="none" stroke="#14B8A6" strokeWidth={2.5} strokeLinejoin="round" />
          {showDots
            ? salePoints.map((c) => (
                <circle
                  key={`dot-${c.date}`}
                  cx={c.x}
                  cy={c.y}
                  r={hoverIdx === c.index ? 5 : 3.5}
                  fill="#0F2747"
                  className="pointer-events-none"
                />
              ))
            : null}
          {/* Larger invisible hit targets for hover */}
          {salePoints.map((c) => (
            <circle
              key={`hit-${c.date}`}
              cx={c.x}
              cy={c.y}
              r={10}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIdx(c.index)}
              onFocus={() => setHoverIdx(c.index)}
              onBlur={() => setHoverIdx(null)}
              tabIndex={0}
              role="img"
              aria-label={`${c.date}: ${c.tickets} Tickets, ${formatEuroFromCents(c.revenueCents)}`}
            />
          ))}
          {labelIdx.map((i) => {
            const p = coords[i];
            const label = new Date(`${p.date}T12:00:00`).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
            });
            return (
              <text
                key={p.date}
                x={p.x}
                y={height - 12}
                textAnchor="middle"
                className="fill-[var(--tf-text-secondary)]"
                style={{ fontSize: 11 }}
              >
                {label}
              </text>
            );
          })}
        </svg>

        {hover ? (
          <div
            className={`pointer-events-none absolute z-50 min-w-[11rem] -translate-x-1/2 rounded-xl border border-[var(--tf-line)] bg-white px-3 py-2.5 shadow-[0_12px_32px_rgba(15,39,71,0.18)] ${
              tooltipBelow
                ? "translate-y-2"
                : "-translate-y-[calc(100%+12px)]"
            }`}
            style={{
              left: `${tooltipLeft}%`,
              top: `${(hover.y / height) * 100}%`,
            }}
          >
            <p className="text-xs font-semibold text-[var(--tf-navy)]">
              {new Date(`${hover.date}T12:00:00`).toLocaleDateString("de-DE", {
                weekday: "short",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="mt-1 text-sm tabular-nums text-[var(--tf-navy)]">
              {hover.tickets} Ticket{hover.tickets === 1 ? "" : "s"}
            </p>
            <p className="text-sm font-medium tabular-nums text-[var(--tf-teal)]">
              {formatEuroFromCents(hover.revenueCents)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--tf-text-secondary)]">
              Gesamt bis dahin: {hover.cumulative}
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
        Kumulierte verkaufte Tickets seit Verkaufsstart · Hover zeigt Tageswerte
      </p>
    </div>
  );
}
