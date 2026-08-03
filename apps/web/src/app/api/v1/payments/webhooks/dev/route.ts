import { NextResponse } from "next/server";
import { z } from "zod";
import { processDevPaymentWebhook } from "@/lib/commerce/payments-dev";
import { getPaymentProvider } from "@/lib/payments";

const schema = z.object({
  providerEventId: z.string().min(3),
  providerPaymentId: z.string().min(3),
  secret: z.string().min(3),
});

export async function POST(request: Request) {
  // Never accept the fake webhook in production or when Stripe is the live provider.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.PAYMENT_PROVIDER === "stripe" ||
    getPaymentProvider().key === "stripe"
  ) {
    return NextResponse.json({ error: { code: "GONE" } }, { status: 404 });
  }
  if (!process.env.DEV_PAYMENT_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json({ error: { code: "INVALID_SIGNATURE" } }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const result = await processDevPaymentWebhook(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "INVALID_SIGNATURE" ? 401 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
