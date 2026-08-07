import { NextResponse } from "next/server";
import { z } from "zod";
import {
  FORGOTTEN_TICKET_GENERIC_MESSAGE,
  requestForgottenTicket,
} from "@/lib/support/forgotten-ticket";
import { clientIpFromRequest, takeRateLimit } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  orderNumberHint: z.string().max(64).optional(),
  lastName: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      // Neutral — do not leak validation details that help enumeration
      return NextResponse.json({ message: FORGOTTEN_TICKET_GENERIC_MESSAGE });
    }

    const ip = clientIpFromRequest(request);
    const limited = await takeRateLimit({
      key: `forgotten-ticket:ip:${ip}`,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json({
        message: FORGOTTEN_TICKET_GENERIC_MESSAGE,
        rateLimited: true,
      });
    }

    const result = await requestForgottenTicket({
      email: parsed.data.email,
      orderNumberHint: parsed.data.orderNumberHint,
      lastName: parsed.data.lastName,
      ip,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { message: FORGOTTEN_TICKET_GENERIC_MESSAGE },
      { status: 200 },
    );
  }
}
