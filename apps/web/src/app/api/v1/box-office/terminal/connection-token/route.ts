import { NextResponse } from "next/server";
import { requireBoxOfficeSeller } from "@/lib/commerce/box-office-auth";
import { verifyBoxOfficeTapHandoff } from "@/lib/commerce/box-office-tap-token";
import {
  createTerminalConnectionToken,
  getStripeTerminalLocationId,
  isStripeTerminalConfigured,
} from "@/lib/payments/stripe-terminal";
import { prisma } from "@/lib/db";

/**
 * Stripe Terminal ConnectionToken for authenticated Kasse staff OR a valid tap handoff token.
 * POST body optional: { handoff?: string }
 */
export async function POST(request: Request) {
  if (!isStripeTerminalConfigured()) {
    return NextResponse.json(
      { error: { code: "STRIPE_TERMINAL_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }

  let handoff: string | undefined;
  try {
    const body = (await request.json()) as { handoff?: string };
    handoff = typeof body?.handoff === "string" ? body.handoff : undefined;
  } catch {
    // empty body is fine for session-authenticated staff
  }

  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
  const handoffToken = handoff || bearer;

  if (handoffToken) {
    const verified = verifyBoxOfficeTapHandoff(handoffToken);
    if (!verified.ok || !verified.orderId) {
      return NextResponse.json({ error: { code: "INVALID_HANDOFF" } }, { status: 401 });
    }
    const order = await prisma.order.findUnique({
      where: { id: verified.orderId },
      select: {
        id: true,
        channel: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });
    if (
      !order ||
      order.channel !== "box_office" ||
      order.paymentMethod !== "card_present"
    ) {
      return NextResponse.json({ error: { code: "ORDER_NOT_FOUND" } }, { status: 404 });
    }
    if (order.paymentStatus === "paid" || order.paymentStatus === "canceled") {
      return NextResponse.json({ error: { code: "ORDER_CLOSED" } }, { status: 409 });
    }
  } else {
    const auth = await requireBoxOfficeSeller();
    if (!auth.ok) {
      return NextResponse.json(
        { error: { code: auth.error.code } },
        { status: auth.error.status },
      );
    }
  }

  try {
    const { secret } = await createTerminalConnectionToken();
    return NextResponse.json({
      secret,
      locationId: getStripeTerminalLocationId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
