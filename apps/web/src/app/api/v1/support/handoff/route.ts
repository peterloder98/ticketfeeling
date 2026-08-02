import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupportHandoff } from "@/lib/support/chat";

const bodySchema = z.object({
  email: z.string().email(),
  subject: z.string().min(3).max(200),
  body: z.string().min(5).max(5000),
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Ungültige Anfrage" } },
      { status: 400 },
    );
  }

  const result = await createSupportHandoff(parsed.data);
  return NextResponse.json({ id: result.id, status: result.status });
}
