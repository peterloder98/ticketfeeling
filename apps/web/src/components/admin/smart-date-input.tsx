"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatDateDraft,
  isValidYmd,
  pad2,
  parseDateDraftLoose,
  sanitizeDateDraft,
} from "@/lib/admin/smart-datetime-draft";

function parseYmd(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function selectAllSoon(el: HTMLInputElement | null) {
  if (!el) return;
  el.select();
  window.requestAnimationFrame(() => el.select());
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

type Props = {
  name?: string;
  label: string;
  hint?: string;
  /** Controlled YYYY-MM-DD */
  value?: string;
  /** Uncontrolled initial YYYY-MM-DD */
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
};

/** Modern date-only picker (TT.MM.JJJJ + calendar). No native browser calendar. */
export function SmartDateInput({
  name,
  label,
  hint,
  value: controlled,
  defaultValue = "",
  onChange,
}: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);

  const [internal, setInternal] = useState(controlled ?? defaultValue);
  const value = controlled ?? internal;

  function setValue(next: string) {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }

  const selected = useMemo(() => parseYmd(value), [value]);
  const committedDate = selected
    ? formatDateDraft(selected.getFullYear(), selected.getMonth() + 1, selected.getDate())
    : "";

  const [dateDraft, setDateDraft] = useState(committedDate);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    if (focusedRef.current) return;
    if (!selected) {
      if (!value) setDateDraft("");
      return;
    }
    setDateDraft(
      formatDateDraft(selected.getFullYear(), selected.getMonth() + 1, selected.getDate()),
    );
    setViewMonth(startOfMonth(selected));
  }, [value, selected]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function blurDate() {
    const parsed = parseDateDraftLoose(dateDraft);
    if (parsed && isValidYmd(parsed.year, parsed.month, parsed.day)) {
      const padded = formatDateDraft(parsed.year, parsed.month, parsed.day);
      setDateDraft(padded);
      setValue(toYmd(parsed.year, parsed.month, parsed.day));
    } else if (selected) {
      setDateDraft(committedDate);
    } else if (!dateDraft.trim()) {
      setValue("");
    }
    setFocused(false);
  }

  function pickCalendarDay(date: Date) {
    const padded = formatDateDraft(date.getFullYear(), date.getMonth() + 1, date.getDate());
    setDateDraft(padded);
    setFocused(false);
    setValue(toYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()));
    setOpen(false);
  }

  const vy = viewMonth.getFullYear();
  const vm = viewMonth.getMonth();
  const firstDow = mondayIndex(new Date(vy, vm, 1));
  const totalDays = daysInMonth(vy, vm);
  const cells: Array<{ day: number; date: Date } | null> = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= totalDays; d += 1) cells.push({ day: d, date: new Date(vy, vm, d) });
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = viewMonth.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const fieldClass =
    "h-9 w-full rounded-lg border border-[var(--tf-line)] bg-white px-2 text-sm tabular-nums text-[var(--tf-navy)] outline-none transition focus:border-[var(--tf-teal)] focus:shadow-[0_0_0_2px_rgba(20,184,166,0.18)]";

  return (
    <div ref={rootRef} className="relative grid gap-1">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <span className="text-sm font-medium text-[var(--tf-navy)]">{label}</span>
      {hint ? <span className="text-xs text-[var(--tf-text-secondary)]">{hint}</span> : null}

      <div
        className={`flex cursor-text items-center gap-1 rounded-lg border bg-[#f8fafc] px-1.5 py-1 transition ${
          open
            ? "border-[var(--tf-teal)] shadow-[0_0_0_2px_rgba(20,184,166,0.18)]"
            : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
        }`}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "INPUT") {
            setOpen(true);
            return;
          }
          e.preventDefault();
          setOpen(true);
          dateRef.current?.focus();
          selectAllSoon(dateRef.current);
        }}
      >
        <input
          ref={dateRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="TT.MM.JJJJ"
          className={fieldClass}
          value={dateDraft}
          onChange={(e) => setDateDraft(sanitizeDateDraft(e.target.value))}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
            if (committedDate) setDateDraft(committedDate);
            selectAllSoon(dateRef.current);
          }}
          onMouseUp={(e) => {
            if (focusedRef.current && dateRef.current === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onBlur={blurDate}
          aria-label={`${label} Datum`}
        />
      </div>

      {open ? (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,18.5rem)] overflow-hidden rounded-xl border border-[var(--tf-line)] bg-white shadow-[0_18px_40px_rgba(15,39,71,0.16)]"
          role="dialog"
          aria-label={`${label} Kalender`}
        >
          <div className="border-b border-[var(--tf-line)] bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_70%)] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-lg p-1 text-[var(--tf-navy)] hover:bg-[rgba(15,39,71,0.06)]"
                aria-label="Vorheriger Monat"
                onClick={() => setViewMonth(new Date(vy, vm - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold capitalize text-[var(--tf-navy)]">{monthLabel}</p>
              <button
                type="button"
                className="rounded-lg p-1 text-[var(--tf-navy)] hover:bg-[rgba(15,39,71,0.06)]"
                aria-label="Nächster Monat"
                onClick={() => setViewMonth(new Date(vy, vm + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="px-2.5 py-2">
            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]"
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, idx) => {
                if (!cell) return <span key={`e-${idx}`} className="h-8" />;
                const isSelected = selected ? sameDay(cell.date, selected) : false;
                const isToday = sameDay(cell.date, today);
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    className={`h-8 rounded-md text-sm font-medium transition ${
                      isSelected
                        ? "bg-[var(--tf-navy)] text-white shadow-sm"
                        : isToday
                          ? "bg-[rgba(20,184,166,0.14)] text-[var(--tf-navy)]"
                          : "text-[var(--tf-navy)] hover:bg-[rgba(15,39,71,0.06)]"
                    }`}
                    onClick={() => pickCalendarDay(cell.date)}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-1.5">
            <button
              type="button"
              className="text-xs font-medium text-[var(--tf-teal)] hover:underline"
              onClick={() => pickCalendarDay(today)}
            >
              Heute
            </button>
            <button
              type="button"
              className="text-xs font-medium text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
              onClick={() => {
                setValue("");
                setDateDraft("");
                setFocused(false);
                setOpen(false);
              }}
            >
              Leeren
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
