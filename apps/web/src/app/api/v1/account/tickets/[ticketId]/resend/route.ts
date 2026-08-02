import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resendTicketMail } from "@/lib/support/forgotten-ticket";

type Props = { params: Promise<{ ticketId: string }> };

export async function POST(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { holder: true, order: { include: { customer: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const { isTicketParty } = await import("@/lib/tickets/access");
  const allowed = isTicketParty({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
    holder: ticket.holder,
    orderCustomer: ticket.order.customer,
  });
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    await resendTicketMail({
      ticketId,
      actorUserId: session.user.id,
      channel: "account",
    });
    return NextResponse.json({
      ok: true,
      note: "Erneuter Versand wurde angestoßen (E-Mail-Provider Stub in Entwicklung).",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
