import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrCreateInvoicePdf } from "@/lib/commerce/invoice-pdf";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

type Params = { params: Promise<{ invoiceId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      order: { include: { customer: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const url = new URL(request.url);
  const accessToken = url.searchParams.get("t");
  const guestOk = verifyOrderAccessToken(invoice.orderId, accessToken);

  const session = await getServerSession(authOptions);
  let isStaff = false;
  let isOwner = false;

  if (session?.user) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership?.organizationId === invoice.organizationId) {
      // Least privilege: sell-only / events:read is not enough for any invoice PDF.
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "reports:read")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "audit:read"));
    }

    const email = session.user.email?.toLowerCase() ?? "";
    isOwner =
      invoice.order.customer.userId === session.user.id ||
      invoice.order.customer.emailNormalized === email;
  }

  if (!isStaff && !isOwner && !guestOk) {
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Customers/guests only get the PDF after explicitly requesting an invoice.
  if (!isStaff && !invoice.order.invoiceRequested) {
    return NextResponse.json({ error: { code: "INVOICE_NOT_REQUESTED" } }, { status: 403 });
  }

  try {
    // Always regenerate from invoice/order DB data — never serve/store pdf_data blobs.
    const pdf = await getOrCreateInvoicePdf(invoiceId);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
