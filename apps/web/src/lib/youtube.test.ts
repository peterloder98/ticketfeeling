import { describe, expect, it } from "vitest";
import { parseYoutubeVideoId } from "@/lib/youtube";

describe("parseYoutubeVideoId", () => {
  it("parses watch, short and bare ids", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=WS-15hSpp2E")).toBe(
      "WS-15hSpp2E",
    );
    expect(parseYoutubeVideoId("https://youtu.be/WS-15hSpp2E")).toBe("WS-15hSpp2E");
    expect(parseYoutubeVideoId("https://www.youtube.com/embed/WS-15hSpp2E")).toBe(
      "WS-15hSpp2E",
    );
    expect(parseYoutubeVideoId("WS-15hSpp2E")).toBe("WS-15hSpp2E");
  });

  it("rejects search URLs", () => {
    expect(
      parseYoutubeVideoId("https://www.youtube.com/results?search_query=Anni+Perka"),
    ).toBeNull();
  });
});
