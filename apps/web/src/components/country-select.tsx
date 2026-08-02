"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORLD_COUNTRIES,
  flagEmoji,
  findCountry,
  lettersOnlyCountryQuery,
} from "@/lib/countries";

type Props = {
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  required?: boolean;
};

export function CountrySelect({
  name = "country",
  label = "Land",
  value: controlled,
  defaultValue = "DE",
  onChange,
  required,
}: Props) {
  const [internal, setInternal] = useState(
    (controlled ?? defaultValue).toUpperCase() || "DE",
  );
  const code = (controlled ?? internal).toUpperCase();
  const selected = findCountry(code) ?? findCountry("DE")!;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = lettersOnlyCountryQuery(query).trim().toLowerCase();
    if (!q) return WORLD_COUNTRIES;
    return WORLD_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
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

  function pick(next: string) {
    const upper = next.toUpperCase();
    if (controlled === undefined) setInternal(upper);
    onChange?.(upper);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative grid gap-1">
      {name ? <input type="hidden" name={name} value={code} /> : null}
      <span className="text-sm font-medium text-[var(--tf-navy)]">{label}</span>
      <button
        type="button"
        className="tf-input flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span aria-hidden className="text-lg leading-none">
          {flagEmoji(selected.code)}
        </span>
        <span className="flex-1 truncate">{selected.name}</span>
        <span className="text-xs text-[var(--tf-text-secondary)]">{selected.code}</span>
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-full min-w-[16rem] overflow-hidden rounded-xl border border-[var(--tf-line)] bg-white shadow-[0_18px_40px_rgba(15,39,71,0.16)]"
          role="listbox"
        >
          <div className="border-b border-[var(--tf-line)] p-2">
            <input
              className="tf-input !min-h-10 text-sm"
              placeholder="Land suchen…"
              value={query}
              onChange={(e) => setQuery(lettersOnlyCountryQuery(e.target.value))}
              autoFocus
              inputMode="text"
              autoComplete="off"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1 text-sm">
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.code === code}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
                    c.code === code
                      ? "bg-[rgba(20,184,166,0.14)] font-medium text-[var(--tf-navy)]"
                      : "hover:bg-[rgba(15,39,71,0.05)]"
                  }`}
                  onClick={() => pick(c.code)}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {flagEmoji(c.code)}
                  </span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-[var(--tf-text-secondary)]">{c.code}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-[var(--tf-text-secondary)]">
                Kein Treffer
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {required ? (
        <span className="sr-only">Pflichtfeld Land: {selected.name}</span>
      ) : null}
    </div>
  );
}
