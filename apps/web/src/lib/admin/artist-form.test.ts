import { describe, expect, it } from "vitest";
import {
  normalizeHomepageUrl,
  normalizeYoutubeInput,
  parseArtistsJson,
} from "@/lib/admin/artist-form";

describe("artist-form helpers", () => {
  it("normalizes homepage URLs lightly", () => {
    expect(normalizeHomepageUrl("")).toBeNull();
    expect(normalizeHomepageUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeHomepageUrl("example.com")).toBe("https://example.com");
    expect(normalizeHomepageUrl("not a url")).toBeNull();
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
});
