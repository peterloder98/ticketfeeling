"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Shift a datetime-local string by hours (handles day rollover). */
export function shiftDateTimeLocal(value: string, hoursDelta: number): string {
  if (!value.includes("T")) return "";
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  if (![y, m, d, h, min].every((n) => Number.isFinite(n))) return "";
  const dt = new Date(y, m - 1, d, h, min || 0, 0, 0);
  dt.setHours(dt.getHours() + hoursDelta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function parseLocal(value: string): Date | null {
  if (!value || !value.includes("T")) return null;
  const [date, time] = value.split("T");
  const [y, m, d] = (date ?? "").split("-").map(Number);
  const [h, min] = (time ?? "").split(":").map(Number);
  if (![y, m, d, h, min].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(y, m - 1, d, h, min || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toLocalValue(y: number, m: number, d: number, h: number, min: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(min)}`;
}

function isValidYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

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

function onlyDigits(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

type Props = {
  name?: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function SmartDateTimeInput({ name, label, hint, value, onChange }: Props) {
  const datePanelId = useId();
  const timePanelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => parseLocal(value), [value]);

  const [day, setDay] = useState(() => (selected ? pad2(selected.getDate()) : ""));
  const [month, setMonth] = useState(() => (selected ? pad2(selected.getMonth() + 1) : ""));
  const [year, setYear] = useState(() => (selected ? String(selected.getFullYear()) : ""));
  const [hour, setHour] = useState(() => (selected ? pad2(selected.getHours()) : "18"));
  const [minute, setMinute] = useState(() => (selected ? pad2(selected.getMinutes()) : "00"));

  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
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
    setHour(pad2(selected.getHours()));
    setMinute(pad2(selected.getMinutes()));
    setViewMonth(startOfMonth(selected));
  }, [value, selected]);

  useEffect(() => {
    if (!dateOpen && !timeOpen) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setDateOpen(false);
        setTimeOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDateOpen(false);
        setTimeOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [dateOpen, timeOpen]);

  function tryCommit(next: {
    day?: string;
    month?: string;
    year?: string;
    hour?: string;
    minute?: string;
  }) {
    const d = next.day ?? day;
    const m = next.month ?? month;
    const y = next.year ?? year;
    const h = next.hour ?? hour;
    const min = next.minute ?? minute;
    if (d.length !== 2 || m.length !== 2 || y.length !== 4 || h.length !== 2 || min.length !== 2) {
      return;
    }
    const dn = Number(d);
    const mn = Number(m);
    const yn = Number(y);
    const hn = Number(h);
    const minn = Number(min);
    if (!isValidYmd(yn, mn, dn) || hn > 23 || minn > 59) return;
    onChange(toLocalValue(yn, mn, dn, hn, minn));
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
    tryCommit({ day: d, month: m, year: y });
    setDateOpen(false);
  }

  function pickTime(h: string, min: string) {
    setHour(h);
    setMinute(min);
    tryCommit({ hour: h, minute: min });
    setTimeOpen(false);
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
    "h-11 w-full rounded-xl border border-[var(--tf-line)] bg-white text-center text-base font-semibold tabular-nums text-[var(--tf-navy)] outline-none transition focus:border-[var(--tf-teal)] focus:shadow-[0_0_0_3px_rgba(20,184,166,0.18)]";

  return (
    <div ref={rootRef} className="relative grid gap-1.5">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <span className="text-sm font-medium text-[var(--tf-navy)]">{label}</span>
      {hint ? <span className="text-xs text-[var(--tf-text-secondary)]">{hint}</span> : null}

      <div className="grid gap-2.5">
        {/* Date: TT . MM . JJJJ — dots fixed, auto-advance */}
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Datum
          </span>
          <div
            className={`flex cursor-text items-end gap-1.5 rounded-xl border bg-[#f8fafc] px-2.5 py-2 transition ${
              dateOpen
                ? "border-[var(--tf-teal)] shadow-[0_0_0_3px_rgba(20,184,166,0.18)]"
                : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
            }`}
            onMouseDown={(e) => {
              // Open calendar when clicking the row (not when focusing an input via its own click)
              const target = e.target as HTMLElement;
              if (target.tagName === "INPUT") {
                setTimeOpen(false);
                setDateOpen(true);
                if (selected) setViewMonth(startOfMonth(selected));
                return;
              }
              e.preventDefault();
              setTimeOpen(false);
              setDateOpen(true);
              if (selected) setViewMonth(startOfMonth(selected));
              dayRef.current?.focus();
            }}
          >
            <label className="grid min-w-[3rem] flex-[1.1] gap-0.5">
              <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                TT
              </span>
              <input
                ref={dayRef}
                inputMode="numeric"
                autoComplete="off"
                placeholder="TT"
                maxLength={2}
                className={cellClass}
                value={day}
                onChange={(e) => updateDay(e.target.value)}
                onFocus={() => {
                  setTimeOpen(false);
                  setDateOpen(true);
                  if (selected) setViewMonth(startOfMonth(selected));
                }}
                onBlur={blurPadDay}
                aria-label={`${label} Tag`}
              />
            </label>
            <span className="mb-2.5 select-none text-lg font-semibold text-[var(--tf-text-secondary)]">
              .
            </span>
            <label className="grid min-w-[3rem] flex-[1.1] gap-0.5">
              <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                MM
              </span>
              <input
                ref={monthRef}
                inputMode="numeric"
                autoComplete="off"
                placeholder="MM"
                maxLength={2}
                className={cellClass}
                value={month}
                onChange={(e) => updateMonth(e.target.value)}
                onFocus={() => {
                  setTimeOpen(false);
                  setDateOpen(true);
                }}
                onBlur={blurPadMonth}
                aria-label={`${label} Monat`}
              />
            </label>
            <span className="mb-2.5 select-none text-lg font-semibold text-[var(--tf-text-secondary)]">
              .
            </span>
            <label className="grid min-w-[4.25rem] flex-[1.5] gap-0.5">
              <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                JJJJ
              </span>
              <input
                ref={yearRef}
                inputMode="numeric"
                autoComplete="off"
                placeholder="JJJJ"
                maxLength={4}
                className={cellClass}
                value={year}
                onChange={(e) => updateYear(e.target.value)}
                onFocus={() => {
                  setTimeOpen(false);
                  setDateOpen(true);
                }}
                aria-label={`${label} Jahr`}
              />
            </label>
          </div>
        </div>

        {/* Time: click opens picker, digits only via picker / display */}
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Uhrzeit
          </span>
          <button
            type="button"
            className={`flex w-full max-w-[11rem] items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition ${
              timeOpen
                ? "border-[var(--tf-teal)] shadow-[0_0_0_3px_rgba(20,184,166,0.18)]"
                : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
            }`}
            aria-expanded={timeOpen}
            aria-controls={timePanelId}
            onClick={() => {
              setDateOpen(false);
              setTimeOpen((v) => !v);
            }}
          >
            <Clock className="h-4 w-4 shrink-0 text-[var(--tf-teal)]" aria-hidden />
            <span className="text-base font-semibold tabular-nums text-[var(--tf-navy)]">
              {hour}:{minute}
            </span>
          </button>
        </div>
      </div>

      {dateOpen ? (
        <div
          id={datePanelId}
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white shadow-[0_18px_40px_rgba(15,39,71,0.16)]"
          role="dialog"
          aria-label={`${label} Kalender`}
        >
          <div className="border-b border-[var(--tf-line)] bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_70%)] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-lg p-1.5 text-[var(--tf-navy)] hover:bg-[rgba(15,39,71,0.06)]"
                aria-label="Vorheriger Monat"
                onClick={() => setViewMonth(new Date(vy, vm - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold capitalize text-[var(--tf-navy)]">{monthLabel}</p>
              <button
                type="button"
                className="rounded-lg p-1.5 text-[var(--tf-navy)] hover:bg-[rgba(15,39,71,0.06)]"
                aria-label="Nächster Monat"
                onClick={() => setViewMonth(new Date(vy, vm + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="px-3 py-3">
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]"
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, idx) => {
                if (!cell) return <span key={`e-${idx}`} className="h-9" />;
                const isSelected = selected ? sameDay(cell.date, selected) : false;
                const isToday = sameDay(cell.date, today);
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    className={`h-9 rounded-lg text-sm font-medium transition ${
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
          <div className="flex justify-end border-t border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2">
            <button
              type="button"
              className="text-xs font-medium text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
              onClick={() => setDateOpen(false)}
            >
              Schließen
            </button>
          </div>
        </div>
      ) : null}

      {timeOpen ? (
        <div
          id={timePanelId}
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,18rem)] overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white shadow-[0_18px_40px_rgba(15,39,71,0.16)]"
          role="dialog"
          aria-label={`${label} Uhrzeit`}
        >
          <div className="border-b border-[var(--tf-line)] px-3 py-2.5">
            <p className="text-sm font-semibold text-[var(--tf-navy)]">Uhrzeit wählen</p>
            <p className="text-[11px] text-[var(--tf-text-secondary)]">Nur Zahlen — Stunde und Minute tippen</p>
          </div>
          <div className="grid grid-cols-2 gap-0">
            <div className="max-h-56 overflow-y-auto border-r border-[var(--tf-line)]">
              <p className="sticky top-0 bg-[#f8fafc] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                Stunde
              </p>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`flex w-full px-3 py-2 text-left text-sm tabular-nums transition ${
                    h === hour
                      ? "bg-[var(--tf-navy)] font-semibold text-white"
                      : "text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.1)]"
                  }`}
                  onClick={() => pickTime(h, minute)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="max-h-56 overflow-y-auto">
              <p className="sticky top-0 bg-[#f8fafc] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                Minute
              </p>
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`flex w-full px-3 py-2 text-left text-sm tabular-nums transition ${
                    m === minute
                      ? "bg-[var(--tf-navy)] font-semibold text-white"
                      : "text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.1)]"
                  }`}
                  onClick={() => pickTime(hour, m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2">
            <button
              type="button"
              className="tf-btn tf-btn-primary !min-h-9 !px-4 text-sm"
              onClick={() => setTimeOpen(false)}
            >
              Fertig
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
