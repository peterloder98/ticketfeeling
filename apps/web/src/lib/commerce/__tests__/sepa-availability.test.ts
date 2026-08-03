import { describe, expect, it } from "vitest";
import {
  isSepaAvailableForEventStart,
  isSepaDisabledForCheckout,
  resolveSepaMinDaysBeforeEvent,
} from "@/lib/commerce/sepa-availability";
import {
  buildCheckoutPaymentOptions,
  DEFAULT_PAYMENT_FEE_CONFIG,
  DEFAULT_PAYMENT_UI_CONFIG,
  translateStripePaymentError,
} from "@/lib/commerce/payment-fees";

describe("sepa availability", () => {
  it("disables SEPA within the cutoff window", () => {
    const eventStart = new Date("2026-02-14T17:00:00+01:00");
    const beforeCutoff = new Date("2026-02-07T16:59:00+01:00");
    const atCutoff = new Date("2026-02-07T17:00:00+01:00");
    expect(isSepaAvailableForEventStart(eventStart, 7, beforeCutoff)).toBe(true);
    expect(isSepaAvailableForEventStart(eventStart, 7, atCutoff)).toBe(false);
  });

  it("uses event override over org default", () => {
    expect(
      resolveSepaMinDaysBeforeEvent({ orgDays: 7, eventDays: 3 }),
    ).toBe(3);
    expect(resolveSepaMinDaysBeforeEvent({ orgDays: 7, eventDays: null })).toBe(7);
  });

  it("disables checkout SEPA for soonest restricted event", () => {
    const now = new Date("2026-02-10T12:00:00+01:00");
    const disabled = isSepaDisabledForCheckout({
      now,
      orgSepaMinDays: 7,
      items: [
        { eventStartsAt: new Date("2026-03-01T17:00:00+01:00"), eventSepaMinDays: null },
        { eventStartsAt: new Date("2026-02-14T17:00:00+01:00"), eventSepaMinDays: 7 },
      ],
    });
    expect(disabled).toBe(true);
  });
});

describe("checkout payment options", () => {
  it("puts SEPA first with Empfohlen badge as the default recommended method", () => {
    const options = buildCheckoutPaymentOptions({
      customerTotalCents: 6077,
      config: {
        ...DEFAULT_PAYMENT_FEE_CONFIG,
        sepa_debit: { ...DEFAULT_PAYMENT_FEE_CONFIG.sepa_debit, active: true },
        card: { ...DEFAULT_PAYMENT_FEE_CONFIG.card, active: true },
      },
      ui: DEFAULT_PAYMENT_UI_CONFIG,
      stripeLiveConfigured: true,
    });
    expect(options[0]?.key).toBe("sepa_debit");
    expect(options[0]?.title).toBe("Lastschrift vom Bankkonto");
    expect(options[0]?.recommendedBadgeText).toBe("Empfohlen");
    expect(options[0]?.subtitle).toBe("SEPA-Lastschrift");
    expect(options.every((o) => o.estimatedNetPayoutCents >= 0)).toBe(true);
    // Customer total is independent of method — fee estimates differ but options share same checkout total
    expect(new Set(options.map(() => 6077)).size).toBe(1);
  });

  it("keeps SEPA visible but not selectable when near event", () => {
    const options = buildCheckoutPaymentOptions({
      customerTotalCents: 6077,
      config: DEFAULT_PAYMENT_FEE_CONFIG,
      ui: DEFAULT_PAYMENT_UI_CONFIG,
      stripeLiveConfigured: true,
      sepaDisabled: true,
    });
    const sepa = options.find((o) => o.key === "sepa_debit");
    expect(sepa?.selectable).toBe(false);
    expect(sepa?.visible).toBe(true);
    expect(sepa?.badge).toBe("unavailable");
  });

  it("translates SEPA Stripe errors", () => {
    expect(translateStripePaymentError("Invalid SEPA Debit Payment Method")).toBe(
      "Bitte prüfe deine IBAN und versuche es erneut.",
    );
  });
});
