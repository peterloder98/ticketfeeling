"use client";

import { useState } from "react";
import {
  ArtistLineupEditor,
  emptyLineupArtist,
  type LibraryArtist,
  type LineupArtistRow,
} from "@/components/admin/artist-lineup-editor";
import { updateEventLineupAction } from "@/app/admin/artists/actions";

type Props = {
  eventId: string;
  initialLineup: LineupArtistRow[];
  library: LibraryArtist[];
};

export function EventLineupForm({ eventId, initialLineup, library }: Props) {
  const [lineup, setLineup] = useState<LineupArtistRow[]>(
    initialLineup.length > 0 ? initialLineup : [],
  );

  return (
    <form action={updateEventLineupAction} className="mt-4 space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <ArtistLineupEditor
        value={lineup}
        onChange={setLineup}
        library={library}
        hint="Aus der Bibliothek wählen oder neuen Namen tippen. Details sind optional."
      />
      <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm">
        Line-up speichern
      </button>
      {lineup.length === 0 ? (
        <button
          type="button"
          className="ml-2 tf-btn tf-btn-ghost !py-2 text-sm"
          onClick={() => setLineup([emptyLineupArtist()])}
        >
          Ersten Künstler vorbereiten
        </button>
      ) : null}
    </form>
  );
}
