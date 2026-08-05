import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { writePayoutAudit } from "@/lib/stripe-payout/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const prisma = getPrisma();
  const doc = await prisma.payoutDocument.findUnique({ where: { id: documentId } });
  if (!doc?.pdfData) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await writePayoutAudit({
    localPayoutId: doc.localPayoutId,
    organizationId: doc.organizationId,
    action: "document_downloaded",
    newValue: { documentId: doc.id, documentNumber: doc.documentNumber },
    actorType: "user",
    actorId: session.user.id,
  });

  return new NextResponse(new Uint8Array(doc.pdfData), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.documentNumber ?? doc.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
