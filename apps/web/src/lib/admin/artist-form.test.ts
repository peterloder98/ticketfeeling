import { describe, expect, it } from "vitest";
import {
  ARTIST_BIOGRAPHY_MAX,
  ARTIST_SHORT_BIO_MAX,
  clampArtistText,
  normalizeHomepageUrl,
  normalizeOptionalHttpUrl,
  normalizeOptionalImageUrl,
  normalizeYoutubeInput,
  parseArtistProfileForm,
  parseArtistsJson,
} from "@/lib/admin/artist-form";

describe("artist-form helpers", () => {
  it("normalizes homepage URLs lightly", () => {
    expect(normalizeHomepageUrl("")).toBeNull();
    expect(normalizeHomepageUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeHomepageUrl("example.com")).toBe("https://example.com");
    expect(normalizeHomepageUrl("not a url")).toBeNull();
  });

  it("normalizes optional http urls", () => {
    expect(normalizeOptionalHttpUrl("")).toBeNull();
    expect(normalizeOptionalHttpUrl("instagram.com/foo")).toBe("https://instagram.com/foo");
    expect(() => normalizeOptionalHttpUrl("not a url")).toThrow("INVALID_URL");
  });

  it("accepts uploaded asset paths and static image paths", () => {
    expect(normalizeOptionalImageUrl("/api/assets/2003cbc4-30c8-47e3-ab7b-4d38592d4b93")).toBe(
      "/api/assets/2003cbc4-30c8-47e3-ab7b-4d38592d4b93",
    );
    expect(normalizeOptionalImageUrl("/artists/anni-perka.jpg")).toBe("/artists/anni-perka.jpg");
    expect(normalizeOptionalImageUrl("cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp");
    expect(() => normalizeOptionalImageUrl("not a url")).toThrow("INVALID_URL");
  });

  it("accepts youtube watch urls and bare ids", () => {
    expect(normalizeYoutubeInput("https://www.youtube.com/watch?v=WS-15hSpp2E")).toBe(
      "https://www.youtube.com/watch?v=WS-15hSpp2E",
    );
    expect(normalizeYoutubeInput("WS-15hSpp2E")).toBe(
      "https://www.youtube.com/watch?v=WS-15hSpp2E",
    );
    expect(normalizeYoutubeInput("")).toBeNull();
    expect(() => normalizeYoutubeInput("https://example.com")).toThrow("INVALID_YOUTUBE");
  });

  it("parses artistsJson payloads", () => {
    const rows = parseArtistsJson(
      JSON.stringify([
        { name: " Anni ", homepage: "", youtube: "", bio: "" },
        { name: "  ", homepage: "x" },
        { id: "abc", name: "Norman", homepage: "norman.de", youtube: "", bio: "Hi" },
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Anni");
    expect(rows[1]?.id).toBe("abc");
    expect(rows[1]?.homepage).toBe("norman.de");
  });

  it("parses full artist profile forms", () => {
    const fd = new FormData();
    fd.set("name", " Anni Perka ");
    fd.set("artistType", "band");
    fd.set("genre", "Schlager");
    fd.set("visibility", "draft");
    fd.set("instagram", "instagram.com/anni");
    fd.set("sortOrder", "3");
    const parsed = parseArtistProfileForm(fd);
    expect(parsed.name).toBe("Anni Perka");
    expect(parsed.artistType).toBe("band");
    expect(parsed.genre).toBe("Schlager");
    expect(parsed.visibility).toBe("draft");
    expect(parsed.instagram).toBe("https://instagram.com/anni");
    expect(parsed.sortOrder).toBe(3);
  });

  it("requires a name on profile forms", () => {
    expect(() => parseArtistProfileForm(new FormData())).toThrow("NAME_REQUIRED");
  });

  it("clamps intro and biography to published limits", () => {
    expect(clampArtistText("  hi  ", 10)).toBe("hi");
    expect(clampArtistText("x".repeat(300), ARTIST_SHORT_BIO_MAX)?.length).toBe(
      ARTIST_SHORT_BIO_MAX,
    );
    expect(clampArtistText("y".repeat(5000), ARTIST_BIOGRAPHY_MAX)?.length).toBe(
      ARTIST_BIOGRAPHY_MAX,
    );

    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("shortBio", "a".repeat(400));
    fd.set("biography", "b".repeat(3000));
    const parsed = parseArtistProfileForm(fd);
    expect(parsed.shortBio?.length).toBe(ARTIST_SHORT_BIO_MAX);
    expect(parsed.biography?.length).toBe(ARTIST_BIOGRAPHY_MAX);
  });

  it("derives intro from biography when shortBio is empty", () => {
    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("biography", "c".repeat(400));
    const parsed = parseArtistProfileForm(fd);
    expect(parsed.shortBio?.length).toBe(ARTIST_SHORT_BIO_MAX);
    expect(parsed.biography?.length).toBe(400);
  });
});
