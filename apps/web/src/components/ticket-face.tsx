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
  TICKET_QR_MIN_PX,
  TICKET_SPONSOR_LOGO_MAX_H_PX,
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

function SponsorLogo({
  src,
  compact,
}: {
  src: string;
  compact?: boolean;
}) {
  const h = compact
    ? Math.min(20, TICKET_SPONSOR_LOGO_MAX_H_PX)
    : TICKET_SPONSOR_LOGO_MAX_H_PX;
  return (
    <div
      className="relative mx-auto w-full max-w-[88%] shrink-0"
      style={{ height: h }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

/**
 * Live ticket face — locked landscape ~2:1 concert strip (cover | info | QR).
 * Never reflows to portrait; mobile may shrink/scroll the whole strip.
 * Print@Home PDF/HTML use the same proportions.
 */
export function TicketFace({
  data,
  showQr,
  qrSize = 176,
  transferredMessage,
  compact = false,
}: Props) {
  const accent = data.isVip ? "var(--tf-gold)" : "var(--tf-teal)";
  const cover = data.coverUrl;
  const admitLabel = data.isVip ? "VIP-TICKET" : "EINLASSTICKET";
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const doorsAccent =
    data.isVip || data.doors.isCategoryOverride ? accent : "var(--tf-navy)";
  const hasSponsor =
    Boolean(data.sponsorLogoAboveUrl) || Boolean(data.sponsorLogoBelowUrl);
  const qrPx = compact
    ? Math.min(qrSize, hasSponsor ? TICKET_QR_MIN_PX : 124)
    : Math.min(qrSize, hasSponsor ? Math.max(TICKET_QR_MIN_PX, 128) : 152);

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

          {/* LEFT — square cover contain + blur backdrop (no frame box) */}
          <div className="relative min-h-0 min-w-0 overflow-hidden bg-[var(--tf-navy)]">
            {cover ? (
              <>
                <div
                  className="absolute inset-[-14%] scale-110 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${cover})`,
                    filter: "blur(26px) saturate(1.05)",
                  }}
                  aria-hidden
                />
                <div
                  className="absolute inset-0 bg-[rgba(15,39,71,0.42)]"
                  aria-hidden
                />
                <div className="absolute inset-[4%]">
                  <Image
                    src={cover}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 30vw, 260px"
                    className="object-contain"
                    unoptimized
                    priority
                  />
                </div>
              </>
            ) : (
              <TicketCoverFallback compact={compact} />
            )}
          </div>

          {/* MIDDLE — denser info flow */}
          <div
            className={`flex min-h-0 min-w-0 flex-col justify-center bg-white ${
              compact ? "gap-0.5 px-3 py-1.5" : "gap-0.5 px-4 py-2 md:px-5 md:py-2.5"
            }`}
          >
            <div className="flex min-w-0 items-center">
              <BrandLogo
                href={null}
                variant="full"
                className={
                  compact ? "!h-9 !w-auto shrink-0" : "!h-10 !w-auto shrink-0 sm:!h-11"
                }
              />
            </div>

            <h1
              className={`line-clamp-2 font-bold leading-[1.1] tracking-tight text-[var(--tf-navy)] ${
                compact ? "text-[15px]" : "text-lg md:text-xl"
              }`}
            >
              {data.eventName}
            </h1>

            {data.dateLabel ? (
              <p
                className={`truncate font-medium text-[var(--tf-navy)] ${
                  compact ? "text-[11px]" : "text-xs sm:text-sm"
                }`}
              >
                {data.dateLabel}
              </p>
            ) : null}

            {/* Location: name + city/address */}
            <div className="min-w-0 leading-snug">
              <p
                className={`truncate font-semibold text-[var(--tf-navy)] ${
                  compact ? "text-[11px]" : "text-xs sm:text-sm"
                }`}
              >
                {data.locationName}
              </p>
              {data.locationDetail ? (
                <p className="truncate text-[10px] text-[var(--tf-text-secondary)]">
                  {data.locationDetail}
                </p>
              ) : null}
            </div>

            {/* EINLASS | BEGINN compact */}
            {(data.doors.headline || data.startLabel) && (
              <div
                className={`grid grid-cols-2 gap-2 border-y border-[var(--tf-line)] ${
                  compact ? "py-1" : "py-1"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                    {data.doors.headlineLabel || "Einlass"}
                  </p>
                  <p
                    className={`truncate font-bold ${compact ? "text-xs" : "text-sm"}`}
                    style={{
                      color: data.doors.timeLabel
                        ? doorsAccent
                        : "var(--tf-text-secondary)",
                    }}
                  >
                    {data.doors.timeLabel
                      ? `${data.doors.timeLabel} Uhr`
                      : "—"}
                  </p>
                  {data.doors.doorsNote ? (
                    <p className="truncate text-[9px] text-[var(--tf-text-secondary)]">
                      {data.doors.doorsNote}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 border-l border-[var(--tf-line)] pl-2">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                    Beginn
                  </p>
                  <p
                    className={`truncate font-bold text-[var(--tf-navy)] ${
                      compact ? "text-xs" : "text-sm"
                    }`}
                  >
                    {data.startLabel ?? "—"}
                  </p>
                </div>
              </div>
            )}

            <p
              className={`truncate ${compact ? "text-[10px]" : "text-xs"}`}
            >
              <span className="text-[var(--tf-text-secondary)]">Kategorie </span>
              <span
                className={`font-semibold ${
                  data.isVip ? "text-[var(--tf-gold)]" : "text-[var(--tf-navy)]"
                }`}
              >
                {data.categoryName}
              </span>
            </p>

            {/* Seat highlight */}
            {seat.mode === "boxes" ? (
              <div className="flex gap-1.5">
                {seat.parts.map((part) => (
                  <div
                    key={`${part.label}-${part.value}`}
                    className={`min-w-0 flex-1 rounded-md border border-[var(--tf-line)] bg-[#f8fafc] text-center ${
                      compact ? "px-1 py-0.5" : "px-1 py-1"
                    }`}
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
                className={`font-bold tracking-wide text-[var(--tf-navy)] ${
                  compact ? "text-sm" : "text-base"
                }`}
              >
                {seat.text}
              </p>
            )}

            {/* Inhaber | Preis — part of info flow, not pinned with a dead gap */}
            {(data.holderName || data.priceLabel) && (
              <div
                className={`flex flex-wrap gap-x-4 gap-y-0 text-[var(--tf-text-secondary)] ${
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
            )}
          </div>

          {/* RIGHT — QR stub: sponsor → admit → QR → # → hint → sponsor */}
          <div className="relative flex min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 border-l border-dashed border-[var(--tf-line)] bg-[#f8fafc] px-2 py-1 text-center">
            <span
              className="pointer-events-none absolute -left-1.5 top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-[rgba(248,250,252,0.95)] ring-1 ring-[var(--tf-line)]"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -left-1.5 bottom-0 h-3 w-3 translate-y-1/2 rounded-full bg-[rgba(248,250,252,0.95)] ring-1 ring-[var(--tf-line)]"
              aria-hidden
            />

            {data.sponsorLogoAboveUrl ? (
              <SponsorLogo src={data.sponsorLogoAboveUrl} compact={compact} />
            ) : null}

            <p
              className="text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ color: accent }}
            >
              {admitLabel}
            </p>

            {showQr && data.qrToken ? (
              <>
                <div className="shrink-0 rounded-md bg-white p-1 shadow-sm">
                  <TicketQrImage
                    token={data.qrToken}
                    size={qrPx}
                    bare
                  />
                </div>
                <p
                  className={`max-w-full truncate font-bold tracking-wide text-[var(--tf-navy)] ${
                    compact ? "text-[9px]" : "text-[10px]"
                  }`}
                >
                  {data.ticketNumber}
                </p>
                <p className="text-[9px] text-[var(--tf-text-secondary)]">
                  {TF_QR_HINT}
                </p>
                {data.sponsorLogoBelowUrl ? (
                  <SponsorLogo src={data.sponsorLogoBelowUrl} compact={compact} />
                ) : null}
              </>
            ) : (
              <div className="max-w-[11rem] px-1">
                <p className="text-[11px] font-semibold text-[var(--tf-navy)]">
                  {transferredMessage ? "Ticket weitergeleitet" : "QR nicht verfügbar"}
                </p>
                {transferredMessage ? (
                  <p className="mt-1 text-[10px] leading-snug text-[var(--tf-text-secondary)]">
                    {transferredMessage}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[10px] font-medium text-[var(--tf-navy)]">
                  {data.ticketNumber}
                </p>
                {data.sponsorLogoBelowUrl ? (
                  <div className="mt-1.5">
                    <SponsorLogo src={data.sponsorLogoBelowUrl} compact={compact} />
                  </div>
                ) : null}
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

function TicketCoverFallback({ compact }: { compact: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, #0F2747 0%, #163A5F 48%, #0B1C33 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-3 -top-4 opacity-[0.1]"
        aria-hidden
      >
        {/* Soft white plate so mark stays brand-true (no recolor filters) */}
        <div className="rounded-2xl bg-white/90 p-2">
          <BrandLogo href={null} variant="mark" className="!h-24 !w-auto sm:!h-28" />
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
        <div className="rounded-lg bg-white/95 px-2.5 py-1.5 shadow-sm">
          <BrandLogo
            href={null}
            variant="full"
            className={compact ? "!h-7 !w-auto" : "!h-9 !w-auto"}
          />
        </div>
        <p
          className={`font-medium tracking-wide text-white/80 ${
            compact ? "text-[9px]" : "text-[10px]"
          }`}
        >
          {TF_TAGLINE}
        </p>
        <span
          className="h-0.5 w-8 rounded-full bg-[var(--tf-teal)]"
          aria-hidden
        />
      </div>
    </div>
  );
}
