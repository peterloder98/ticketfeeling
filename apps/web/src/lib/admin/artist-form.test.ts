import { describe, expect, it } from "vitest";
import {
  normalizeHomepageUrl,
  normalizeOptionalHttpUrl,
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
});
