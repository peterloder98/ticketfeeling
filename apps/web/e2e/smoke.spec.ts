import { test, expect } from "@playwright/test";

/**
 * Minimal public smoke — homepage, events list, one event page, health.
 * No login, no Stripe, no Prisma seed required (pages may be empty).
 */
test.describe("public smoke", () => {
  test("homepage returns 200", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status(), "homepage").toBe(200);
  });

  test("/events returns 200", async ({ request }) => {
    const res = await request.get("/events");
    expect(res.status(), "/events").toBe(200);
  });

  test("one public event page returns 200", async ({ request }) => {
    const preferred = "/event/schlagerfeeling-weihnachtstraum-2026";
    let res = await request.get(preferred);
    if (res.status() === 404) {
      // Fallback: parse first event link from /events if seed slug missing
      const list = await request.get("/events");
      expect(list.status()).toBe(200);
      const html = await list.text();
      const match = html.match(/href="(\/event\/[^"]+)"/);
      test.skip(!match, "no public event slug available");
      res = await request.get(match![1]);
    }
    expect(res.status(), "public event page").toBe(200);
  });

  test("health endpoint is ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok?: boolean; db?: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
  });
});
