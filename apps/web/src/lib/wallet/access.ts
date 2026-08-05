import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canUseTicketEntry, isTicketParty } from "@/lib/tickets/access";

/**
 * Same access rules as PDF download: holder / buyer / staff / order access token.
 * After transfer, only holder (or staff) may add to Wallet.
 */
export async function authorizeTicketWalletDownload(
  ticketId: string,
  requestUrl: string,
): Promise<
  | { ok: true; ticketId: string }
  | { ok: false; status: number; code: string }
> {
  const session = await getServerSession(authOptions);
  const accessToken = new URL(requestUrl).searchParams.get("t");

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { holder: true, order: { include: { customer: true } } },
  });
  if (!ticket) return { ok: false, status: 404, code: "NOT_FOUND" };

  let isStaff = false;
  if (session?.user) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership?.organizationId === ticket.organizationId) {
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
    }
  }

  const hasAccessToken = verifyOrderAccessToken(ticket.orderId, accessToken);
  const canViewOrder =
    Boolean(session?.user) &&
    isTicketParty({
      sessionUserId: session!.user!.id,
      sessionEmail: session!.user!.email,
      holder: ticket.holder,
      orderCustomer: ticket.order.customer,
    });
  if (!isStaff && !canViewOrder && !hasAccessToken) {
    return { ok: false, status: 403, code: "FORBIDDEN" };
  }

  const transferred =
    ticket.holderCustomerId != null && ticket.holderCustomerId !== ticket.order.customerId;

  const canEntry = canUseTicketEntry({
    sessionUserId: session?.user?.id,
    sessionEmail: session?.user?.email,
    holder: ticket.holder,
    isStaff,
  });
  if (!isStaff && transferred && !canEntry) {
    return { ok: false, status: 403, code: "TICKET_TRANSFERRED" };
  }
  if (!isStaff && !hasAccessToken && !canEntry) {
    return { ok: false, status: 403, code: "TICKET_TRANSFERRED" };
  }

  if (ticket.status !== "active") {
    return { ok: false, status: 400, code: "TICKET_INACTIVE" };
  }

  return { ok: true, ticketId: ticket.id };
}
