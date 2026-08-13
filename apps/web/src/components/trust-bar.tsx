import { BadgeCheck, ShieldCheck, Ticket } from "lucide-react";
import { PaymentBrandRow } from "@/components/payment-brand-marks";

export function TrustBar() {
  return (
    <section className="border-y border-[var(--tf-line)] bg-[var(--tf-card)]">
      <div className="tf-container flex flex-col items-center gap-4 py-5 md:flex-row md:justify-between md:gap-6 md:py-5">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:justify-start">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[var(--tf-navy)]">
            <BadgeCheck
              className="h-4 w-4 shrink-0 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            Direkt vom Veranstalter
          </p>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[var(--tf-navy)]">
            <ShieldCheck
              className="h-4 w-4 shrink-0 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            Sicher bezahlen
          </p>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[var(--tf-navy)]">
            <Ticket
              className="h-4 w-4 shrink-0 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            Ticket sofort erhalten
          </p>
        </div>
        <PaymentBrandRow />
      </div>
    </section>
  );
}
