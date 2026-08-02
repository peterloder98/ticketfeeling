"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DialCountry = {
  code: string;
  name: string;
  dial: string;
  flag: string;
};

export const DIAL_COUNTRIES: DialCountry[] = [
  { code: "DE", name: "Deutschland", dial: "+49", flag: "🇩🇪" },
  { code: "AT", name: "Österreich", dial: "+43", flag: "🇦🇹" },
  { code: "CH", name: "Schweiz", dial: "+41", flag: "🇨🇭" },
  { code: "NL", name: "Niederlande", dial: "+31", flag: "🇳🇱" },
  { code: "BE", name: "Belgien", dial: "+32", flag: "🇧🇪" },
  { code: "FR", name: "Frankreich", dial: "+33", flag: "🇫🇷" },
  { code: "IT", name: "Italien", dial: "+39", flag: "🇮🇹" },
  { code: "ES", name: "Spanien", dial: "+34", flag: "🇪🇸" },
  { code: "PL", name: "Polen", dial: "+48", flag: "🇵🇱" },
  { code: "CZ", name: "Tschechien", dial: "+420", flag: "🇨🇿" },
  { code: "DK", name: "Dänemark", dial: "+45", flag: "🇩🇰" },
  { code: "SE", name: "Schweden", dial: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norwegen", dial: "+47", flag: "🇳🇴" },
  { code: "GB", name: "Großbritannien", dial: "+44", flag: "🇬🇧" },
  { code: "IE", name: "Irland", dial: "+353", flag: "🇮🇪" },
  { code: "US", name: "USA", dial: "+1", flag: "🇺🇸" },
  { code: "TR", name: "Türkei", dial: "+90", flag: "🇹🇷" },
];

export function PhoneInput({
  name = "phone",
  defaultDial = "+49",
  defaultNational = "",
}: {
  name?: string;
  defaultDial?: string;
  defaultNational?: string;
}) {
  const initial =
    DIAL_COUNTRIES.find((c) => c.dial === defaultDial) ?? DIAL_COUNTRIES[0];
  const [country, setCountry] = useState(initial);
  const [national, setNational] = useState(defaultNational.replace(/\D/g, ""));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIAL_COUNTRIES;
    return DIAL_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fullPhone = national ? `${country.dial}${national}` : "";

  return (
    <div ref={rootRef} className="grid gap-1.5">
      <span className="tf-label">Telefon (optional)</span>
      <div className="flex gap-2">
        <div className="relative">
          <button
            type="button"
            className="tf-input flex !w-auto min-w-[7.5rem] items-center gap-1.5 !px-3"
            onClick={() => setOpen((v) => !v)}
            aria-label="Landesvorwahl"
          >
            <span aria-hidden>{country.flag}</span>
            <span className="tabular-nums">{country.dial}</span>
          </button>
          {open ? (
            <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-[var(--tf-line)] bg-white p-2 shadow-lg">
              <input
                className="tf-input !min-h-10 mb-2 text-sm"
                placeholder="Land oder Vorwahl suchen…"
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
                      <span>{c.flag}</span>
                      <span className="flex-1">{c.name}</span>
                      <span className="tabular-nums text-[var(--tf-text-secondary)]">{c.dial}</span>
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
          onChange={(e) => setNational(e.target.value.replace(/\D/g, "").slice(0, 15))}
          autoComplete="tel-national"
        />
      </div>
      <input type="hidden" name={name} value={fullPhone} />
    </div>
  );
}
