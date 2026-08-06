import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBoxOfficeSeller } from "@/lib/commerce/box-office-auth";
import { assertCanSellBoxOfficeEvent } from "@/lib/commerce/box-office-access";
import { createBoxOfficeTapSale } from "@/lib/commerce/box-office-tap";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  optionalStreetNameSchema,
  optionalPostalCodeSchema,
} from "@/lib/commerce/address";

const itemSchema = z.object({
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  seatIds: z.array(z.string().uuid()).max(40).optional(),
});

const schema = z
  .object({
    eventId: z.string().uuid(),
    items: z.array(itemSchema).min(1).max(20).optional(),
    categoryId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(20).optional(),
    seatingMode: z.enum(["best_available", "seat_map", "free"]).optional(),
    customerEmail: z.string().email().optional().or(z.literal("")),
    customerFirstName: z.string().max(80).optional(),
    customerLastName: z.string().max(80).optional(),
    customerStreet: optionalStreetNameSchema,
    customerHouseNumber: z.string().max(20).optional(),
    customerPostalCode: optionalPostalCodeSchema.or(z.literal("")),
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

/** Create pending box-office order + Stripe Terminal PaymentIntent (Tap to Pay). */
export async function POST(request: Request) {
  const auth = await requireBoxOfficeSeller();
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.error.code } },
      { status: auth.error.status },
    );
  }

  try {
    const body = schema.parse(await request.json());
    await assertCanSellBoxOfficeEvent(auth.userId, auth.organizationId, body.eventId);

    const items =
      body.items?.length
        ? body.items
        : [{ categoryId: body.categoryId!, quantity: body.quantity! }];

    const result = await createBoxOfficeTapSale({
      eventId: body.eventId,
      items,
      seatingMode: body.seatingMode,
      customerEmail: body.customerEmail || undefined,
      customerFirstName: body.customerFirstName,
      customerLastName: body.customerLastName,
      customerStreet: body.customerStreet,
      customerHouseNumber: body.customerHouseNumber,
      customerPostalCode: body.customerPostalCode,
      customerCity: body.customerCity,
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const streetIssue = error.issues.find((i) => i.message === "STREET_NO_NUMBERS");
      if (streetIssue) {
        return NextResponse.json(
          { error: { code: "STREET_NO_NUMBERS", message: STREET_NO_NUMBERS_MESSAGE } },
          { status: 400 },
        );
      }
      const postalIssue = error.issues.find((i) => i.message === "POSTAL_CODE_INVALID");
      if (postalIssue) {
        return NextResponse.json(
          { error: { code: "POSTAL_CODE_INVALID", message: POSTAL_CODE_DIGITS_ONLY_MESSAGE } },
          { status: 400 },
        );
      }
    }
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "STRIPE_TERMINAL_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
