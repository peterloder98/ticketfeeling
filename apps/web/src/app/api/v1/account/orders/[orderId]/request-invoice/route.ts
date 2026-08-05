import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

type Params = { params: Promise<{ orderId: string }> };

const bodySchema = z.object({
  recipientType: z.enum(["private", "company"]),
  street: z.string().trim().min(1),
  houseNumber: z.string().trim().min(1),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().trim().min(1),
  country: z.string().trim().min(2).max(2).optional(),
  companyName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  vatId: z.string().trim().optional(),
  orderReference: z.string().trim().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      invoices: { select: { id: true, buyerSnapshot: true }, take: 1 },
    },
  });
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const url = new URL(request.url);
  const accessToken = url.searchParams.get("t");
  const guestOk = verifyOrderAccessToken(order.id, accessToken);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() ?? "";
  const isOwner =
    Boolean(session?.user) &&
    (order.customer.userId === session!.user!.id ||
      order.customer.emailNormalized === email);

  if (!isOwner && !guestOk) {
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const paid =
    order.status === "paid" ||
    order.status === "fulfilled" ||
    order.paymentStatus === "paid";
  if (!paid) {
    return NextResponse.json({ error: { code: "ORDER_NOT_PAID" } }, { status: 400 });
  }

  if (order.invoiceRequested) {
    return NextResponse.json({
      ok: true,
      alreadyRequested: true,
      invoiceId: order.invoices[0]?.id ?? null,
    });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  if (body.recipientType === "company" && !body.companyName?.trim()) {
    return NextResponse.json({ error: { code: "COMPANY_NAME_REQUIRED" } }, { status: 400 });
  }

  const country = (body.country ?? "DE").toUpperCase();
  const billing =
    order.billingSnapshot &&
    typeof order.billingSnapshot === "object" &&
    !Array.isArray(order.billingSnapshot)
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};

  const buyerSnapshot = {
    ...billing,
    invoiceRequested: true,
    recipientType: body.recipientType,
    companyName: body.companyName?.trim() || null,
    contactName: body.contactName?.trim() || null,
    vatId: body.vatId?.trim() || null,
    orderReference: body.orderReference?.trim() || null,
    street: body.street.trim(),
    houseNumber: body.houseNumber.trim(),
    postalCode: body.postalCode,
    city: body.city.trim(),
    country,
  };

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        invoiceRequested: true,
        invoiceRecipientType: body.recipientType,
        invoiceCompanyName: body.companyName?.trim() || null,
        invoiceContactName: body.contactName?.trim() || null,
        invoiceVatId: body.vatId?.trim() || null,
        invoiceOrderReference: body.orderReference?.trim() || null,
        invoiceStreet: body.street.trim(),
        invoiceHouseNumber: body.houseNumber.trim(),
        invoicePostalCode: body.postalCode,
        invoiceCity: body.city.trim(),
        invoiceCountry: country,
      },
    });

    const invoice = order.invoices[0];
    if (invoice) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    invoiceId: order.invoices[0]?.id ?? null,
  });
}
