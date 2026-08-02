import { BadgeCheck, ShieldCheck, Smartphone, Headphones } from "lucide-react";
import { PaymentBrandRow } from "@/components/payment-brand-marks";

const ITEMS = [
  { icon: BadgeCheck, label: "Direkt beim Veranstalter" },
  { icon: ShieldCheck, label: "Sichere Zahlung" },
  { icon: Smartphone, label: "Digitale Tickets sofort" },
  { icon: Headphones, label: "Persönlicher Support" },
];

export function TrustBar() {
  return (
    <section className="border-y border-[var(--tf-line)] bg-white">
      <div className="tf-container space-y-4 py-4 lg:py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(20,184,166,0.12)] text-[var(--tf-teal)]">
                <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <p className="text-sm font-medium text-[var(--tf-navy)]">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-[var(--tf-line)] pt-3 text-center">
          <p className="text-xs font-medium text-[var(--tf-text-secondary)]">
            Sicher bezahlen mit
          </p>
          <PaymentBrandRow />
        </div>
      </div>
    </section>
  );
}
