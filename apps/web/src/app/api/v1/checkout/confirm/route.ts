import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrderFromCart } from "@/lib/commerce/checkout";

const schema = z
  .object({
    checkoutMode: z.enum(["guest", "register"]).default("guest"),
    preferGuest: z.boolean().optional(),
    paymentMethod: z.enum([
      "card",
      "sepa_debit",
      "apple_pay",
      "google_pay",
      "stripe_sepa",
      "stripe_card",
    ]),
    email: z.string().email(),
    password: z.string().min(8).optional(),
    salutation: z.string().optional(),
    gender: z.enum(["female", "male", "diverse", "undisclosed"]).optional(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    birthDate: z.string().optional(),
    street: z.string().min(1),
    houseNumber: z.string().min(1),
    postalCode: z.string().regex(/^\d{4,5}$/),
    city: z.string().min(1),
    country: z.string().optional(),
    phone: z.string().optional(),
    acceptTerms: z.literal(true),
    acknowledgePrivacy: z.literal(true),
    acknowledgeNoWithdrawal: z.literal(true),
    invoiceRequested: z.boolean().optional(),
    invoiceRecipientType: z.enum(["private", "company"]).optional(),
    invoiceCompanyName: z.string().optional(),
    invoiceContactName: z.string().optional(),
    invoiceVatId: z.string().optional(),
    invoiceOrderReference: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.checkoutMode === "register" && (!data.password || data.password.length < 8)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "PASSWORD_REQUIRED",
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const session = await getServerSession(authOptions);
    const asGuest = body.preferGuest === true || body.checkoutMode === "guest";
    const checkoutMode = asGuest ? "guest" : "register";
    const result = await createOrderFromCart({
      userId: asGuest ? null : session?.user?.id,
      paymentMethod: body.paymentMethod,
      invoice: {
        requested: Boolean(body.invoiceRequested),
        recipientType: body.invoiceRecipientType ?? null,
        companyName: body.invoiceCompanyName ?? null,
        contactName: body.invoiceContactName ?? null,
        vatId: body.invoiceVatId ?? null,
        orderReference: body.invoiceOrderReference ?? null,
        street: body.street,
        houseNumber: body.houseNumber,
        postalCode: body.postalCode,
        city: body.city,
        country: body.country ?? "DE",
      },
      customer: {
        ...body,
        checkoutMode,
      },
    });
    return NextResponse.json({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentId: result.payment.id,
      providerPaymentId: result.payment.providerPaymentId,
      amountCents: result.payment.amountCents,
      customerTotalCents: result.order.customerTotalCents,
      paymentMethod: result.order.paymentMethod,
      clientSecret: result.clientSecret ?? null,
      payUrl: `/checkout/pay/${result.order.id}`,
      createdAccount: checkoutMode === "register" && !session?.user?.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
