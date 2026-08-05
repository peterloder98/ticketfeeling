import { parseYoutubeVideoId } from "@/lib/youtube";
import { slugify } from "@/lib/admin/event-form";

/** Draft row from wizard / lineup editor (JSON form field). */
export type ArtistLineupDraft = {
  key?: string;
  id?: string | null;
  name: string;
  homepage?: string;
  youtube?: string;
  bio?: string;
};

export function normalizeHomepageUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`;
  return null;
}

/** Returns normalized URL/ID, or null if empty. Throws on clearly invalid input. */
export function normalizeYoutubeInput(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const id = parseYoutubeVideoId(value);
  if (id) return value.startsWith("http") ? value : `https://www.youtube.com/watch?v=${id}`;
  throw new Error("INVALID_YOUTUBE");
}

export function parseArtistsJson(raw: FormDataEntryValue | null): ArtistLineupDraft[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): ArtistLineupDraft | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const name = String(r.name ?? "").trim();
        if (!name) return null;
        return {
          key: typeof r.key === "string" ? r.key : undefined,
          id: typeof r.id === "string" && r.id ? r.id : null,
          name,
          homepage: typeof r.homepage === "string" ? r.homepage : "",
          youtube: typeof r.youtube === "string" ? r.youtube : "",
          bio: typeof r.bio === "string" ? r.bio : "",
        };
      })
      .filter((r): r is ArtistLineupDraft => Boolean(r));
  } catch {
    return [];
  }
}

export async function allocateUniqueArtistSlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client or transaction
  tx: { artist: { findFirst: (args: any) => Promise<{ id: string } | null> } },
  organizationId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || "kuenstler";
  let slug = base;
  for (let i = 0; i < 40; i += 1) {
    const taken = await tx.artist.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });
    if (!taken || (excludeId && taken.id === excludeId)) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
