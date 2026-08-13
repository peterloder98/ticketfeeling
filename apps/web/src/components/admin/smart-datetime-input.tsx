"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import {
  formatDateDraft,
  formatTimeDraft,
  isValidYmd,
  pad2,
  parseDateDraftLoose,
  parseTimeDraft,
  sanitizeDateDraft,
  sanitizeTimeDraft,
} from "@/lib/admin/smart-datetime-draft";

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

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));
const DEFAULT_HOUR = 18;
const DEFAULT_MINUTE = 0;

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

type Props = {
  name?: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

function selectAllSoon(el: HTMLInputElement | null) {
  if (!el) return;
  // Sync + rAF so select wins over browser caret placement after click.
  el.select();
  window.requestAnimationFrame(() => el.select());
}

export function SmartDateTimeInput({ name, label, hint, value, onChange }: Props) {
  const datePanelId = useId();
  const timePanelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const hourBtnRef = useRef<HTMLButtonElement>(null);
  const minuteBtnRef = useRef<HTMLButtonElement>(null);
  const dateFocusedRef = useRef(false);
  const timeFocusedRef = useRef(false);

  const selected = useMemo(() => parseLocal(value), [value]);
  const hasValue = Boolean(selected);

  const committedDate = selected
    ? formatDateDraft(selected.getFullYear(), selected.getMonth() + 1, selected.getDate())
    : "";
  const committedTime = selected
    ? formatTimeDraft(selected.getHours(), selected.getMinutes())
    : formatTimeDraft(DEFAULT_HOUR, DEFAULT_MINUTE);

  const [dateDraft, setDateDraft] = useState(committedDate);
  const [timeDraft, setTimeDraft] = useState(committedTime);
  const [dateFocused, setDateFocused] = useState(false);
  const [timeFocused, setTimeFocused] = useState(false);
  /** True once the user picked/typed a time (or an existing value was loaded). */
  const [timeChosen, setTimeChosen] = useState(() => hasValue);

  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    dateFocusedRef.current = dateFocused;
  }, [dateFocused]);
  useEffect(() => {
    timeFocusedRef.current = timeFocused;
  }, [timeFocused]);

  // Sync from controlled value only while the user is not mid-typing.
  useEffect(() => {
    if (dateFocusedRef.current || timeFocusedRef.current) return;
    if (!selected) {
      if (!value) {
        setDateDraft("");
        setTimeDraft(formatTimeDraft(DEFAULT_HOUR, DEFAULT_MINUTE));
        setTimeChosen(false);
      }
      return;
    }
    setDateDraft(
      formatDateDraft(selected.getFullYear(), selected.getMonth() + 1, selected.getDate()),
    );
    setTimeDraft(formatTimeDraft(selected.getHours(), selected.getMinutes()));
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

  const hourForList = (() => {
    const p = parseTimeDraft(timeDraft);
    return p ? pad2(p.hour) : pad2(DEFAULT_HOUR);
  })();
  const minuteForList = (() => {
    const p = parseTimeDraft(timeDraft);
    return p ? pad2(p.minute) : pad2(DEFAULT_MINUTE);
  })();

  useEffect(() => {
    if (!timeOpen) return;
    const id = window.requestAnimationFrame(() => {
      hourBtnRef.current?.scrollIntoView({ block: "center" });
      minuteBtnRef.current?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [timeOpen, hourForList, minuteForList]);

  function commitFromDrafts(nextDate: string, nextTime: string, forceTime = false) {
    const allowTime = forceTime || timeChosen || hasValue;
    if (!allowTime) return false;
    const dateParts = parseDateDraftLoose(nextDate);
    const timeParts = parseTimeDraft(nextTime);
    if (!dateParts || !timeParts) return false;
    if (!isValidYmd(dateParts.year, dateParts.month, dateParts.day)) return false;
    onChange(
      toLocalValue(
        dateParts.year,
        dateParts.month,
        dateParts.day,
        timeParts.hour,
        timeParts.minute,
      ),
    );
    return true;
  }

  function blurDate() {
    const parsed = parseDateDraftLoose(dateDraft);
    if (parsed) {
      const padded = formatDateDraft(parsed.year, parsed.month, parsed.day);
      setDateDraft(padded);
      commitFromDrafts(padded, timeDraft);
    } else if (selected) {
      setDateDraft(committedDate);
    }
    setDateFocused(false);
  }

  function blurTime() {
    const parsed = parseTimeDraft(timeDraft);
    if (parsed) {
      const padded = formatTimeDraft(parsed.hour, parsed.minute);
      setTimeDraft(padded);
      setTimeChosen(true);
      commitFromDrafts(dateDraft, padded, true);
    } else if (selected) {
      setTimeDraft(committedTime);
    } else {
      setTimeDraft(formatTimeDraft(DEFAULT_HOUR, DEFAULT_MINUTE));
    }
    setTimeFocused(false);
  }

  function openDatePanel() {
    setTimeOpen(false);
    setDateOpen(true);
    if (selected) setViewMonth(startOfMonth(selected));
  }

  function pickCalendarDay(date: Date) {
    const nextDate = formatDateDraft(date.getFullYear(), date.getMonth() + 1, date.getDate());
    setDateDraft(nextDate);
    setDateFocused(false);
    commitFromDrafts(nextDate, timeDraft.length > 0 ? timeDraft : formatTimeDraft(DEFAULT_HOUR, DEFAULT_MINUTE));
    setDateOpen(false);
    if (!timeChosen && !hasValue) {
      setTimeOpen(true);
    }
  }

  function pickTime(h: string, min: string) {
    const nextTime = `${h}:${min}`;
    setTimeDraft(nextTime);
    setTimeChosen(true);
    setTimeFocused(false);
    commitFromDrafts(dateDraft, nextTime, true);
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
  const fieldClass =
    "h-9 w-full rounded-lg border border-[var(--tf-line)] bg-white px-2 text-sm tabular-nums text-[var(--tf-navy)] outline-none transition focus:border-[var(--tf-teal)] focus:shadow-[0_0_0_2px_rgba(20,184,166,0.18)]";

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
                openDatePanel();
                setDateFocused(true);
                // Seed from committed value, then select-all so typing replaces.
                if (committedDate) setDateDraft(committedDate);
                selectAllSoon(dateRef.current);
              }}
              onMouseUp={(e) => {
                // Keep select-all after click focus (browser otherwise drops selection).
                if (dateFocusedRef.current && dateRef.current === e.currentTarget) {
                  e.preventDefault();
                }
              }}
              onBlur={blurDate}
              aria-label={`${label} Datum`}
            />
          </div>
        </div>

        <div className="shrink-0 basis-[9.5rem]">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
            Uhrzeit
          </span>
          <div
            className={`flex items-center gap-1 rounded-lg border bg-white px-1.5 py-1 transition ${
              timeOpen
                ? "border-[var(--tf-teal)] shadow-[0_0_0_2px_rgba(20,184,166,0.18)]"
                : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]/50"
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" aria-hidden />
            <input
              ref={timeRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="HH:MM"
              className={`${fieldClass} !w-[4.5rem]`}
              value={timeChosen || hasValue || timeFocused ? timeDraft : ""}
              onChange={(e) => {
                setTimeDraft(sanitizeTimeDraft(e.target.value));
                setTimeChosen(true);
              }}
              onFocus={() => {
                setDateOpen(false);
                setTimeOpen(true);
                setTimeFocused(true);
                if (timeChosen || hasValue) {
                  setTimeDraft(committedTime || timeDraft);
                } else {
                  setTimeDraft(formatTimeDraft(DEFAULT_HOUR, DEFAULT_MINUTE));
                }
                selectAllSoon(timeRef.current);
              }}
              onMouseUp={(e) => {
                if (timeFocusedRef.current && timeRef.current === e.currentTarget) {
                  e.preventDefault();
                }
              }}
              onBlur={blurTime}
              aria-label={`${label} Uhrzeit`}
            />
            <button
              type="button"
              className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)] hover:text-[var(--tf-navy)]"
              aria-expanded={timeOpen}
              aria-controls={timePanelId}
              onClick={() => {
                setDateOpen(false);
                setTimeOpen((v) => !v);
              }}
            >
              Liste
            </button>
          </div>
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
              Uhrzeit: {hourForList}:{minuteForList}
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
              Tippen oder aus der Liste wählen — aktuell {hourForList}:{minuteForList}
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
                  ref={h === hourForList ? hourBtnRef : undefined}
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm tabular-nums transition ${
                    h === hourForList
                      ? "bg-[var(--tf-navy)] font-semibold text-white"
                      : "text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.1)]"
                  }`}
                  onClick={() => pickTime(h, minuteForList)}
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
                  ref={m === minuteForList ? minuteBtnRef : undefined}
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm tabular-nums transition ${
                    m === minuteForList
                      ? "bg-[var(--tf-navy)] font-semibold text-white"
                      : "text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.1)]"
                  }`}
                  onClick={() => pickTime(hourForList, m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-1.5">
            <button
              type="button"
              className="tf-btn tf-btn-primary !min-h-8 !px-3 text-xs"
              onClick={() => {
                setTimeChosen(true);
                blurTime();
                setTimeOpen(false);
              }}
            >
              Fertig
            </button>
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
