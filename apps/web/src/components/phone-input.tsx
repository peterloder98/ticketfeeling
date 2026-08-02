"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WORLD_COUNTRIES, flagEmoji, findCountry } from "@/lib/countries";

function digitsOnly(raw: string, max = 15) {
  return raw.replace(/\D/g, "").slice(0, max);
}

function blockNonDigits(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const allowed = [
    "Backspace",
    "Delete",
    "Tab",
    "Escape",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ];
  if (allowed.includes(e.key)) return;
  if (e.key.length === 1 && !/^\d$/.test(e.key)) e.preventDefault();
}

/** Parse stored E.164-ish phone into dial + national digits. */
export function splitPhone(value: string | null | undefined): {
  dial: string;
  national: string;
} {
  const raw = (value ?? "").trim();
  if (!raw) return { dial: "+49", national: "" };
  const digits = raw.replace(/\D/g, "");
  const withPlus = raw.startsWith("+") ? `+${digits}` : digits;
  const sorted = [...WORLD_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    const dialDigits = c.dial.replace(/\D/g, "");
    if (withPlus.startsWith(c.dial) || digits.startsWith(dialDigits)) {
      return {
        dial: c.dial,
        national: digits.slice(dialDigits.length),
      };
    }
  }
  return { dial: "+49", national: digits };
}

export function PhoneInput({
  name = "phone",
  label = "Telefon",
  defaultValue = "",
  defaultDial,
  defaultNational,
}: {
  name?: string;
  label?: string;
  /** Full stored phone e.g. +491701234567 */
  defaultValue?: string;
  defaultDial?: string;
  defaultNational?: string;
}) {
  const parsed = splitPhone(defaultValue);
  const initialDial = defaultDial ?? parsed.dial;
  const initialNational = defaultNational ?? parsed.national;
  const initial =
    WORLD_COUNTRIES.find((c) => c.dial === initialDial) ??
    findCountry("DE") ??
    WORLD_COUNTRIES[0];

  const [country, setCountry] = useState(initial);
  const [national, setNational] = useState(digitsOnly(initialNational));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[^\p{L}\d+\s]/gu, "");
    if (!q) return WORLD_COUNTRIES;
    return WORLD_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const fullPhone = national ? `${country.dial}${national}` : "";

  return (
    <div ref={rootRef} className="grid gap-1">
      <span className="text-sm font-medium text-[var(--tf-navy)]">{label}</span>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <button
            type="button"
            className="tf-input flex !w-auto min-w-[7.5rem] items-center gap-1.5 !px-3"
            onClick={() => setOpen((v) => !v)}
            aria-label="Landesvorwahl"
          >
            <span aria-hidden>{flagEmoji(country.code)}</span>
            <span className="tabular-nums">{country.dial}</span>
          </button>
          {open ? (
            <div className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-[var(--tf-line)] bg-white p-2 shadow-lg">
              <input
                className="tf-input !min-h-10 mb-2 text-sm"
                placeholder="Land oder Vorwahl…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <ul className="max-h-48 overflow-y-auto text-sm">
                {filtered.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[rgba(20,184,166,0.1)]"
                      onClick={() => {
                        setCountry(c);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span>{flagEmoji(c.code)}</span>
                      <span className="flex-1">{c.name}</span>
                      <span className="tabular-nums text-[var(--tf-text-secondary)]">
                        {c.dial}
                      </span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 ? (
                  <li className="px-2 py-3 text-[var(--tf-text-secondary)]">Kein Treffer</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          className="tf-input flex-1"
          placeholder="Telefonnummer"
          value={national}
          onKeyDown={blockNonDigits}
          onChange={(e) => setNational(digitsOnly(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text");
            setNational(digitsOnly(text));
          }}
          autoComplete="tel-national"
        />
      </div>
      <input type="hidden" name={name} value={fullPhone} />
    </div>
  );
}
