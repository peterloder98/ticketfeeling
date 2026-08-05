"use client";

import { useMemo, useState } from "react";

export type LineupArtistRow = {
  key: string;
  id?: string | null;
  name: string;
  homepage: string;
  youtube: string;
  bio: string;
  detailsOpen: boolean;
};

export type LibraryArtist = {
  id: string;
  name: string;
  homepage: string | null;
  youtube: string | null;
  shortBio: string | null;
};

type Props = {
  value: LineupArtistRow[];
  onChange: (next: LineupArtistRow[]) => void;
  /** Existing org artists to pick from (event edit / wizard). */
  library?: LibraryArtist[];
  /** Hidden form field name for JSON payload. */
  formFieldName?: string;
  /** Softer copy for wizard vs. event edit. */
  hint?: string;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyLineupArtist(partial?: Partial<LineupArtistRow>): LineupArtistRow {
  return {
    key: newKey(),
    id: null,
    name: "",
    homepage: "",
    youtube: "",
    bio: "",
    detailsOpen: false,
    ...partial,
  };
}

export function lineupToJsonPayload(rows: LineupArtistRow[]) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      key: r.key,
      id: r.id || null,
      name: r.name.trim(),
      homepage: r.homepage.trim(),
      youtube: r.youtube.trim(),
      bio: r.bio.trim(),
    }));
}

export function ArtistLineupEditor({
  value,
  onChange,
  library = [],
  formFieldName = "artistsJson",
  hint = "Nur den Namen reicht — Details kannst du jetzt oder später ergänzen.",
}: Props) {
  const [draftName, setDraftName] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");

  const payload = useMemo(() => JSON.stringify(lineupToJsonPayload(value)), [value]);

  const linkedIds = useMemo(
    () => new Set(value.map((r) => r.id).filter(Boolean) as string[]),
    [value],
  );

  const availableLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return library
      .filter((a) => !linkedIds.has(a.id))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [library, linkedIds, libraryQuery]);

  function addByName(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    const already = value.some((r) => r.name.trim().toLowerCase() === name.toLowerCase());
    if (already) {
      setDraftName("");
      return;
    }
    const fromLib = library.find((a) => a.name.toLowerCase() === name.toLowerCase());
    onChange([
      ...value,
      emptyLineupArtist({
        id: fromLib?.id ?? null,
        name: fromLib?.name ?? name,
        homepage: fromLib?.homepage ?? "",
        youtube: fromLib?.youtube ?? "",
        bio: fromLib?.shortBio ?? "",
      }),
    ]);
    setDraftName("");
  }

  function addFromLibrary(artist: LibraryArtist) {
    if (linkedIds.has(artist.id)) return;
    onChange([
      ...value,
      emptyLineupArtist({
        id: artist.id,
        name: artist.name,
        homepage: artist.homepage ?? "",
        youtube: artist.youtube ?? "",
        bio: artist.shortBio ?? "",
      }),
    ]);
    setLibraryQuery("");
  }

  function updateRow(key: string, patch: Partial<LineupArtistRow>) {
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r.key !== key));
  }

  function moveRow(key: string, dir: -1 | 1) {
    const idx = value.findIndex((r) => r.key === key);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= value.length) return;
    const copy = [...value];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item!);
    onChange(copy);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={formFieldName} value={payload} />

      <p className="text-sm text-[var(--tf-text-secondary)]">{hint}</p>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li
              key={row.key}
              className="rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.02)] px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="tf-badge tf-badge-teal !text-[10px]">{index + 1}</span>
                <input
                  className="tf-input min-w-[10rem] flex-1 !py-1.5 text-sm"
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value, id: null })}
                  aria-label="Künstlername"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    className="tf-btn tf-btn-ghost !min-h-8 !px-2 text-xs"
                    onClick={() => updateRow(row.key, { detailsOpen: !row.detailsOpen })}
                  >
                    {row.detailsOpen ? "Weniger" : "Details hinzufügen"}
                  </button>
                  <button
                    type="button"
                    className="tf-btn tf-btn-ghost !min-h-8 !px-2 text-xs"
                    disabled={index === 0}
                    onClick={() => moveRow(row.key, -1)}
                    aria-label="Nach oben"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="tf-btn tf-btn-ghost !min-h-8 !px-2 text-xs"
                    disabled={index === value.length - 1}
                    onClick={() => moveRow(row.key, 1)}
                    aria-label="Nach unten"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="tf-btn tf-btn-ghost !min-h-8 !px-2 text-xs text-[var(--danger)]"
                    onClick={() => removeRow(row.key)}
                  >
                    Entfernen
                  </button>
                </div>
              </div>

              {row.detailsOpen ? (
                <div className="mt-3 grid gap-3 border-t border-[var(--tf-line)] pt-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm sm:col-span-1">
                    <span className="text-[var(--tf-text-secondary)]">Homepage</span>
                    <input
                      className="tf-input"
                      value={row.homepage}
                      onChange={(e) => updateRow(row.key, { homepage: e.target.value })}
                      placeholder="https://…"
                      inputMode="url"
                    />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-1">
                    <span className="text-[var(--tf-text-secondary)]">YouTube-Link</span>
                    <input
                      className="tf-input"
                      value={row.youtube}
                      onChange={(e) => updateRow(row.key, { youtube: e.target.value })}
                      placeholder="https://youtube.com/watch?v=…"
                      inputMode="url"
                    />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="text-[var(--tf-text-secondary)]">Bio (optional)</span>
                    <textarea
                      className="tf-input"
                      rows={3}
                      value={row.bio}
                      onChange={(e) => updateRow(row.key, { bio: e.target.value })}
                      placeholder="Kurz was über den Künstler — darf später kommen."
                    />
                  </label>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--tf-text-secondary)]">Noch niemand im Line-up.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="tf-input min-w-[12rem] flex-1"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addByName(draftName);
            }
          }}
          placeholder="Name eingeben und Enter"
          aria-label="Künstler hinzufügen"
        />
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          onClick={() => addByName(draftName)}
        >
          Hinzufügen
        </button>
      </div>

      {library.length > 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--tf-line)] p-3">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--tf-text-secondary)]">
            Aus der Künstler-Bibliothek
          </p>
          <input
            className="tf-input mt-2"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="Suchen…"
            aria-label="Künstlerbibliothek durchsuchen"
          />
          {availableLibrary.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {availableLibrary.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="tf-badge tf-badge-teal cursor-pointer !px-3 !py-1.5 text-sm hover:opacity-90"
                    onClick={() => addFromLibrary(a)}
                  >
                    + {a.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
              {libraryQuery.trim()
                ? "Kein Treffer — einfach oben einen neuen Namen eingeben."
                : "Alle aus der Bibliothek sind schon im Line-up."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
