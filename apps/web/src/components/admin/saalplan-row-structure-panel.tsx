"use client";

import { useMemo, useState } from "react";
import type { VenuePlanObject } from "@/lib/saalplan/types";
import {
  addAisleToBlock,
  linkCompanionSeat,
  parseBlockAisles,
  removeAisleFromBlock,
  resolveSeatBlockRows,
  setSeatTypeInRow,
  toggleRemovedSeat,
  type PlanSeatType,
  type RowAisle,
  type SeatBlockRowDef,
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
 * Gänge are block-wide (same after-seat split in every row).
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
  const blockAisles = useMemo(
    () => parseBlockAisles(selected.blockAisles),
    [selected.blockAisles],
  );
  const row = layouts.find((r) => r.rowIndex === editRow) ?? layouts[0];
  const rowIndex = row?.rowIndex ?? 1;
  const maxSeat = Math.max(1, ...layouts.map((r) => r.seatCount), selected.seatsPerRow ?? 1);

  if (selected.type !== "seat_block" || selected.numberedSeats === false) return null;

  function applyStructure(
    patch: { blockAisles?: RowAisle[]; rowDefs: SeatBlockRowDef[] },
    notice?: string | null,
  ) {
    const next = {
      ...selected,
      rowDefs: patch.rowDefs,
      blockAisles: patch.blockAisles ?? selected.blockAisles,
    };
    const cols = Math.max(
      selected.seatsPerRow ?? 1,
      ...patch.rowDefs.map((d) => d.seatCount ?? selected.seatsPerRow ?? 1),
    );
    const size = seatBlockSizeCm(selected.rows ?? 1, cols, {
      aisleExtraCm: seatBlockAisleExtraCm(next),
    });
    onChange(
      {
        rowDefs: patch.rowDefs,
        blockAisles: patch.blockAisles,
        seatsPerRow: cols,
        widthCm: Math.max(selected.widthCm, size.widthCm),
      },
      notice,
    );
  }

  function addBlockInterruption() {
    if (geometryFrozen) return;
    if (
      !onConfirmStructural(
        `Unterbrechung/Gang nach Platz ${afterSeat} in allen Reihen dieses Blocks einfügen?`,
      )
    ) {
      return;
    }
    const widthCm = Math.max(10, Math.round(Number(aisleWidthM) * 100) || 150);
    const result = addAisleToBlock(selected, {
      afterSeatNumber: afterSeat,
      widthCm,
    });
    applyStructure(
      result,
      `Gang nach Platz ${afterSeat} (${(widthCm / 100).toFixed(2).replace(".", ",")} m) im gesamten Block eingefügt.`,
    );
  }

  function removeBlockInterruption(afterSeatNumber: number) {
    if (geometryFrozen) return;
    if (
      !onConfirmStructural(
        `Gang nach Platz ${afterSeatNumber} aus dem gesamten Block entfernen?`,
      )
    ) {
      return;
    }
    applyStructure(
      removeAisleFromBlock(selected, afterSeatNumber),
      `Gang nach Platz ${afterSeatNumber} entfernt.`,
    );
  }

  function applySeatAction(action: "remove" | "restore" | PlanSeatType | "companion") {
    if (geometryFrozen) return;
    const n = Math.round(Number(seatPick));
    if (!Number.isFinite(n) || n < 1) return;
    if (action === "remove") {
      if (!onConfirmStructural(`Platz ${n} in Reihe ${rowIndex} entfernen (kein geometrischer Sitz)?`)) {
        return;
      }
      applyStructure(
        { rowDefs: toggleRemovedSeat(selected, rowIndex, n, true), blockAisles },
        `Platz ${n} entfernt — Nummerierung bleibt.`,
      );
      return;
    }
    if (action === "restore") {
      applyStructure(
        { rowDefs: toggleRemovedSeat(selected, rowIndex, n, false), blockAisles },
        `Platz ${n} wiederhergestellt.`,
      );
      return;
    }
    if (action === "companion") {
      const wc = n > 1 ? n - 1 : n + 1;
      let rowDefs = setSeatTypeInRow(selected, rowIndex, n, "companion");
      rowDefs = linkCompanionSeat({ ...selected, rowDefs }, rowIndex, n, wc);
      rowDefs = setSeatTypeInRow({ ...selected, rowDefs }, rowIndex, wc, "wheelchair");
      applyStructure(
        { rowDefs, blockAisles },
        `Platz ${n} als Begleitplatz (zu ${wc}) markiert.`,
      );
      return;
    }
    applyStructure(
      {
        rowDefs: setSeatTypeInRow(selected, rowIndex, n, action),
        blockAisles,
      },
      action === "wheelchair"
        ? `Platz ${n} als Rollstuhlplatz markiert.`
        : `Platz ${n} auf Standard gesetzt.`,
    );
  }

  const legacyRowOnlyAisles =
    row?.aisles.filter(
      (a) => !blockAisles.some((b) => b.afterSeatNumber === a.afterSeatNumber),
    ) ?? [];

  return (
    <div className="grid gap-2 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3">
      <p className="text-sm font-semibold text-[var(--tf-navy)]">Reihen & Unterbrechungen</p>
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Ein Gang gilt für den gesamten Sitzblock (gleiche Stelle in jeder Reihe). Nummerierung
        läuft weiter; Bestplatz behandelt Sitze über den Gang nicht als Nachbarn. Entfernte Sitze
        (FOH/Pfeiler) zählen nicht zur Kapazität.
      </p>

      <div className="grid gap-2 rounded-lg border border-[var(--tf-line)] bg-white/70 p-2.5">
        <p className="text-xs font-semibold text-[var(--tf-navy)]">Gänge im Block</p>
        {blockAisles.length ? (
          <ul className="space-y-1 text-xs text-[var(--tf-text-secondary)]">
            {blockAisles.map((a) => (
              <li key={`ba-${a.afterSeatNumber}`} className="flex items-center justify-between gap-2">
                <span>
                  Nach Platz {a.afterSeatNumber}:{" "}
                  {(a.widthCm / 100).toFixed(2).replace(".", ",")} m
                </span>
                <button
                  type="button"
                  className="tf-btn !min-h-8 px-2 text-xs"
                  disabled={geometryFrozen}
                  onClick={() => removeBlockInterruption(a.afterSeatNumber)}
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--tf-text-secondary)]">Noch kein Gang im Block.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--tf-text-secondary)]">Gang nach Platz</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, maxSeat - 1)}
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
          onClick={addBlockInterruption}
        >
          Gang in Block einfügen
        </button>
      </div>

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
          {legacyRowOnlyAisles.map((a) => (
            <li key={`ra-${a.afterSeatNumber}`}>
              Nur diese Reihe — Gang nach Platz {a.afterSeatNumber}:{" "}
              {(a.widthCm / 100).toFixed(2).replace(".", ",")} m
            </li>
          ))}
          {row.removedSeatNumbers.length ? (
            <li>Entfernt: {row.removedSeatNumbers.join(", ")}</li>
          ) : null}
        </ul>
      ) : null}

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
