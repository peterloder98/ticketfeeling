import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  country: z.enum(["DE", "AT", "CH"]).default("DE"),
  code: z.string().regex(/^\d{4,5}$/),
});

/**
 * Resolves city for a postal code via OpenPLZ (DE/AT/CH).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = schema.parse({
      country: url.searchParams.get("country") ?? "DE",
      code: url.searchParams.get("code") ?? "",
    });

    const path =
      parsed.country === "DE"
        ? `https://openplzapi.org/de/Localities?postalCode=${parsed.code}`
        : parsed.country === "AT"
          ? `https://openplzapi.org/at/Localities?postalCode=${parsed.code}`
          : `https://openplzapi.org/ch/Localities?postalCode=${parsed.code}`;

    const res = await fetch(path, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ city: null }, { status: 200 });
    }

    const data = (await res.json()) as Array<{ name?: string; postalCode?: string }>;
    const city = data?.[0]?.name?.trim() || null;
    return NextResponse.json({ city, postalCode: parsed.code, country: parsed.country });
  } catch {
    return NextResponse.json({ city: null }, { status: 200 });
  }
}
