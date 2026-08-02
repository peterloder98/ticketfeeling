import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { forwardTicket } from "@/lib/tickets/forward";

type Props = { params: Promise<{ ticketId: string }> };

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
});

export async function POST(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { ticketId } = await params;
  try {
    const body = schema.parse(await request.json());
    const result = await forwardTicket({
      ticketId,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
    });
    return NextResponse.json({
      ok: true,
      holder: result.holder,
      note: `Ticket an ${result.holder.email} gesendet.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION" } }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "FORBIDDEN"
        ? 403
        : message === "TICKET_NOT_FOUND"
          ? 404
          : message === "FORWARD_LIMIT"
            ? 429
            : message === "FORWARD_RECIPIENT_LOCKED"
              ? 409
              : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
