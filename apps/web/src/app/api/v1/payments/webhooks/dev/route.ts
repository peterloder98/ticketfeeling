import { NextResponse } from "next/server";
import { z } from "zod";
import { processDevPaymentWebhook } from "@/lib/commerce/payments-dev";

const schema = z.object({
  providerEventId: z.string().min(3),
  providerPaymentId: z.string().min(3),
  secret: z.string().min(3),
});

export async function POST(request: Request) {
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
