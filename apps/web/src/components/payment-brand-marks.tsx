import type { ReactNode } from "react";

/** Compact payment brand marks for trust UI (accepted methods). */

function MarkShell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-9 items-center justify-center rounded-md border border-[var(--tf-line)] bg-white px-2.5 ${className}`}
      title={label}
      aria-label={label}
    >
      {children}
    </span>
  );
}

export function VisaMark() {
  return (
    <MarkShell label="Visa">
      <span
        className="text-[13px] font-extrabold tracking-wide text-[#1A1F71]"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        VISA
      </span>
    </MarkShell>
  );
}

export function MastercardMark() {
  return (
    <MarkShell label="Mastercard">
      <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden>
        <circle cx="13" cy="11" r="8.5" fill="#EB001B" />
        <circle cx="21" cy="11" r="8.5" fill="#F79E1B" />
        <path d="M17 3.4a8.5 8.5 0 0 1 0 15.2 8.5 8.5 0 0 1 0-15.2Z" fill="#FF5F00" />
      </svg>
    </MarkShell>
  );
}

export function ApplePayMark() {
  return (
    <MarkShell label="Apple Pay">
      <span className="inline-flex items-center gap-1 text-[var(--tf-navy)]">
        <svg width="14" height="16" viewBox="0 0 14 18" aria-hidden className="shrink-0">
          <path
            fill="currentColor"
            d="M10.6 4.7c-.5.6-1.3 1.1-2.1 1-.1-.8.3-1.7.8-2.3.5-.6 1.4-1 2.1-1.1.1.9-.2 1.7-.8 2.4ZM11.4 5.9c-1.2 0-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.6-1.3.1-2.5.8-3.2 2-1.4 2.4-.3 5.9.9 7.8.6.9 1.4 2 2.4 1.9.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.7-.9 2.3-1.8.7-1 1-2 1-2.1s-2-.8-2-3c0-1.9 1.5-2.8 1.6-2.9-.9-1.3-2.3-1.5-2.5-1.6Z"
          />
        </svg>
        <span
          className="text-[12px] font-semibold"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          Pay
        </span>
      </span>
    </MarkShell>
  );
}

export function GooglePayMark() {
  return (
    <MarkShell label="Google Pay" className="!px-3">
      <span
        className="inline-flex items-baseline gap-1 whitespace-nowrap text-[12px] font-medium leading-none"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        <span>
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
        </span>
        <span className="font-semibold text-[#5F6368]">Pay</span>
      </span>
    </MarkShell>
  );
}

export function SepaMark() {
  return (
    <MarkShell label="SEPA-Lastschrift">
      <span className="text-[12px] font-bold tracking-wide text-[var(--tf-navy)]">SEPA</span>
    </MarkShell>
  );
}

export function KlarnaMark() {
  return (
    <MarkShell label="Klarna" className="!px-3">
      <span
        className="text-[13px] font-bold tracking-tight text-[#FFB3C7]"
        style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#0A0B09" }}
      >
        Klarna.
      </span>
    </MarkShell>
  );
}

/** Accepted online payment methods shown for trust — always centered. */
export function PaymentBrandRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
      role="list"
      aria-label="Akzeptierte Zahlungsarten"
    >
      <span role="listitem">
        <SepaMark />
      </span>
      <span role="listitem">
        <VisaMark />
      </span>
      <span role="listitem">
        <MastercardMark />
      </span>
      <span role="listitem">
        <ApplePayMark />
      </span>
      <span role="listitem">
        <GooglePayMark />
      </span>
      <span role="listitem">
        <KlarnaMark />
      </span>
    </div>
  );
}
