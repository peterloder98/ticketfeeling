"use client";

import { useState, useTransition } from "react";
import { ArtistLineupEditor } from "@/components/admin/artist-lineup-editor";
import {
  emptyLineupArtist,
  type LibraryArtist,
  type LineupArtistRow,
} from "@/lib/admin/lineup-artist";
import {
  clearEventLineupOverrideAction,
  updateEventLineupAction,
} from "@/app/admin/artists/actions";

type TourContext = {
  id: string;
  name: string;
  inherits: boolean;
  tourLineup: LineupArtistRow[];
};

type Props = {
  eventId: string;
  initialLineup: LineupArtistRow[];
  library: LibraryArtist[];
  tour?: TourContext | null;
};

export function EventLineupForm({ eventId, initialLineup, library, tour }: Props) {
  const [inherits, setInherits] = useState(Boolean(tour?.inherits));
  const [lineup, setLineup] = useState<LineupArtistRow[]>(() => {
    if (tour?.inherits) return [];
    return initialLineup.length > 0 ? initialLineup : [];
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function startOverride() {
    setInherits(false);
    setSaved(false);
    setInfo(null);
    setLineup(
      tour && tour.tourLineup.length > 0
        ? tour.tourLineup.map((row) => ({ ...row, key: row.key || crypto.randomUUID() }))
        : initialLineup.length > 0
          ? initialLineup
          : [emptyLineupArtist()],
    );
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    setInfo(null);
    startTransition(async () => {
      try {
        await updateEventLineupAction(formData);
        setInherits(false);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  function onClearOverride() {
    setError(null);
    setSaved(false);
    setInfo(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("eventId", eventId);
        await clearEventLineupOverrideAction(fd);
        setInherits(true);
        setLineup([]);
        setInfo("Wieder Tour-Line-up — Änderungen an der Tour gelten auch hier.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Zurücksetzen fehlgeschlagen");
      }
    });
  }

  if (tour && inherits) {
    return (
      <div className="relative mt-4 space-y-4">
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
        <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-3">
          <p className="text-sm font-medium text-[var(--tf-navy)]">
            Übernimmt das Tour-Line-up von „{tour.name}“
          </p>
          <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
            Änderungen am Tour-Line-up erscheinen automatisch auf diesem Termin.
          </p>
          {tour.tourLineup.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-[var(--tf-navy)]">
              {tour.tourLineup.map((row) => (
                <li key={row.key || row.id || row.name} className="font-medium">
                  {row.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
              Noch niemand auf der Tour — unter Tour → Line-up ergänzen.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="tf-btn tf-btn-primary !py-2 text-sm"
            disabled={pending}
            onClick={startOverride}
          >
            Für diesen Termin anpassen
          </button>
          {info ? (
            <p className="text-sm font-medium text-[var(--tf-teal-hover)]">{info}</p>
          ) : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="relative mt-4 space-y-4">
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
      <input type="hidden" name="eventId" value={eventId} />
      {tour ? (
        <div className="rounded-2xl border border-[rgba(214,166,66,0.35)] bg-[rgba(214,166,66,0.08)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--tf-navy)]">
            Eigenes Line-up für diesen Termin
          </p>
          <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
            Ersetzt das Tour-Line-up nur hier. Du kannst jederzeit wieder auf die Tour
            zurückwechseln.
          </p>
        </div>
      ) : null}
      <ArtistLineupEditor
        value={lineup}
        onChange={setLineup}
        library={library}
        hint="Aus der Bibliothek wählen oder neuen Namen tippen. Bilder und Details sind optional."
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm" disabled={pending}>
          {pending ? "Speichert…" : "Line-up speichern"}
        </button>
        {tour ? (
          <button
            type="button"
            className="tf-btn tf-btn-ghost !py-2 text-sm"
            disabled={pending}
            onClick={onClearOverride}
          >
            Tour-Line-up wieder übernehmen
          </button>
        ) : null}
        {lineup.length === 0 ? (
          <button
            type="button"
            className="tf-btn tf-btn-ghost !py-2 text-sm"
            onClick={() => setLineup([emptyLineupArtist()])}
          >
            Ersten Künstler vorbereiten
          </button>
        ) : null}
        {saved ? (
          <p className="text-sm font-medium text-[var(--tf-teal-hover)]">Line-up gespeichert.</p>
        ) : null}
        {info ? (
          <p className="text-sm font-medium text-[var(--tf-teal-hover)]">{info}</p>
        ) : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    </form>
  );
}
