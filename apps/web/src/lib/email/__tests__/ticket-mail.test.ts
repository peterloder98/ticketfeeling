import { describe, expect, it } from "vitest";
import {
  buildOrderPaidTicketsMail,
  buildScheduleChangedMail,
} from "@/lib/email/ticket-mail";
import {
  DEFAULT_LEGAL_PERSON_LINE,
  DEFAULT_PUBLIC_COMPANY_ADDRESS,
  formatCompanyAddressBlock,
  formatCompanyAddressLine,
} from "@/lib/legal/company-address";

/** Platform imprint markers that must not appear in transactional buyer mail. */
const IMPRINT_MARKERS = [
  "Innere Münchener",
  "Konradinstr",
  "84028",
  "84032",
  "Peter Loder (Einzelunternehmen)",
  formatCompanyAddressLine(DEFAULT_PUBLIC_COMPANY_ADDRESS),
  formatCompanyAddressBlock(DEFAULT_PUBLIC_COMPANY_ADDRESS, {
    legalPersonLine: DEFAULT_LEGAL_PERSON_LINE,
  }),
];

function expectNoCompanyImprint(payload: string) {
  for (const marker of IMPRINT_MARKERS) {
    expect(payload).not.toContain(marker);
  }
}

describe("ticket-mail", () => {
  it("omits company address from schedule-change HTML and text", () => {
    const mail = buildScheduleChangedMail({
      firstName: "Max",
      lastName: "Fröhlich",
      gender: "male",
      salutation: null,
      eventName: "Weihnachtstraum",
      locationLabel: "Stadthalle Landshut",
      oldStartsLabel: "Sa., 12. Dez. 2026, 19:00",
      newStartsLabel: "So., 13. Dez. 2026, 19:00",
      oldDoorsLabel: "Sa., 12. Dez. 2026, 18:00",
      newDoorsLabel: "So., 13. Dez. 2026, 18:00",
      oldEndsLabel: "Sa., 12. Dez. 2026, 22:00",
      newEndsLabel: "So., 13. Dez. 2026, 22:00",
      eventUrl: "https://ticketfeeling.example/event/weihnachtstraum",
      orderUrl: "https://ticketfeeling.example/konto/bestellung/o1",
      orderNumber: "TF-O-1",
    });

    expectNoCompanyImprint(mail.html);
    expectNoCompanyImprint(mail.text);
    expect(mail.subject).toBe("Terminänderung – Weihnachtstraum");
    expect(mail.html).toContain("Was sich ändert");
    expect(mail.html).toContain("Bisher");
    expect(mail.html).toContain("Neu");
    expect(mail.html).toContain("Sa., 12. Dez. 2026, 19:00");
    expect(mail.html).toContain("So., 13. Dez. 2026, 19:00");
    expect(mail.html).toContain("Ihre Tickets bleiben für den neuen Termin gültig");
    expect(mail.html).toContain("Bestellung TF-O-1 öffnen");
    expect(mail.html).toContain("Stadthalle Landshut");
    expect(mail.html).not.toMatch(/Peter Loder/);
  });

  it("omits company address from order confirmation mail", () => {
    const mail = buildOrderPaidTicketsMail({
      firstName: "Max",
      lastName: "Muster",
      eventName: "Demo Event",
      whenLabel: "Sa., 1. Jan. 2027, 20:00",
      orderId: "ord-1",
      orderNumber: "TF-O-2",
      ticketCount: 2,
    });

    expectNoCompanyImprint(mail.html);
    expectNoCompanyImprint(mail.text);
    expect(mail.html).not.toMatch(/Peter Loder/);
    expect(mail.html).toContain("Fragen?");
  });
});
