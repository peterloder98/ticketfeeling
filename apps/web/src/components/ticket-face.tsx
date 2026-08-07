import Image from "next/image";
import { COVER_DISPLAY_MAX_CLASS } from "@/lib/commerce/event-cover";
import {
  TF_TAGLINE,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";
import { TicketQrImage } from "@/components/ticket-qr-image";

type Props = {
  data: TicketPresentation;
  /** When false, show transferred / locked message instead of QR */
  showQr: boolean;
  qrSize?: number;
  transferredMessage?: string | null;
  /** Compact for embed */
  compact?: boolean;
};

/**
 * Classic-professional ticket face — shared visual language with PDF / print HTML.
 * Hierarchy: Event → Datum → Einlass → Beginn → Location → Kategorie → Platz → QR → Nr. → Veranstalter → TF footer.
 */
export function TicketFace({
  data,
  showQr,
  qrSize = 240,
  transferredMessage,
  compact = false,
}: Props) {
  const accent = data.isVip ? "var(--tf-gold)" : "var(--tf-teal)";
  const cover = data.coverUrl;

  return (
    <article
      className={`overflow-hidden border border-[var(--tf-line)] bg-white shadow-[0_12px_40px_rgba(15,39,71,0.08)] ${
        compact ? "rounded-[18px]" : "rounded-[24px]"
      }`}
    >
      <div
        className={`flex items-center justify-between gap-3 bg-[var(--tf-navy)] ${
          compact ? "px-4 py-3" : "px-6 py-4 md:px-8"
        }`}
      >
        <p className="text-[11px] font-bold tracking-[0.18em] text-white md:text-sm">
          TICKETFEELING
        </p>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.16em] md:text-xs"
          style={{ color: accent }}
        >
          {data.isVip ? "VIP-Ticket" : "Einlassticket"}
        </span>
      </div>
      <div className="h-1" style={{ background: accent }} />

      <div className={compact ? "space-y-5 p-4" : "space-y-7 p-6 md:p-8"}>
        {cover ? (
          <div className={`mx-auto w-full ${COVER_DISPLAY_MAX_CLASS}`}>
            <div className="relative aspect-square overflow-hidden bg-[var(--tf-navy)]">
              <Image
                src={cover}
                alt=""
                fill
                sizes="(max-width: 444px) 100vw, 444px"
                className="object-cover"
                unoptimized
                priority
              />
            </div>
          </div>
        ) : null}

        <header className="space-y-2 text-center">
          <h1
            className={`font-bold tracking-tight text-[var(--tf-navy)] ${
              compact ? "text-xl" : "text-2xl md:text-3xl"
            }`}
          >
            {data.eventName}
          </h1>
          {data.dateLabel ? (
            <p
              className={`font-medium text-[var(--tf-navy)] ${
                compact ? "text-sm" : "text-base md:text-lg"
              }`}
            >
              {data.dateLabel}
            </p>
          ) : null}
        </header>

        {data.doors.headline ? (
          <div className="text-center">
            <p
              className={`font-bold tracking-wide ${
                compact ? "text-lg" : "text-xl md:text-2xl"
              }`}
              style={{ color: data.isVip ? "var(--tf-gold)" : "var(--tf-navy)" }}
            >
              {data.doors.headline}
              {data.doors.timeLabel ? " Uhr" : ""}
            </p>
            {data.doors.doorsNote ? (
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                {data.doors.doorsNote}
              </p>
            ) : null}
          </div>
        ) : null}

        <dl
          className={`mx-auto grid max-w-md gap-x-6 gap-y-3 text-left ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {data.startLabel ? (
            <MetaRow label="Beginn" value={data.startLabel} />
          ) : null}
          <MetaRow label="Location" value={data.locationShort} />
          <MetaRow
            label="Kategorie"
            value={data.categoryName}
            valueClassName={data.isVip ? "text-[var(--tf-gold)]" : undefined}
          />
          <MetaRow label="Platz" value={data.placeLabel} />
          {data.priceLabel ? <MetaRow label="Preis" value={data.priceLabel} /> : null}
          {data.holderName ? <MetaRow label="Inhaber" value={data.holderName} /> : null}
        </dl>

        <div className="flex flex-col items-center rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-6">
          {showQr && data.qrToken ? (
            <>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: accent }}
              >
                QR-Code zum Einlass
              </p>
              <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
                <TicketQrImage token={data.qrToken} size={qrSize} />
              </div>
              <p
                className={`mt-4 font-semibold tracking-wide text-[var(--tf-navy)] ${
                  compact ? "text-sm" : "text-base"
                }`}
              >
                {data.ticketNumber}
              </p>
              <p className="mt-1 max-w-xs text-center text-xs text-[var(--tf-text-secondary)]">
                Am Einlass vorzeigen. Screenshot oder Ausdruck reicht.
              </p>
            </>
          ) : (
            <div className="max-w-sm text-center">
              <p className="text-sm font-semibold text-[var(--tf-navy)]">
                {transferredMessage ? "Ticket weitergeleitet" : "QR nicht verfügbar"}
              </p>
              {transferredMessage ? (
                <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
                  {transferredMessage}
                </p>
              ) : null}
              <p className="mt-3 text-sm font-medium text-[var(--tf-navy)]">
                {data.ticketNumber}
              </p>
            </div>
          )}
        </div>

        <footer className="space-y-2 border-t border-[var(--tf-line)] pt-5 text-center">
          <p className="text-xs text-[var(--tf-text-secondary)] md:text-sm">
            <span className="font-semibold text-[var(--tf-navy)]">Veranstalter:</span>{" "}
            {data.organizerDisplayName}
            {data.organizerAddress ? ` · ${data.organizerAddress}` : ""}
          </p>
          <p className="text-[11px] font-medium tracking-wide text-[var(--tf-text-secondary)]">
            {TF_TAGLINE}
          </p>
        </footer>
      </div>
    </article>
  );
}

function MetaRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 sm:grid-cols-[8.5rem_1fr]">
      <dt className="text-[var(--tf-text-secondary)]">{label}</dt>
      <dd className={`font-semibold text-[var(--tf-navy)] ${valueClassName ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
