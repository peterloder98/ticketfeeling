import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrderFromCart } from "@/lib/commerce/checkout";
import { readCartSessionKeyFromRequest } from "@/lib/commerce/cart-session";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  optionalPostalCodeSchema,
  optionalStreetNameSchema,
  streetNameSchema,
  germanPostalCodeSchema,
} from "@/lib/commerce/address";
import {
  signOrderAccessToken,
  withOrderAccessQuery,
} from "@/lib/commerce/order-access";
import { assertMutationAllowed } from "@/lib/security/mutation-guard";
import { clientIpFromRequest, takeRateLimit } from "@/lib/security/rate-limit";

const schema = z
  .object({
    checkoutMode: z.enum(["guest", "register"]).default("guest"),
    preferGuest: z.boolean().optional(),
    paymentMethod: z
      .enum([
        "card",
        "sepa_debit",
        "apple_pay",
        "google_pay",
        "stripe_sepa",
        "stripe_card",
      ])
      .default("sepa_debit"),
    email: z.string().email(),
    password: z.string().min(8).optional(),
    salutation: z.string().optional(),
    gender: z.enum(["female", "male", "diverse"]),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    birthDate: z.string().optional(),
    street: optionalStreetNameSchema.or(z.literal("")),
    houseNumber: z.string().optional().default(""),
    postalCode: optionalPostalCodeSchema.or(z.literal("")),
    city: z.string().optional().default(""),
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
      const streetCheck = streetNameSchema.safeParse(data.street ?? "");
      if (!streetCheck.success) {
        const msg = streetCheck.error.issues[0]?.message ?? "INVOICE_FIELDS_REQUIRED";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["street"],
          message: msg === "STREET_NO_NUMBERS" ? "STREET_NO_NUMBERS" : "INVOICE_FIELDS_REQUIRED",
        });
      }
      const postalCheck = germanPostalCodeSchema.safeParse(data.postalCode ?? "");
      if (!postalCheck.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["postalCode"],
          message: "POSTAL_CODE_INVALID",
        });
      }
      if (!data.houseNumber?.trim() || !data.city?.trim()) {
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
    } else if (data.street?.trim() && streetContainsDigitsSafe(data.street)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["street"],
        message: "STREET_NO_NUMBERS",
      });
    } else if (data.postalCode?.trim() && !/^\d{4,5}$/.test(data.postalCode.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postalCode"],
        message: "POSTAL_CODE_INVALID",
      });
    }
  });

function streetContainsDigitsSafe(value: string) {
  return /[0-9]/.test(value);
}

export const dynamic = "force-dynamic";
/** Allow cold-start schema probe + Stripe PI without Vercel cutting mid-flight. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = assertMutationAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: { code: guard.code } }, { status: 403 });
  }
  const ip = clientIpFromRequest(request);
  const limited = takeRateLimit({ key: `checkout:${ip}`, limit: 15, windowMs: 10 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED" } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

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
        street: body.street || null,
        houseNumber: body.houseNumber || null,
        postalCode: body.postalCode || null,
        city: body.city || null,
        country: body.country ?? "DE",
      },
      customer: {
        email: body.email,
        checkoutMode,
        password: body.password,
        salutation: body.salutation,
        gender: body.gender,
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate: body.birthDate,
        street: body.street || null,
        houseNumber: body.houseNumber || null,
        postalCode: body.postalCode || null,
        city: body.city || null,
        country: body.country ?? "DE",
        phone: body.phone,
        acceptTerms: body.acceptTerms,
        acknowledgePrivacy: body.acknowledgePrivacy,
        acknowledgeNoWithdrawal: body.acknowledgeNoWithdrawal,
      },
    });
    const accessToken = signOrderAccessToken(result.order.id);
    const payBase = body.embed
      ? `/embed/checkout/pay/${result.order.id}`
      : `/checkout/pay/${result.order.id}`;
    return NextResponse.json({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentId: result.payment.id,
      providerPaymentId: result.payment.providerPaymentId,
      amountCents: result.payment.amountCents,
      customerTotalCents: result.order.customerTotalCents,
      paymentMethod: result.order.paymentMethod,
      clientSecret: result.clientSecret ?? null,
      accessToken,
      payUrl: withOrderAccessQuery(payBase, accessToken),
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
      const postalIssue = error.issues.find(
        (i) => i.path[0] === "postalCode" || i.message === "POSTAL_CODE_INVALID",
      );
      if (postalIssue?.message === "POSTAL_CODE_INVALID") {
        return NextResponse.json(
          { error: { code: "POSTAL_CODE_INVALID", message: POSTAL_CODE_DIGITS_ONLY_MESSAGE } },
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
    if (
      message === "PAYMENT_PROVIDER_TIMEOUT" ||
      message === "PAYMENT_PROVIDER_ERROR" ||
      message === "STRIPE_NOT_CONFIGURED"
    ) {
      return NextResponse.json({ error: { code: message } }, { status: 503 });
    }
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
