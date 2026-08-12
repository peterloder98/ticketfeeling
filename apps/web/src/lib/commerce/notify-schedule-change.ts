import { prisma } from "@/lib/db";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import {
  buildScheduleChangedMail,
  formatEventDateForSubject,
} from "@/lib/email/ticket-mail";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { formatDeDateTime } from "@/lib/datetime-de";
import { isWalkInCustomerEmail } from "@/lib/commerce/customers";
import {
  signOrderAccessToken,
  withOrderAccessQuery,
} from "@/lib/commerce/order-access";
import { writeAudit } from "@/lib/audit";
import { isScheduleChangeAlertsEnabled } from "@/lib/commerce/schedule-change";

function labelFor(date: Date | null | undefined): string | null {
  if (!date) return null;
  return formatDeDateTime(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Email paid/fulfilled ticket buyers about a confirmed schedule change.
 * Dedupes by customer email; skips walk-in / local stub addresses.
 */
export async function notifyBuyersOfScheduleChange(input: {
  organizationId: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  locationLabel?: string | null;
  oldStartsAt: Date | null;
  newStartsAt: Date | null;
  oldEndsAt: Date | null;
  newEndsAt: Date | null;
  oldDoorsOpenAt: Date | null;
  newDoorsOpenAt: Date | null;
}): Promise<{ emailed: number; skipped: number }> {
  if (!isScheduleChangeAlertsEnabled()) {
    return { emailed: 0, skipped: 0 };
  }

  const items = await prisma.orderItem.findMany({
    where: {
      eventId: input.eventId,
      order: {
        status: { in: ["paid", "fulfilled"] },
        voidedAt: null,
      },
    },
    select: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customer: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              gender: true,
              salutation: true,
            },
          },
        },
      },
    },
  });

  const byEmail = new Map<
    string,
    {
      orderId: string;
      orderNumber: string;
      firstName: string | null;
      lastName: string | null;
      gender: string | null;
      salutation: string | null;
    }
  >();

  for (const row of items) {
    const email = row.order.customer.email?.trim().toLowerCase();
    if (!email || isWalkInCustomerEmail(email)) continue;
    if (byEmail.has(email)) continue;
    byEmail.set(email, {
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      firstName: row.order.customer.firstName,
      lastName: row.order.customer.lastName,
      gender: row.order.customer.gender,
      salutation: row.order.customer.salutation,
    });
  }

  const base = getPublicAppUrl();
  const eventUrl = `${base}/event/${input.eventSlug}`;
  // Longer TTL so buyers can open the link days later.
  const tokenTtlMs = 30 * 24 * 60 * 60 * 1000;
  let emailed = 0;
  let skipped = 0;

  for (const [email, buyer] of byEmail) {
    const token = signOrderAccessToken(buyer.orderId, tokenTtlMs);
    const orderUrl = `${base}${withOrderAccessQuery(
      `/konto/bestellung/${buyer.orderId}`,
      token,
    )}`;
    const mail = buildScheduleChangedMail({
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      gender: buyer.gender,
      salutation: buyer.salutation,
      eventName: input.eventName,
      locationLabel: input.locationLabel,
      oldStartsLabel: labelFor(input.oldStartsAt),
      newStartsLabel: labelFor(input.newStartsAt),
      oldEndsLabel: labelFor(input.oldEndsAt),
      newEndsLabel: labelFor(input.newEndsAt),
      oldDoorsLabel: labelFor(input.oldDoorsOpenAt),
      newDoorsLabel: labelFor(input.newDoorsOpenAt),
      eventUrl,
      orderUrl,
      orderNumber: buyer.orderNumber,
    });

    try {
      await enqueueTransactionalEmail({
        organizationId: input.organizationId,
        to: email,
        template: "event_schedule_changed",
        subject: mail.subject,
        payload: {
          eventId: input.eventId,
          orderId: buyer.orderId,
          oldStartsAt: input.oldStartsAt?.toISOString() ?? null,
          newStartsAt: input.newStartsAt?.toISOString() ?? null,
        },
        text: mail.text,
        html: mail.html,
        embedLogo: true,
      });
      emailed += 1;
    } catch (err) {
      skipped += 1;
      console.error("[notifyBuyersOfScheduleChange]", email, err);
    }
  }

  await writeAudit({
    organizationId: input.organizationId,
    action: "event.schedule_change_notified",
    entityType: "event",
    entityId: input.eventId,
    after: {
      emailed,
      skipped,
      recipients: byEmail.size,
      newStartsAt: input.newStartsAt?.toISOString() ?? null,
      subjectHint: formatEventDateForSubject(input.newStartsAt),
    },
  });

  return { emailed, skipped };
}
