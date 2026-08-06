import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptStaffInvite, homePathForStaffRole } from "@/lib/admin/staff-invite";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await acceptStaffInvite(body);
    return NextResponse.json({
      ok: true,
      path: homePathForStaffRole(result.roleKey),
      email: result.user.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "INVITE_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
