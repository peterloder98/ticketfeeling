import { describe, expect, it } from "vitest";
import {
  eventInheritsTourArtists,
  resolveEffectiveArtistLinks,
  resolveEffectiveListingArtists,
} from "@/lib/commerce/effective-event-artists";

describe("effective-event-artists", () => {
  const tourArtists = [
    {
      id: "ta1",
      role: "headliner",
      isHeadliner: true,
      sortOrder: 0,
      artist: { name: "Tour Star", profileImageUrl: "/t.jpg" as string | null },
    },
  ];
  const eventArtists = [
    {
      id: "ea1",
      role: "artist",
      isHeadliner: false,
      sortOrder: 0,
      artist: { name: "Guest", profileImageUrl: null as string | null },
    },
  ];

  it("inherits tour artists when flag is true", () => {
    expect(
      eventInheritsTourArtists({ tourId: "t1", artistsUseTourDefaults: true }),
    ).toBe(true);
    const links = resolveEffectiveArtistLinks({
      tourId: "t1",
      artistsUseTourDefaults: true,
      artists: eventArtists,
      tour: { artists: tourArtists },
    });
    expect(links[0]?.artist.name).toBe("Tour Star");
  });

  it("uses event override when flag is false", () => {
    const links = resolveEffectiveArtistLinks({
      tourId: "t1",
      artistsUseTourDefaults: false,
      artists: eventArtists,
      tour: { artists: tourArtists },
    });
    expect(links[0]?.artist.name).toBe("Guest");
  });

  it("uses event artists when not on a tour", () => {
    const links = resolveEffectiveListingArtists({
      tourId: null,
      artistsUseTourDefaults: true,
      artists: eventArtists,
      tour: null,
    });
    expect(links).toEqual([{ name: "Guest", imageUrl: null }]);
  });

  it("falls back to event artists when tour line-up is empty", () => {
    const links = resolveEffectiveArtistLinks({
      tourId: "t1",
      artistsUseTourDefaults: true,
      artists: eventArtists,
      tour: { artists: [] },
    });
    expect(links[0]?.artist.name).toBe("Guest");
  });
});
