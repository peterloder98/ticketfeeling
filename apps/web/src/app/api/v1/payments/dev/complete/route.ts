import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { completeDevPaymentForOrder } from "@/lib/commerce/payments-dev";

const schema = z.object({
  orderId: z.string().uuid(),
  /** Short-lived checkout access token from the pay URL (`?t=`). */
  t: z.string().min(8).optional(),
});

/**
 * Authenticated test checkout completion — only when PAYMENT_PROVIDER=dev.
 * Does not require a client-side webhook secret (that left the pay button disabled on Vercel).
 */
export async function POST(request: Request) {
  if (getPaymentProvider().key !== "dev") {
    return NextResponse.json({ error: { code: "GONE" } }, { status: 404 });
  }

  try {
    const body = schema.parse(await request.json());
    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: {
        id: true,
        organizationId: true,
        customer: { select: { userId: true, emailNormalized: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: { code: "ORDER_NOT_FOUND" } }, { status: 404 });
    }

    const hasToken = Boolean(body.t && verifyOrderAccessToken(order.id, body.t));
    const session = await getServerSession(authOptions);
    let allowed = hasToken;
    if (!allowed && session?.user) {
      const email = session.user.email?.toLowerCase();
      if (
        (order.customer.userId && order.customer.userId === session.user.id) ||
        (email && order.customer.emailNormalized === email)
      ) {
        allowed = true;
      } else {
        const membership = await getDefaultOrganizationForUser(session.user.id);
        if (membership?.organizationId === order.organizationId) {
          allowed =
            (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
            (await userHasPermission(session.user.id, membership.organizationId, "events:read"));
        }
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const result = await completeDevPaymentForOrder(order.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "PAYMENT_NOT_FOUND" || message === "ORDER_NOT_FOUND"
        ? 404
        : message === "NOT_DEV_PROVIDER"
          ? 404
          : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
