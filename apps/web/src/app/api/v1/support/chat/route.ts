import { NextResponse } from "next/server";
import { z } from "zod";
import { handleSupportChat } from "@/lib/support/chat";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().uuid().optional(),
  visitorId: z.string().max(64).optional(),
  channel: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Ungültige Anfrage", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const result = await handleSupportChat(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "NO_ORGANIZATION") {
      return NextResponse.json(
        { error: { code: "NO_ORGANIZATION", message: "Keine Organisation konfiguriert" } },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Chat vorübergehend nicht verfügbar" } },
      { status: 500 },
    );
  }
}
