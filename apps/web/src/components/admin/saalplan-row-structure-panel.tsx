"use client";

import { useMemo, useState } from "react";
import type { VenuePlanObject } from "@/lib/saalplan/types";
import {
  addAisleToRow,
  linkCompanionSeat,
  resolveSeatBlockRows,
  setSeatTypeInRow,
  toggleRemovedSeat,
  type PlanSeatType,
} from "@/lib/saalplan/seat-structure";
import { seatBlockAisleExtraCm } from "@/lib/saalplan/types";
import { seatBlockSizeCm } from "@/lib/saalplan/snap";

type Props = {
  selected: VenuePlanObject;
  geometryFrozen: boolean;
  onChange: (patch: Partial<VenuePlanObject>, notice?: string | null) => void;
  onConfirmStructural: (message: string) => boolean;
};

/**
 * Row / aisle / seat-type editor for a selected seat_block.
 * Keep this panel simple — not a DB UI.
 */
export function SaalplanRowStructurePanel({
  selected,
  geometryFrozen,
  onChange,
  onConfirmStructural,
}: Props) {
  const [editRow, setEditRow] = useState(1);
  const [afterSeat, setAfterSeat] = useState(1);
  const [aisleWidthM, setAisleWidthM] = useState(1.5);
  const [seatPick, setSeatPick] = useState("");

  const layouts = useMemo(() => resolveSeatBlockRows(selected), [selected]);
  const row = layouts.find((r) => r.rowIndex === editRow) ?? layouts[0];
  const rowIndex = row?.rowIndex ?? 1;

  if (selected.type !== "seat_block" || selected.numberedSeats === false) return null;

  function applyRowDefs(
    rowDefs: ReturnType<typeof addAisleToRow>,
    notice?: string | null,
  ) {
    const next = { ...selected, rowDefs };
    const cols = Math.max(
      selected.seatsPerRow ?? 1,
      ...rowDefs.map((d) => d.seatCount ?? selected.seatsPerRow ?? 1),
    );
    const size = seatBlockSizeCm(selected.rows ?? 1, cols, {
      aisleExtraCm: seatBlockAisleExtraCm(next),
    });
    onChange(
      {
        rowDefs,
        seatsPerRow: cols,
        widthCm: Math.max(selected.widthCm, size.widthCm),
      },
      notice,
    );
  }

  function addInterruption() {
    if (geometryFrozen) return;
    if (
      !onConfirmStructural(
        `Unterbrechung/Gang nach Platz ${afterSeat} in Reihe ${rowIndex} hinzufügen?`,
      )
    ) {
      return;
    }
    const widthCm = Math.max(10, Math.round(Number(aisleWidthM) * 100) || 150);
    const rowDefs = addAisleToRow(selected, rowIndex, {
      afterSeatNumber: afterSeat,
      widthCm,
    });
    applyRowDefs(rowDefs, `Gang (${(widthCm / 100).toFixed(2).replace(".", ",")} m) eingefügt.`);
  }

  function applySeatAction(action: "remove" | "restore" | PlanSeatType | "companion") {
    if (geometryFrozen) return;
    const n = Math.round(Number(seatPick));
    if (!Number.isFinite(n) || n < 1) return;
    if (action === "remove") {
      if (!onConfirmStructural(`Platz ${n} in Reihe ${rowIndex} entfernen (kein geometrischer Sitz)?`)) {
        return;
      }
      applyRowDefs(
        toggleRemovedSeat(selected, rowIndex, n, true),
        `Platz ${n} entfernt — Nummerierung bleibt.`,
      );
      return;
    }
    if (action === "restore") {
      applyRowDefs(toggleRemovedSeat(selected, rowIndex, n, false), `Platz ${n} wiederhergestellt.`);
      return;
    }
    if (action === "companion") {
      const wc = n > 1 ? n - 1 : n + 1;
      let rowDefs = setSeatTypeInRow(selected, rowIndex, n, "companion");
      rowDefs = linkCompanionSeat({ ...selected, rowDefs }, rowIndex, n, wc);
      // Ensure wheelchair neighbor typed
      rowDefs = setSeatTypeInRow({ ...selected, rowDefs }, rowIndex, wc, "wheelchair");
      applyRowDefs(rowDefs, `Platz ${n} als Begleitplatz (zu ${wc}) markiert.`);
      return;
    }
    applyRowDefs(
      setSeatTypeInRow(selected, rowIndex, n, action),
      action === "wheelchair"
        ? `Platz ${n} als Rollstuhlplatz markiert.`
        : `Platz ${n} auf Standard gesetzt.`,
    );
  }

  return (
    <div className="grid gap-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
      <p className="text-sm font-semibold text-[var(--tf-navy)]">Reihen & Unterbrechungen</p>
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Gänge teilen eine Reihe in Segmente — Bestplatz behandelt Sitze über den Gang nicht als
        Nachbarn. Entfernte Sitze (FOH/Pfeiler) zählen nicht zur Kapazität.
      </p>

      <label className="grid gap-1">
        <span className="text-xs text-[var(--tf-text-secondary)]">Reihe bearbeiten</span>
        <select
          className="tf-input !min-h-10"
          value={rowIndex}
          disabled={geometryFrozen}
          onChange={(e) => setEditRow(Number(e.target.value) || 1)}
        >
          {layouts.map((r) => (
            <option key={r.rowIndex} value={r.rowIndex}>
              Reihe {r.rowLabel} · {r.seats.length} Sitze
              {r.aisles.length ? ` · ${r.aisles.length} Gang` : ""}
            </option>
          ))}
        </select>
      </label>

      {row ? (
        <ul className="space-y-1 text-xs text-[var(--tf-text-secondary)]">
          {row.segments.map((seg) => (
            <li key={seg.segmentIndex}>
              Segment {seg.segmentIndex + 1}: Plätze {seg.seatNumbers[0]}–
              {seg.seatNumbers[seg.seatNumbers.length - 1]} ({seg.seatNumbers.length})
            </li>
          ))}
          {row.aisles.map((a) => (
            <li key={`a-${a.afterSeatNumber}`}>
              Gang nach Platz {a.afterSeatNumber}: {(a.widthCm / 100).toFixed(2).replace(".", ",")}{" "}
              m
            </li>
          ))}
          {row.removedSeatNumbers.length ? (
            <li>Entfernt: {row.removedSeatNumbers.join(", ")}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-[var(--tf-text-secondary)]">Gang nach Platz</span>
          <input
            type="number"
            min={1}
            className="tf-input !min-h-10"
            value={afterSeat}
            disabled={geometryFrozen}
            onChange={(e) => setAfterSeat(Number(e.target.value) || 1)}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-[var(--tf-text-secondary)]">Breite (m)</span>
          <input
            type="number"
            min={0.2}
            step={0.05}
            className="tf-input !min-h-10"
            value={aisleWidthM}
            disabled={geometryFrozen}
            onChange={(e) =>
              setAisleWidthM(Number(String(e.target.value).replace(",", ".")) || 1.5)
            }
          />
        </label>
      </div>
      <button
        type="button"
        className="tf-btn tf-btn-secondary !min-h-10 text-sm"
        disabled={geometryFrozen}
        onClick={addInterruption}
      >
        Unterbrechung/Gang hinzufügen
      </button>

      <div className="border-t border-[var(--tf-line)] pt-2">
        <label className="grid gap-1">
          <span className="text-xs text-[var(--tf-text-secondary)]">Platz-Nr. wählen</span>
          <input
            type="number"
            min={1}
            className="tf-input !min-h-10"
            value={seatPick}
            disabled={geometryFrozen}
            placeholder="z. B. 5"
            onChange={(e) => setSeatPick(e.target.value)}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="tf-btn !min-h-9 px-2 text-xs"
            disabled={geometryFrozen}
            onClick={() => applySeatAction("remove")}
          >
            Entfernen
          </button>
          <button
            type="button"
            className="tf-btn !min-h-9 px-2 text-xs"
            disabled={geometryFrozen}
            onClick={() => applySeatAction("restore")}
          >
            Wiederherstellen
          </button>
          <button
            type="button"
            className="tf-btn !min-h-9 px-2 text-xs"
            disabled={geometryFrozen}
            onClick={() => applySeatAction("wheelchair")}
          >
            Rollstuhl
          </button>
          <button
            type="button"
            className="tf-btn !min-h-9 px-2 text-xs"
            disabled={geometryFrozen}
            onClick={() => applySeatAction("companion")}
          >
            Begleitplatz
          </button>
          <button
            type="button"
            className="tf-btn !min-h-9 px-2 text-xs"
            disabled={geometryFrozen}
            onClick={() => applySeatAction("standard")}
          >
            Standard
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--tf-text-secondary)]">
          Entfernen ≠ Sperren: Entfernte Sitze gibt es geometrisch nicht. Sperren geschieht in der
          Event-Zuordnung.
        </p>
      </div>
    </div>
  );
}
