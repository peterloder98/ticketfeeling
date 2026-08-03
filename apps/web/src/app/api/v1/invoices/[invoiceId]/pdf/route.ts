import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrCreateInvoicePdf } from "@/lib/commerce/invoice-pdf";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

type Params = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

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

  let isStaff = false;
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership?.organizationId === invoice.organizationId) {
    isStaff =
      (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));
  }

  const email = session.user.email?.toLowerCase() ?? "";
  const isOwner =
    invoice.order.customer.userId === session.user.id ||
    invoice.order.customer.emailNormalized === email;

  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    const pdf = await getOrCreateInvoicePdf(invoiceId, { persist: true });
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
