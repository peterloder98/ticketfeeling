import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptBoxOfficeInvite } from "@/lib/commerce/box-office-invite";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await acceptBoxOfficeInvite(body);
    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
