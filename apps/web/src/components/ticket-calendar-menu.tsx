"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { CalendarPlus, ChevronDown } from "lucide-react";
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  toWebcalUrl,
} from "@/lib/commerce/ticket-calendar";

export type TicketCalendarEvent = {
  title: string;
  startsAtIso: string;
  endsAtIso?: string | null;
  locationLabel?: string | null;
  description?: string | null;
  url?: string | null;
};

type Props = {
  /** Authenticated .ics download path (may include ?t=) */
  icsHref: string;
  event: TicketCalendarEvent;
  className?: string;
  /** Stretch trigger to full width (ticket sidebar / embed) */
  fullWidth?: boolean;
};

export function TicketCalendarMenu({ icsHref, event, className, fullWidth }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const startsAt = new Date(event.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return null;

  const endsAt = event.endsAtIso ? new Date(event.endsAtIso) : null;
  const linkInput = {
    title: event.title,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    locationLabel: event.locationLabel,
    description: event.description,
    url: event.url,
  };

  const googleHref = buildGoogleCalendarUrl(linkInput);
  const outlookHref = buildOutlookCalendarUrl(linkInput);
  const yahooHref = buildYahooCalendarUrl(linkInput);

  function openAppleCalendar(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setOpen(false);
    const absolute = icsHref.startsWith("http")
      ? icsHref
      : `${window.location.origin}${icsHref}`;
    window.location.href = toWebcalUrl(absolute);
  }

  const itemClass =
    "block w-full px-3.5 py-2.5 text-left text-sm font-medium text-[var(--tf-navy)] transition hover:bg-[rgba(20,184,166,0.08)]";

  return (
    <div ref={rootRef} className={`relative inline-block ${fullWidth ? "w-full" : ""} ${className ?? ""}`}>
      <button
        type="button"
        className={`tf-btn tf-btn-secondary !min-h-10 items-center gap-2 text-sm ${
          fullWidth ? "flex w-full !min-h-12 justify-center" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
        Zum Kalender
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 z-30 mt-2 min-w-[240px] overflow-hidden rounded-xl border border-[var(--tf-line)] bg-white py-1 shadow-[0_12px_32px_rgba(15,39,71,0.12)]"
        >
          <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
            Kalender wählen
          </p>
          <a
            role="menuitem"
            href={googleHref}
            target="_blank"
            rel="noreferrer"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Google Kalender
          </a>
          <a
            role="menuitem"
            href={outlookHref}
            target="_blank"
            rel="noreferrer"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Outlook.com
          </a>
          <a
            role="menuitem"
            href={yahooHref}
            target="_blank"
            rel="noreferrer"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Yahoo Kalender
          </a>
          <a
            role="menuitem"
            href={icsHref}
            className={itemClass}
            onClick={openAppleCalendar}
          >
            Apple Kalender
          </a>
          <div className="my-1 border-t border-[var(--tf-line)]" />
          <a
            role="menuitem"
            href={icsHref}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Kalenderdatei (.ics)
          </a>
        </div>
      ) : null}
    </div>
  );
}
