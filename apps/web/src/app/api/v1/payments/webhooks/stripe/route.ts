import { NextResponse } from "next/server";
import { getStripe } from "@/lib/payments/stripe-client";
import { processStripeWebhookEvent } from "@/lib/commerce/payments-stripe";
import { ensureSepaPaymentSchema } from "@/lib/commerce/ensure-sepa-schema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureSepaPaymentSchema(prisma);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET missing" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
