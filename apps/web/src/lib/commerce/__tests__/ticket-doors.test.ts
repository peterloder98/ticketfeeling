import { describe, expect, it } from "vitest";
import {
  doorsHeadlineLabel,
  resolveTicketDoors,
} from "@/lib/commerce/ticket-doors";

describe("resolveTicketDoors", () => {
  const eventDoors = new Date("2026-12-12T15:00:00.000Z"); // 16:00 Berlin winter
  const vipDoors = new Date("2026-12-12T14:00:00.000Z"); // 15:00 Berlin

  it("uses event doors when category has no override", () => {
    const r = resolveTicketDoors(
      { doorsOpenAt: eventDoors },
      { name: "VIP", doorsOpenAt: null, doorsNote: null },
    );
    expect(r.isCategoryOverride).toBe(false);
    expect(r.doorsOpenAt).toEqual(eventDoors);
    expect(r.headlineLabel).toBe("EINLASS");
    expect(r.headline).toMatch(/^EINLASS /);
    expect(r.doorsNote).toBeNull();
  });

  it("uses category doors and note when set", () => {
    const r = resolveTicketDoors(
      { doorsOpenAt: eventDoors },
      {
        name: "VIP",
        doorsOpenAt: vipDoors,
        doorsNote: "VIP-Einlass über den Haupteingang",
      },
    );
    expect(r.isCategoryOverride).toBe(true);
    expect(r.doorsOpenAt).toEqual(vipDoors);
    expect(r.headlineLabel).toBe("VIP-EINLASS");
    expect(r.headline).toMatch(/^VIP-EINLASS /);
    expect(r.doorsNote).toBe("VIP-Einlass über den Haupteingang");
  });

  it("falls back to null when neither set", () => {
    const r = resolveTicketDoors({ doorsOpenAt: null }, null);
    expect(r.doorsOpenAt).toBeNull();
    expect(r.headline).toBeNull();
  });

  it("builds headline labels without VIP hardcoding", () => {
    expect(doorsHeadlineLabel(null, false)).toBe("EINLASS");
    expect(doorsHeadlineLabel("Lounge", true)).toBe("LOUNGE-EINLASS");
    expect(doorsHeadlineLabel("Früh-Einlass", true)).toBe("FRÜH-EINLASS");
  });
});
