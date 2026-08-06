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
  profileImageUrl?: string;
  headerImageUrl?: string;
};

export const ARTIST_TYPES = ["solo", "band", "duo", "ensemble", "other"] as const;
export type ArtistType = (typeof ARTIST_TYPES)[number];

export const ARTIST_VISIBILITIES = ["draft", "published"] as const;
export type ArtistVisibility = (typeof ARTIST_VISIBILITIES)[number];

/** Parsed artist profile fields from admin create/edit forms. */
export type ArtistProfileFields = {
  name: string;
  slug: string;
  legalName: string | null;
  artistType: ArtistType;
  genre: string | null;
  origin: string | null;
  shortBio: string | null;
  biography: string | null;
  profileImageUrl: string | null;
  headerImageUrl: string | null;
  homepage: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  spotify: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  visibility: ArtistVisibility;
  sortOrder: number;
};

export function normalizeHomepageUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`;
  return null;
}

/** Optional http(s) URL; empty → null. Throws INVALID_URL if non-empty but invalid. */
export function normalizeOptionalHttpUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const normalized = normalizeHomepageUrl(value);
  if (!normalized) throw new Error("INVALID_URL");
  return normalized;
}

/**
 * Image fields: uploaded assets (`/api/assets/…`), static public paths, or http(s) URLs.
 */
export function normalizeOptionalImageUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^\/api\/assets\/[0-9a-f-]{36}$/i.test(value)) return value;
  if (/^\/[a-z0-9][a-z0-9/_-]*\.(jpe?g|png|webp|gif)$/i.test(value)) return value;
  return normalizeOptionalHttpUrl(value);
}

/** Returns normalized URL/ID, or null if empty. Throws on clearly invalid input. */
export function normalizeYoutubeInput(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const id = parseYoutubeVideoId(value);
  if (id) return value.startsWith("http") ? value : `https://www.youtube.com/watch?v=${id}`;
  throw new Error("INVALID_YOUTUBE");
}

function optionalText(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function parseArtistType(raw: string): ArtistType {
  return (ARTIST_TYPES as readonly string[]).includes(raw) ? (raw as ArtistType) : "solo";
}

function parseVisibility(raw: string, fallback: ArtistVisibility = "published"): ArtistVisibility {
  return (ARTIST_VISIBILITIES as readonly string[]).includes(raw)
    ? (raw as ArtistVisibility)
    : fallback;
}

/**
 * Parse create/edit form fields. `name` is required (throws NAME_REQUIRED).
 * Optional URL fields throw INVALID_HOMEPAGE / INVALID_YOUTUBE / INVALID_URL.
 */
export function parseArtistProfileForm(
  formData: FormData,
  defaults?: { name?: string; slug?: string; visibility?: string },
): ArtistProfileFields {
  const name = String(formData.get("name") ?? "").trim() || defaults?.name?.trim() || "";
  if (!name) throw new Error("NAME_REQUIRED");

  const slugRaw = String(formData.get("slug") ?? "").trim() || defaults?.slug?.trim() || "";
  const slug = slugRaw || slugify(name);

  const biography = optionalText(formData, "biography");
  const shortBio =
    optionalText(formData, "shortBio") || (biography ? biography.slice(0, 280) : null);

  const homepageRaw = String(formData.get("homepage") ?? "").trim();
  const homepage = homepageRaw
    ? normalizeHomepageUrl(homepageRaw) ??
      (() => {
        throw new Error("INVALID_HOMEPAGE");
      })()
    : null;

  let youtube: string | null = null;
  try {
    youtube = normalizeYoutubeInput(String(formData.get("youtube") ?? ""));
  } catch {
    throw new Error("INVALID_YOUTUBE");
  }

  const imageFields = ["profileImageUrl", "headerImageUrl"] as const;
  const linkFields = ["instagram", "facebook", "tiktok", "spotify"] as const;
  const urls: Record<(typeof imageFields)[number] | (typeof linkFields)[number], string | null> =
    {
      profileImageUrl: null,
      headerImageUrl: null,
      instagram: null,
      facebook: null,
      tiktok: null,
      spotify: null,
    };
  for (const key of imageFields) {
    try {
      urls[key] = normalizeOptionalImageUrl(String(formData.get(key) ?? ""));
    } catch {
      throw new Error("INVALID_URL");
    }
  }
  for (const key of linkFields) {
    try {
      urls[key] = normalizeOptionalHttpUrl(String(formData.get(key) ?? ""));
    } catch {
      throw new Error("INVALID_URL");
    }
  }

  const sortRaw = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = sortRaw === "" ? 0 : Number.parseInt(sortRaw, 10);
  if (!Number.isFinite(sortOrder) || sortOrder < 0) throw new Error("INVALID_SORT");

  return {
    name,
    slug,
    legalName: optionalText(formData, "legalName"),
    artistType: parseArtistType(String(formData.get("artistType") ?? "solo").trim()),
    genre: optionalText(formData, "genre"),
    origin: optionalText(formData, "origin"),
    shortBio,
    biography,
    profileImageUrl: urls.profileImageUrl,
    headerImageUrl: urls.headerImageUrl,
    homepage,
    instagram: urls.instagram,
    facebook: urls.facebook,
    tiktok: urls.tiktok,
    youtube,
    spotify: urls.spotify,
    seoTitle: optionalText(formData, "seoTitle"),
    seoDescription: optionalText(formData, "seoDescription"),
    visibility: parseVisibility(
      String(formData.get("visibility") ?? defaults?.visibility ?? "published").trim(),
      parseVisibility(defaults?.visibility ?? "published"),
    ),
    sortOrder,
  };
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
          profileImageUrl: typeof r.profileImageUrl === "string" ? r.profileImageUrl : "",
          headerImageUrl: typeof r.headerImageUrl === "string" ? r.headerImageUrl : "",
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
