"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

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

function isValidYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

function onlyDigits(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
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
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const [internal, setInternal] = useState(controlled ?? defaultValue);
  const value = controlled ?? internal;

  function setValue(next: string) {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }

  const selected = useMemo(() => parseYmd(value), [value]);

  const [day, setDay] = useState(() => (selected ? pad2(selected.getDate()) : ""));
  const [month, setMonth] = useState(() => (selected ? pad2(selected.getMonth() + 1) : ""));
  const [year, setYear] = useState(() => (selected ? String(selected.getFullYear()) : ""));
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    if (!selected) {
      if (!value) {
        setDay("");
        setMonth("");
        setYear("");
      }
      return;
    }
    setDay(pad2(selected.getDate()));
    setMonth(pad2(selected.getMonth() + 1));
    setYear(String(selected.getFullYear()));
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

  function tryCommit(partial: { day?: string; month?: string; year?: string }) {
    const d = partial.day ?? day;
    const m = partial.month ?? month;
    const y = partial.year ?? year;
    if (d.length < 1 || m.length < 1 || y.length < 4) return;
    const dn = Number(d);
    const mn = Number(m);
    const yn = Number(y);
    if (!isValidYmd(yn, mn, dn)) return;
    setValue(toYmd(yn, mn, dn));
  }

  function updateDay(raw: string) {
    const digits = onlyDigits(raw, 2);
    setDay(digits);
    if (digits.length === 2) {
      tryCommit({ day: digits });
      monthRef.current?.focus();
      monthRef.current?.select();
    }
  }

  function updateMonth(raw: string) {
    const digits = onlyDigits(raw, 2);
    setMonth(digits);
    if (digits.length === 2) {
      tryCommit({ month: digits });
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  }

  function updateYear(raw: string) {
    const digits = onlyDigits(raw, 4);
    setYear(digits);
    if (digits.length === 4) tryCommit({ year: digits });
  }

  function blurPadDay() {
    if (day.length === 1) {
      const next = pad2(Number(day) || 0);
      setDay(next);
      tryCommit({ day: next });
    }
  }

  function blurPadMonth() {
    if (month.length === 1) {
      const next = pad2(Number(month) || 0);
      setMonth(next);
      tryCommit({ month: next });
    }
  }

  function pickCalendarDay(date: Date) {
    const d = pad2(date.getDate());
    const m = pad2(date.getMonth() + 1);
    const y = String(date.getFullYear());
    setDay(d);
    setMonth(m);
    setYear(y);
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
  const cellClass =
    "h-8 w-full rounded-lg border border-[var(--tf-line)] bg-white px-1 text-center text-sm tabular-nums text-[var(--tf-navy)] outline-none transition focus:border-[var(--tf-teal)] focus:shadow-[0_0_0_2px_rgba(20,184,166,0.18)]";

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
          dayRef.current?.focus();
        }}
      >
        <label className="grid w-[2.25rem] gap-0">
          <span className="sr-only">TT</span>
          <input
            ref={dayRef}
            inputMode="numeric"
            autoComplete="off"
            placeholder="TT"
            maxLength={2}
            className={cellClass}
            value={day}
            onChange={(e) => updateDay(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={blurPadDay}
            aria-label={`${label} Tag`}
          />
        </label>
        <span className="select-none text-sm text-[var(--tf-text-secondary)]">.</span>
        <label className="grid w-[2.25rem] gap-0">
          <span className="sr-only">MM</span>
          <input
            ref={monthRef}
            inputMode="numeric"
            autoComplete="off"
            placeholder="MM"
            maxLength={2}
            className={cellClass}
            value={month}
            onChange={(e) => updateMonth(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={blurPadMonth}
            aria-label={`${label} Monat`}
          />
        </label>
        <span className="select-none text-sm text-[var(--tf-text-secondary)]">.</span>
        <label className="grid w-[3.25rem] gap-0">
          <span className="sr-only">JJJJ</span>
          <input
            ref={yearRef}
            inputMode="numeric"
            autoComplete="off"
            placeholder="JJJJ"
            maxLength={4}
            className={cellClass}
            value={year}
            onChange={(e) => updateYear(e.target.value)}
            onFocus={() => setOpen(true)}
            aria-label={`${label} Jahr`}
          />
        </label>
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
                setDay("");
                setMonth("");
                setYear("");
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
