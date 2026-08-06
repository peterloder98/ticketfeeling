/** Shared lineup row helpers — safe for Server Components (no "use client"). */

export type LineupArtistRow = {
  key: string;
  id?: string | null;
  name: string;
  homepage: string;
  youtube: string;
  bio: string;
  profileImageUrl: string;
  headerImageUrl: string;
  detailsOpen: boolean;
};

export type LibraryArtist = {
  id: string;
  name: string;
  homepage: string | null;
  youtube: string | null;
  shortBio: string | null;
  profileImageUrl?: string | null;
  headerImageUrl?: string | null;
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
    profileImageUrl: "",
    headerImageUrl: "",
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
      profileImageUrl: r.profileImageUrl.trim(),
      headerImageUrl: r.headerImageUrl.trim(),
    }));
}
