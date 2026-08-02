import { NextResponse } from "next/server";
import { z } from "zod";
import { requestForgottenTicket } from "@/lib/support/forgotten-ticket";

const bodySchema = z.object({
  email: z.string().email(),
  orderNumberHint: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Ungültige E-Mail" } },
        { status: 400 },
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const result = await requestForgottenTicket({
      email: parsed.data.email,
      orderNumberHint: parsed.data.orderNumberHint,
      ip,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        message:
          "Falls zu dieser E-Mail-Adresse eine passende bezahlte Bestellung existiert, senden wir dir in Kürze einen sicheren Link.",
      },
      { status: 200 },
    );
  }
}
