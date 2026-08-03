import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { createBoxOfficeSale } from "@/lib/commerce/box-office";
import { assertCanSellBoxOfficeEvent } from "@/lib/commerce/box-office-access";
import { STREET_NO_NUMBERS_MESSAGE, optionalStreetNameSchema } from "@/lib/commerce/address";

const itemSchema = z.object({
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});

const schema = z
  .object({
    eventId: z.string().uuid(),
    items: z.array(itemSchema).min(1).max(20).optional(),
    /** @deprecated single-line payload — prefer items[] */
    categoryId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(20).optional(),
    paymentMethod: z.enum(["cash", "card_terminal", "other"]),
    cashTenderedCents: z.number().int().min(0).optional().nullable(),
    customerEmail: z.string().email().optional().or(z.literal("")),
    customerFirstName: z.string().max(80).optional(),
    customerLastName: z.string().max(80).optional(),
    customerStreet: optionalStreetNameSchema,
    customerHouseNumber: z.string().max(20).optional(),
    customerPostalCode: z.string().max(20).optional(),
    customerCity: z.string().max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.items?.length && !(val.categoryId && val.quantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ITEMS_REQUIRED",
        path: ["items"],
      });
    }
  });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  }

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    await assertCanSellBoxOfficeEvent(
      session.user.id,
      membership.organizationId,
      body.eventId,
    );

    const items =
      body.items?.length
        ? body.items
        : [{ categoryId: body.categoryId!, quantity: body.quantity! }];

    const result = await createBoxOfficeSale({
      eventId: body.eventId,
      items,
      paymentMethod: body.paymentMethod,
      cashTenderedCents: body.cashTenderedCents,
      customerEmail: body.customerEmail || undefined,
      customerFirstName: body.customerFirstName,
      customerLastName: body.customerLastName,
      customerStreet: body.customerStreet,
      customerHouseNumber: body.customerHouseNumber,
      customerPostalCode: body.customerPostalCode,
      customerCity: body.customerCity,
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
    });
    return NextResponse.json({
      orderId: result.orderId,
      detailPath: `/kasse/beleg/${result.orderId}`,
      listPath: "/kasse#verkaeufe",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const streetIssue = error.issues.find((i) => i.message === "STREET_NO_NUMBERS");
      if (streetIssue) {
        return NextResponse.json(
          { error: { code: "STREET_NO_NUMBERS", message: STREET_NO_NUMBERS_MESSAGE } },
          { status: 400 },
        );
      }
    }
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
