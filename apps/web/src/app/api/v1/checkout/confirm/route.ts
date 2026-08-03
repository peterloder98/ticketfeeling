import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrderFromCart } from "@/lib/commerce/checkout";
import { readCartSessionKeyFromRequest } from "@/lib/commerce/cart-session";
import { STREET_NO_NUMBERS_MESSAGE, streetNameSchema } from "@/lib/commerce/address";

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
    gender: z.enum(["female", "male", "diverse"]),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    birthDate: z.string().optional(),
    street: streetNameSchema,
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
    embed: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.checkoutMode === "register" && (!data.password || data.password.length < 8)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "PASSWORD_REQUIRED",
      });
    }
    if (data.invoiceRequested) {
      if (
        !data.street?.trim() ||
        !data.houseNumber?.trim() ||
        !data.postalCode?.trim() ||
        !data.city?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["invoiceRequested"],
          message: "INVOICE_FIELDS_REQUIRED",
        });
      }
      if (data.invoiceRecipientType === "company" && !data.invoiceCompanyName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["invoiceCompanyName"],
          message: "INVOICE_COMPANY_REQUIRED",
        });
      }
    }
  });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const session = await getServerSession(authOptions);
    const asGuest = body.preferGuest === true || body.checkoutMode === "guest";
    const checkoutMode = asGuest ? "guest" : "register";
    const sessionKey = await readCartSessionKeyFromRequest(request);
    const result = await createOrderFromCart({
      userId: asGuest ? null : session?.user?.id,
      sessionKey,
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
      payUrl: body.embed
        ? `/embed/checkout/pay/${result.order.id}`
        : `/checkout/pay/${result.order.id}`,
      createdAccount: checkoutMode === "register" && !session?.user?.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const streetIssue = error.issues.find((i) => i.path[0] === "street");
      if (streetIssue?.message === "STREET_NO_NUMBERS") {
        return NextResponse.json(
          { error: { code: "STREET_NO_NUMBERS", message: STREET_NO_NUMBERS_MESSAGE } },
          { status: 400 },
        );
      }
      const invoiceCompany = error.issues.find((i) => i.message === "INVOICE_COMPANY_REQUIRED");
      if (invoiceCompany) {
        return NextResponse.json({ error: { code: "INVOICE_COMPANY_REQUIRED" } }, { status: 400 });
      }
      const invoiceFields = error.issues.find((i) => i.message === "INVOICE_FIELDS_REQUIRED");
      if (invoiceFields) {
        return NextResponse.json({ error: { code: "INVOICE_FIELDS_REQUIRED" } }, { status: 400 });
      }
    }
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
