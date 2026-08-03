"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Paintbrush } from "lucide-react";
import { resolveCategoryColor } from "@/lib/seating/layout-config";
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

/**
 * Assign ticket categories (by color) and lock/unlock seats or rows for gradual release.
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
  const [mode, setMode] = useState<Mode>("assign");
  const [target, setTarget] = useState<Target>("block");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setPlanObjects(parseVenuePlanObjects(data.venuePlan.objects));
        setPlanSize({
          widthCm: data.venuePlan.widthCm,
          depthCm: data.venuePlan.depthCm,
        });
      }
      const seatingCats = (data.categories as Category[] | undefined)?.filter(
        (c) => !c.freeSeating && c.categoryKind !== "standing" && c.categoryKind !== "free_choice",
      );
      if (seatingCats?.length) {
        setSelectedCategoryId((prev) => prev ?? seatingCats[0]!.id);
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
      setError("Bitte zuerst eine Kategorie wählen.");
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

  if (loading) {
    return (
      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">Wird geladen…</p>
      </section>
    );
  }

  if (!enabled) {
    return (
      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Zuerst einen Saalplan mit nummerierten Sitzblöcken zuweisen und den Sitzplatzmodus
          aktivieren. Danach kannst du Kategorien und Sperren zuordnen.
        </p>
      </section>
    );
  }

  if (seatingCategories.length === 0) {
    return (
      <section className="tf-card !p-5">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Lege zuerst Ticketkategorien mit fester Platzwahl an (nicht Stehplatz / freie Platzwahl).
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

  return (
    <section className="tf-card !p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Saalplan-Zuordnung</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Kategorien farblich zuweisen (Block, Reihe oder einzelner Platz) und Bereiche für den
            Verkauf sperren oder wieder freigeben.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
        <span className="mx-1 hidden h-8 w-px bg-[var(--tf-line)] sm:inline-block" />
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

      {mode === "assign" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {seatingCategories.map((c, i) => {
            const color = resolveCategoryColor(c.color, i);
            const active = selectedCategoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  active ? "border-[var(--tf-navy)] ring-2 ring-[rgba(15,39,71,0.15)]" : "border-[var(--tf-line)]"
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

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
                    y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 8}
                    textAnchor="middle"
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
                      y={toY(obj.yCm) - toS(obj.heightCm) / 2 - 8}
                      textAnchor="middle"
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
                  y={top - 8}
                  textAnchor="middle"
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
                      {seat.locked ? (
                        <title>
                          Gesperrt · Reihe {seat.rowLabel} Platz {seat.seatNumber}
                        </title>
                      ) : (
                        <title>
                          Reihe {seat.rowLabel} Platz {seat.seatNumber}
                        </title>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--tf-text-secondary)]">
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
          <span className="inline-block h-3 w-3 rounded-full bg-[#E2E8F0] border border-[#0F2747]" />
          Nicht zugeordnet
        </span>
      </div>
    </section>
  );
}
