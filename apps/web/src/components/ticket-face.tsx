import Image from "next/image";
import { BrandLogo } from "@/components/brand-logo";
import { TicketQrImage } from "@/components/ticket-qr-image";
import {
  parseSeatHighlight,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TF_TAGLINE,
  TICKET_BODY_ASPECT,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

type Props = {
  data: TicketPresentation;
  /** When false, show transferred / locked message instead of QR */
  showQr: boolean;
  qrSize?: number;
  transferredMessage?: string | null;
  /** Compact for embed — same landscape body, slightly tighter type */
  compact?: boolean;
};

const coverPct = Math.round(TICKET_COL_COVER * 100);
const qrPct = Math.round(TICKET_COL_QR * 100);
const infoPct = 100 - coverPct - qrPct;

/**
 * Live ticket face — locked landscape ~2:1 concert strip (cover | info | QR).
 * Never reflows to portrait; mobile may shrink/scroll the whole strip.
 * Print@Home PDF/HTML use the same proportions.
 */
export function TicketFace({
  data,
  showQr,
  qrSize = 168,
  transferredMessage,
  compact = false,
}: Props) {
  const accent = data.isVip ? "var(--tf-gold)" : "var(--tf-teal)";
  const cover = data.coverUrl;
  const admitLabel = data.isVip ? "VIP-TICKET" : "EINLASSTICKET";
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const doorsColor =
    data.isVip || data.doors.isCategoryOverride ? accent : "var(--tf-navy)";

  return (
    <div className="w-full min-w-0">
      <div className="w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <article
          className={`relative mx-auto grid w-full overflow-hidden border border-[var(--tf-line)] bg-white shadow-[0_12px_40px_rgba(15,39,71,0.08)] ${
            compact ? "min-w-[560px] max-w-[720px] rounded-[14px]" : "min-w-[640px] max-w-[900px] rounded-[16px]"
          }`}
          style={{
            aspectRatio: `${TICKET_BODY_ASPECT} / 1`,
            gridTemplateColumns: `${coverPct}% minmax(0,${infoPct}%) ${qrPct}%`,
          }}
        >
          {/* Accent edge */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px]"
            style={{ background: accent }}
            aria-hidden
          />

          {/* LEFT — cover full height */}
          <div className="relative min-h-0 min-w-0 overflow-hidden bg-[var(--tf-navy)]">
            {cover ? (
              <Image
                src={cover}
                alt=""
                fill
                sizes="(max-width: 900px) 33vw, 300px"
                className="object-cover"
                unoptimized
                priority
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-white">
                <p className="text-[10px] font-bold tracking-[0.16em] md:text-xs">
                  TICKETFEELING
                </p>
                <p className="text-[9px] opacity-75 md:text-[10px]">{TF_TAGLINE}</p>
              </div>
            )}
          </div>

          {/* MIDDLE — event info */}
          <div
            className={`flex min-h-0 min-w-0 flex-col bg-white ${
              compact ? "gap-1 px-3 py-2.5" : "gap-1.5 px-4 py-3 md:px-5 md:py-3.5"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo href={null} variant="full" className="!h-7 !w-auto shrink-0 sm:!h-8" />
              <span className="truncate text-[9px] text-[var(--tf-text-secondary)] sm:text-[10px]">
                {TF_TAGLINE}
              </span>
            </div>

            <h1
              className={`line-clamp-2 font-bold leading-tight tracking-tight text-[var(--tf-navy)] ${
                compact ? "text-base" : "text-lg md:text-xl"
              }`}
            >
              {data.eventName}
            </h1>

            {data.dateLabel ? (
              <p
                className={`truncate font-medium text-[var(--tf-navy)] ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {data.dateLabel}
              </p>
            ) : null}

            {data.doors.headline ? (
              <div className="min-w-0">
                <p
                  className={`truncate font-bold tracking-wide ${
                    compact ? "text-sm" : "text-base md:text-lg"
                  }`}
                  style={{ color: doorsColor }}
                >
                  {data.doors.headline}
                  {data.doors.timeLabel ? " Uhr" : ""}
                </p>
                {data.doors.doorsNote ? (
                  <p className="truncate text-[10px] text-[var(--tf-text-secondary)]">
                    {data.doors.doorsNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            <dl
              className={`mt-0.5 space-y-0.5 ${compact ? "text-[10px]" : "text-xs"}`}
            >
              {data.startLabel ? (
                <MetaRow label="Beginn" value={data.startLabel} />
              ) : null}
              <MetaRow label="Location" value={data.locationTicket} />
              <MetaRow
                label="Kategorie"
                value={data.categoryName}
                valueClassName={data.isVip ? "text-[var(--tf-gold)]" : undefined}
              />
            </dl>

            {/* Seat highlight */}
            {seat.mode === "boxes" ? (
              <div className="mt-1 flex gap-1.5">
                {seat.parts.map((part) => (
                  <div
                    key={`${part.label}-${part.value}`}
                    className="min-w-0 flex-1 rounded-md border border-[var(--tf-line)] bg-[#f8fafc] px-1 py-1.5 text-center"
                  >
                    {part.label ? (
                      <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                        {part.label}
                      </div>
                    ) : null}
                    <div
                      className={`font-bold text-[var(--tf-navy)] ${
                        compact ? "text-xs" : "text-sm"
                      }`}
                    >
                      {part.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className={`mt-1 font-bold tracking-wide text-[var(--tf-navy)] ${
                  compact ? "text-sm" : "text-base"
                }`}
              >
                {seat.text}
              </p>
            )}

            <div
              className={`mt-auto flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-[var(--tf-text-secondary)] ${
                compact ? "text-[10px]" : "text-[11px]"
              }`}
            >
              {data.holderName ? (
                <span>
                  Inhaber{" "}
                  <span className="font-semibold text-[var(--tf-navy)]">
                    {data.holderName}
                  </span>
                </span>
              ) : null}
              {data.priceLabel ? (
                <span>
                  Preis{" "}
                  <span className="font-semibold text-[var(--tf-navy)]">
                    {data.priceLabel}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          {/* RIGHT — QR stub */}
          <div className="relative flex min-h-0 min-w-0 flex-col items-center justify-center border-l border-dashed border-[var(--tf-line)] bg-[#f8fafc] px-2 py-2 text-center">
            {/* Ticket notches */}
            <span
              className="pointer-events-none absolute -left-1.5 top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-[rgba(248,250,252,0.95)] ring-1 ring-[var(--tf-line)]"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -left-1.5 bottom-0 h-3 w-3 translate-y-1/2 rounded-full bg-[rgba(248,250,252,0.95)] ring-1 ring-[var(--tf-line)]"
              aria-hidden
            />

            <p
              className="text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ color: accent }}
            >
              {admitLabel}
            </p>

            {showQr && data.qrToken ? (
              <>
                <div className="mt-1.5 rounded-md bg-white p-1.5 shadow-sm">
                  <TicketQrImage
                    token={data.qrToken}
                    size={compact ? Math.min(qrSize, 120) : Math.min(qrSize, 150)}
                    bare
                  />
                </div>
                <p
                  className={`mt-1.5 max-w-full truncate font-bold tracking-wide text-[var(--tf-navy)] ${
                    compact ? "text-[10px]" : "text-xs"
                  }`}
                >
                  {data.ticketNumber}
                </p>
                <p className="mt-0.5 text-[9px] text-[var(--tf-text-secondary)]">
                  {TF_QR_HINT}
                </p>
              </>
            ) : (
              <div className="mt-2 max-w-[11rem] px-1">
                <p className="text-[11px] font-semibold text-[var(--tf-navy)]">
                  {transferredMessage ? "Ticket weitergeleitet" : "QR nicht verfügbar"}
                </p>
                {transferredMessage ? (
                  <p className="mt-1 text-[10px] leading-snug text-[var(--tf-text-secondary)]">
                    {transferredMessage}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] font-medium text-[var(--tf-navy)]">
                  {data.ticketNumber}
                </p>
              </div>
            )}
          </div>
        </article>
      </div>

      <p className="mx-auto mt-3 max-w-[900px] text-center text-xs text-[var(--tf-text-secondary)] md:text-left">
        {TF_PRINT_HINT}
        {data.organizerDisplayName
          ? ` · Veranstalter: ${data.organizerDisplayName}`
          : ""}
      </p>
    </div>
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
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-1.5">
      <dt className="text-[var(--tf-text-secondary)]">{label}</dt>
      <dd
        className={`truncate font-semibold text-[var(--tf-navy)] ${valueClassName ?? ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
