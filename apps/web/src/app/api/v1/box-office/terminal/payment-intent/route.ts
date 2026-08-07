import { NextResponse } from "next/server";
import { verifyBoxOfficeTapHandoff } from "@/lib/commerce/box-office-tap-token";
import { getStripe } from "@/lib/payments/stripe-client";
import {
  getStripeTerminalLocationId,
  isStripeTerminalConfigured,
} from "@/lib/payments/stripe-terminal";
import { prisma } from "@/lib/db";

/**
 * Fetch PaymentIntent client_secret for iOS Tap companion after handoff.
 * Deep links must NOT put clientSecret in the URL — use handoff token instead.
 *
 * POST { handoff } or Authorization: Bearer <handoff>
 * → { orderId, paymentIntentId, clientSecret, locationId? }
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
    // fall through to bearer
  }

  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
  const handoffToken = handoff || bearer;

  if (!handoffToken) {
    return NextResponse.json({ error: { code: "HANDOFF_REQUIRED" } }, { status: 401 });
  }

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
      stripePaymentIntentId: true,
    },
  });

  if (
    !order ||
    order.channel !== "box_office" ||
    order.paymentMethod !== "card_present" ||
    !order.stripePaymentIntentId
  ) {
    return NextResponse.json({ error: { code: "ORDER_NOT_FOUND" } }, { status: 404 });
  }

  if (order.paymentStatus === "paid" || order.paymentStatus === "canceled") {
    return NextResponse.json({ error: { code: "ORDER_CLOSED" } }, { status: 409 });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (!intent.client_secret) {
      return NextResponse.json(
        { error: { code: "CLIENT_SECRET_MISSING" } },
        { status: 502 },
      );
    }
    return NextResponse.json({
      orderId: order.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      locationId: getStripeTerminalLocationId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
