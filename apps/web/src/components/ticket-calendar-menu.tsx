"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
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
  /** Online ticket/order UI label (email uses a different string). */
  buttonLabel?: string;
};

export function TicketCalendarMenu({
  icsHref,
  event,
  className,
  fullWidth,
  buttonLabel = "Zum Kalender hinzufügen",
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function placeMenu() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = Math.max(240, rect.width);
      const estimatedHeight = 280;
      const gap = 8;
      let left = rect.left;
      let top = rect.bottom + gap;
      if (left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }
      if (top + estimatedHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - estimatedHeight - gap);
      }
      setMenuPos({ top, left });
    }

    placeMenu();

    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
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

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 80,
              minWidth: fullWidth
                ? Math.max(240, buttonRef.current?.offsetWidth ?? 240)
                : 240,
            }}
            className="overflow-visible rounded-xl border border-[var(--tf-line)] bg-white py-1 shadow-[0_12px_32px_rgba(15,39,71,0.18)]"
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`relative inline-block ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
    >
      <button
        ref={buttonRef}
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
        {buttonLabel}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
