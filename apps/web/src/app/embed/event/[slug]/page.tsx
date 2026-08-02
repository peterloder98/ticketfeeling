import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AddToCartPanel } from "@/components/add-to-cart";
import { SeatBookingPanel } from "@/components/seat-booking-panel";
import { ResponsiveImage } from "@/components/responsive-image";
import { formatEuroFromCents } from "@/lib/money";
import { Calendar, MapPin } from "lucide-react";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import {
  formatCustomerPriceLabel,
  formatFeeSurchargeNote,
} from "@/lib/commerce/public-price";
import { OrgTracking } from "@/components/org-tracking";
import { PaymentBrandRow } from "@/components/payment-brand-marks";
import { categoryNeedsSeats } from "@/lib/seating/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const event = await prisma.event.findFirst({ where: { slug }, select: { name: true } });
  return { title: event?.name ? `Tickets · ${event.name}` : "Tickets" };
}

export default async function EmbedEventShopPage({ params }: Props) {
  const { slug } = await params;
  const event = await prisma.event.findFirst({
    where: { slug },
    include: {
      location: true,
      organization: { select: { name: true, settings: true } },
      ticketCategories: {
        where: { status: "active", onlineBookable: true },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!event) notFound();

  const feeConfig = resolveActivePlatformFeeConfig(event.organization.settings?.platformFeeConfig);
  const { isEventSaleOpen } = await import("@/lib/commerce/event-sale");
  const saleOpen = isEventSaleOpen(event);

  const hasReservedSeating =
    Boolean(event.venuePlanId) &&
    (event.seatingBookingMode === "best_available" ||
      event.seatingBookingMode === "seat_map_and_best");

  const categories = event.ticketCategories.map((category) => {
    const pool = category.pools.find((p) => p.channel === "online");
    const available = pool
      ? Math.max(0, pool.capacity - pool.soldQuantity - pool.heldQuantity)
      : Math.max(0, category.capacity - category.safetyReserve);
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      priceGrossCents: category.priceGrossCents,
      available,
      maxPerOrder: category.maxPerOrder,
      needsSeats: categoryNeedsSeats({
        seatingBookingMode: event.seatingBookingMode,
        categoryKind: category.categoryKind,
        freeSeating: category.freeSeating,
      }),
      categoryKind: category.categoryKind,
      companionFree: category.companionFree,
    };
  });

  const feeSurchargeNote = formatFeeSurchargeNote(feeConfig);
  const fromTicket = categories.length
    ? Math.min(...categories.map((c) => c.priceGrossCents))
    : null;
  const fromPrice =
    fromTicket != null
      ? formatCustomerPriceLabel({
          ticketGrossCents: fromTicket,
          feeConfig,
          formatEuro: formatEuroFromCents,
          prefix: "ab",
        })
      : null;

  const when = event.eventStartsAt
    ? event.eventStartsAt.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const place = event.location
    ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
    : null;

  return (
    <>
      <OrgTracking embedMode eventSlug={event.slug} eventTracking={event} />

      <article className="space-y-3">
        {/* Cover is 444×444 — keep square; text vertically centered beside it */}
        <div className="overflow-hidden rounded-xl border border-[var(--tf-line)]">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="relative mx-auto aspect-square w-[11.5rem] shrink-0 bg-[var(--tf-navy)] sm:mx-0 sm:w-[13rem] md:w-[14.5rem]">
              <ResponsiveImage
                src={event.coverImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                fallback="event"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center space-y-1.5 px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
                Tickets
              </p>
              <h1 className="text-base font-bold leading-tight text-[var(--tf-navy)] sm:text-lg">
                {event.name}
              </h1>
              {when ? (
                <p className="flex items-start gap-1.5 text-xs text-[var(--tf-text-secondary)]">
                  <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                  <span>{when} Uhr</span>
                </p>
              ) : null}
              {place ? (
                <p className="flex items-start gap-1.5 text-xs text-[var(--tf-text-secondary)]">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                  <span>{place}</span>
                </p>
              ) : null}
              {fromPrice ? (
                <p className="pt-0.5 text-sm font-semibold text-[var(--tf-navy)]">
                  {fromPrice.totalLabel}
                  {fromPrice.surchargeLabel ? (
                    <span className="ml-1 text-[11px] font-normal text-[var(--tf-text-secondary)]">
                      {fromPrice.surchargeLabel}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {event.shortDescription ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
            {event.shortDescription}
          </p>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold text-[var(--tf-navy)]">Kategorien</h2>
          <div className="mt-2">
            {saleOpen ? (
              hasReservedSeating ? (
                <SeatBookingPanel
                  eventId={event.id}
                  bookingMode={
                    event.seatingBookingMode === "best_available"
                      ? "best_available"
                      : "seat_map_and_best"
                  }
                  categories={categories}
                  feeSurchargeNote={feeSurchargeNote || undefined}
                  showRemainingAvailability={event.showRemainingAvailability}
                  breakOutToTop
                />
              ) : (
                <AddToCartPanel
                  categories={categories}
                  feeSurchargeNote={feeSurchargeNote || undefined}
                  showRemainingAvailability={event.showRemainingAvailability}
                  breakOutToTop
                  compact
                />
              )
            ) : (
              <p className="rounded-lg border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
                Der Vorverkauf ist noch nicht offen.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-1.5 border-t border-[var(--tf-line)] pt-3">
          <p className="text-center text-[11px] font-medium text-[var(--tf-text-secondary)]">
            Sicher bezahlen mit
          </p>
          <PaymentBrandRow className="justify-center" />
          <p className="pt-1 text-center text-[11px] text-[var(--tf-text-secondary)]">
            Zahlung über{" "}
            <Link href="/" target="_top" className="font-medium text-[var(--tf-teal)] underline">
              Ticketfeeling
            </Link>
          </p>
        </div>
      </article>
    </>
  );
}
