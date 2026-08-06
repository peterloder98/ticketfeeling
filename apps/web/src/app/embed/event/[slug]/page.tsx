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
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { EmbedBackLink } from "@/components/embed/embed-back-link";

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
      tour: { select: { slug: true, coverImageUrl: true, visibility: true } },
      organization: { select: { name: true, settings: true } },
      ticketCategories: {
        where: { status: "active", onlineBookable: true },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!event) {
    return (
      <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-10 text-center">
        <p className="font-semibold text-[var(--tf-navy)]">Event nicht gefunden</p>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Unter diesem Link gibt es online kein Event mit dem Slug{" "}
          <code className="text-xs">{slug}</code>. Bitte im Admin prüfen, ob das Event auf dieser
          Umgebung existiert und der iframe die richtige Domain nutzt.
        </p>
      </div>
    );
  }
  if (
    event.status === "draft" ||
    event.status === "cancelled" ||
    event.tour?.visibility === "draft"
  ) {
    return (
      <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-10 text-center">
        <p className="font-semibold text-[var(--tf-navy)]">Event nicht freigeschaltet</p>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Dieses Event ist online noch nicht öffentlich (Entwurf, Absage oder Tour noch als Entwurf).
        </p>
      </div>
    );
  }

  const coverImageUrl = resolveEventCoverUrl(event);

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
        {event.tour?.slug ? (
          <EmbedBackLink fallbackHref={`/embed/tour/${event.tour.slug}`} label="Zurück zur Tour" />
        ) : (
          <EmbedBackLink fallbackHref="/embed/shop" label="Zurück" />
        )}
        <div className="overflow-hidden rounded-xl border border-[var(--tf-line)]">
          <div className="relative aspect-square w-full bg-[var(--tf-navy)]">
            <ResponsiveImage
              src={coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              fallback="event"
            />
          </div>
          <div className="space-y-1.5 p-3">
            <h1 className="text-base font-bold leading-snug text-[var(--tf-navy)]">
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
              <p className="pt-0.5 text-base font-semibold text-[var(--tf-navy)]">
                {fromPrice.totalLabel}
              </p>
            ) : null}
          </div>
        </div>

        {event.shortDescription ? (
          <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
            {event.shortDescription}
          </p>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold text-[var(--tf-navy)]">Tickets</h2>
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
                  cartHref="/embed/warenkorb"
                  checkoutHref="/embed/checkout"
                />
              ) : (
                <AddToCartPanel
                  categories={categories}
                  feeSurchargeNote={feeSurchargeNote || undefined}
                  showRemainingAvailability={event.showRemainingAvailability}
                  cartHref="/embed/warenkorb"
                  checkoutHref="/embed/checkout"
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
            Zahlung über Ticketfeeling
          </p>
        </div>
      </article>
    </>
  );
}
