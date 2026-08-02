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
const DEFAULT_HOUR = "18";
const DEFAULT_MINUTE = "00";

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
  const hourBtnRef = useRef<HTMLButtonElement>(null);
  const minuteBtnRef = useRef<HTMLButtonElement>(null);

  const selected = useMemo(() => parseLocal(value), [value]);
  const hasValue = Boolean(selected);

  const [day, setDay] = useState(() => (selected ? pad2(selected.getDate()) : ""));
  const [month, setMonth] = useState(() => (selected ? pad2(selected.getMonth() + 1) : ""));
  const [year, setYear] = useState(() => (selected ? String(selected.getFullYear()) : ""));
  const [hour, setHour] = useState(() =>
    selected ? pad2(selected.getHours()) : DEFAULT_HOUR,
  );
  const [minute, setMinute] = useState(() =>
    selected ? pad2(selected.getMinutes()) : DEFAULT_MINUTE,
  );
  /** True once the user picked a time (or an existing value was loaded). */
  const [timeChosen, setTimeChosen] = useState(() => hasValue);

  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    if (!selected) {
      if (!value) {
        setDay("");
        setMonth("");
        setYear("");
        setHour(DEFAULT_HOUR);
        setMinute(DEFAULT_MINUTE);
        setTimeChosen(false);
      }
      return;
    }
    setDay(pad2(selected.getDate()));
    setMonth(pad2(selected.getMonth() + 1));
    setYear(String(selected.getFullYear()));
    setHour(pad2(selected.getHours()));
    setMinute(pad2(selected.getMinutes()));
    setTimeChosen(true);
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

  useEffect(() => {
    if (!timeOpen) return;
    const id = window.requestAnimationFrame(() => {
      hourBtnRef.current?.scrollIntoView({ block: "center" });
      minuteBtnRef.current?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [timeOpen, hour, minute]);

  function tryCommit(next: {
    day?: string;
    month?: string;
    year?: string;
    hour?: string;
    minute?: string;
    forceTime?: boolean;
  }) {
    const d = next.day ?? day;
    const m = next.month ?? month;
    const y = next.year ?? year;
    const h = next.hour ?? hour;
    const min = next.minute ?? minute;
    const allowTime = next.forceTime || timeChosen || hasValue;
    if (!allowTime) return;
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

  function openDatePanel() {
    setTimeOpen(false);
    setDateOpen(true);
    if (selected) setViewMonth(startOfMonth(selected));
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
    if (!timeChosen && !hasValue) {
      setTimeOpen(true);
    }
  }

  function pickTime(h: string, min: string) {
    setHour(h);
    setMinute(min);
    setTimeChosen(true);
    tryCommit({ hour: h, minute: min, forceTime: true });
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
    "h-8 w-full rounded-lg border border-[var(--tf-line)] bg-white px-1 text-center text-sm tabular-nums text-[var(--tf-navy)] outline-none transition focus:border-[var(--tf-teal)] focus:shadow-[0_0_0_2px_rgba(20,184,166,0.18)]";

  return (
    <div ref={rootRef} className="relative grid gap-1">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <span className="text-sm font-medium text-[var(--tf-navy)]">{label}</span>
      {hint ? <span className="text-xs text-[var(--tf-text-secondary)]">{hint}</span> : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
            Datum
          </span>
          <div
            className={`flex cursor-text items-center gap-1 rounded-lg border bg-[#f8fafc] px-1.5 py-1 transition ${
              dateOpen
                ? "border-[var(--tf-teal)] shadow-[0_0_0_2px_rgba(20,184,166,0.18)]"
                : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
            }`}
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === "INPUT") {
                openDatePanel();
                return;
              }
              e.preventDefault();
              openDatePanel();
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
                onFocus={openDatePanel}
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
                onFocus={openDatePanel}
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
                onFocus={openDatePanel}
                aria-label={`${label} Jahr`}
              />
            </label>
          </div>
        </div>

        <div className="shrink-0">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
            Uhrzeit
          </span>
          <button
            type="button"
            className={`flex min-w-[6.5rem] items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-left transition ${
              timeOpen
                ? "border-[var(--tf-teal)] shadow-[0_0_0_2px_rgba(20,184,166,0.18)]"
                : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
            }`}
            aria-expanded={timeOpen}
            aria-controls={timePanelId}
            onClick={() => {
              setDateOpen(false);
              setTimeOpen((v) => !v);
            }}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" aria-hidden />
            <span
              className={`text-sm tabular-nums ${
                timeChosen || hasValue
                  ? "font-medium text-[var(--tf-navy)]"
                  : "text-[var(--tf-text-secondary)]"
              }`}
            >
              {hour}:{minute}
            </span>
          </button>
        </div>
      </div>

      {dateOpen ? (
        <div
          id={datePanelId}
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
            <span className="text-[11px] text-[var(--tf-text-secondary)]">
              Uhrzeit: {hour}:{minute}
              {!timeChosen && !hasValue ? " (bitte wählen)" : ""}
            </span>
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
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,16rem)] overflow-hidden rounded-xl border border-[var(--tf-line)] bg-white shadow-[0_18px_40px_rgba(15,39,71,0.16)]"
          role="dialog"
          aria-label={`${label} Uhrzeit`}
        >
          <div className="border-b border-[var(--tf-line)] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--tf-navy)]">Uhrzeit wählen</p>
            <p className="text-[11px] text-[var(--tf-text-secondary)]">
              {hasValue || timeChosen
                ? `Aktuell ${hour}:${minute}`
                : `Vorschlag ${DEFAULT_HOUR}:${DEFAULT_MINUTE} — bitte bestätigen`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-0">
            <div className="max-h-48 overflow-y-auto border-r border-[var(--tf-line)]">
              <p className="sticky top-0 bg-[#f8fafc] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                Stunde
              </p>
              {HOURS.map((h) => (
                <button
                  key={h}
                  ref={h === hour ? hourBtnRef : undefined}
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm tabular-nums transition ${
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
            <div className="max-h-48 overflow-y-auto">
              <p className="sticky top-0 bg-[#f8fafc] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
                Minute
              </p>
              {MINUTES.map((m) => (
                <button
                  key={m}
                  ref={m === minute ? minuteBtnRef : undefined}
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm tabular-nums transition ${
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
          <div className="flex justify-end gap-2 border-t border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-1.5">
            {!timeChosen && !hasValue ? (
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-8 !px-3 text-xs"
                onClick={() => pickTime(hour, minute)}
              >
                {hour}:{minute} übernehmen
              </button>
            ) : (
              <button
                type="button"
                className="tf-btn tf-btn-primary !min-h-8 !px-3 text-xs"
                onClick={() => setTimeOpen(false)}
              >
                Fertig
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Uncontrolled wrapper for server-rendered forms (hidden input via `name`). */
export function SmartDateTimeField({
  name,
  label,
  hint,
  defaultValue = "",
}: {
  name?: string;
  label: string;
  hint?: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <SmartDateTimeInput
      name={name}
      label={label}
      hint={hint}
      value={value}
      onChange={setValue}
    />
  );
}
