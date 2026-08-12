"use client";

import { useState, useTransition } from "react";
import { ArtistLineupEditor } from "@/components/admin/artist-lineup-editor";
import {
  emptyLineupArtist,
  type LibraryArtist,
  type LineupArtistRow,
} from "@/lib/admin/lineup-artist";
import { updateTourLineupAction } from "@/app/admin/artists/actions";

type Props = {
  tourId: string;
  initialLineup: LineupArtistRow[];
  library: LibraryArtist[];
};

export function TourLineupForm({ tourId, initialLineup, library }: Props) {
  const [lineup, setLineup] = useState<LineupArtistRow[]>(
    initialLineup.length > 0 ? initialLineup : [],
  );
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onLineupChange(next: LineupArtistRow[]) {
    setLineup(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateTourLineupAction(formData);
        setDirty(false);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  return (
    <form action={onSubmit} className="relative space-y-4">
      {pending ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[rgba(248,250,252,0.72)] backdrop-blur-[1px]"
          aria-live="polite"
        >
          <p className="rounded-xl border border-[var(--tf-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--tf-navy)] shadow-sm">
            Speichert…
          </p>
        </div>
      ) : null}
      <input type="hidden" name="tourId" value={tourId} />
      <ArtistLineupEditor
        value={lineup}
        onChange={onLineupChange}
        library={library}
        hint="Gilt für alle Termine der Tour — solange ein Termin kein eigenes Line-up hat."
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm" disabled={pending}>
          {pending ? "Speichert…" : "Tour-Line-up speichern"}
        </button>
        {lineup.length === 0 ? (
          <button
            type="button"
            className="tf-btn tf-btn-ghost !py-2 text-sm"
            onClick={() => onLineupChange([emptyLineupArtist()])}
          >
            Ersten Künstler vorbereiten
          </button>
        ) : null}
        {dirty ? (
          <p className="text-sm text-[var(--tf-text-secondary)]">Ungespeicherte Änderungen</p>
        ) : saved ? (
          <p className="text-sm font-medium text-[var(--tf-teal-hover)]">
            Tour-Line-up gespeichert.
          </p>
        ) : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    </form>
  );
}
