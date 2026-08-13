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
import { FunnelViewTracker } from "@/components/funnel-view-tracker";
import { PaymentBrandRow } from "@/components/payment-brand-marks";
import { categoryNeedsSeats } from "@/lib/seating/types";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { resolveEffectiveEventDetails } from "@/lib/commerce/effective-event-details";
import { formatDeDateTime } from "@/lib/datetime-de";
import { channelAvailableQuantity } from "@/lib/commerce/inventory-availability";
import {
  assignedUnlockedSeatCounts,
  isPlanBackedTicketCategory,
  resolveSellableCategoryCapacity,
} from "@/lib/seating/sync-category-capacity";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { ScheduleChangedBanner } from "@/components/schedule-changed-banner";
import { EventPageUrgencyCountdown } from "@/components/live-urgency-countdown";
import {
  clearWeihnachtstraum2026ScheduleNotices,
  ensureScheduleChangedAtColumn,
  isWeihnachtstraum2026Slug,
} from "@/lib/commerce/ensure-schedule-changed";
import { ensureWeihnachtstraum2026Venues } from "@/lib/commerce/ensure-weihnachtstraum-venues";
import { shouldShowScheduleChangedBanner } from "@/lib/commerce/schedule-change";

export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const event = await prisma.event.findFirst({ where: { slug }, select: { name: true } });
  return { title: event?.name ? `Tickets · ${event.name}` : "Tickets" };
}

export default async function EmbedEventShopPage({ params }: Props) {
  const { slug } = await params;
  if (isWeihnachtstraum2026Slug(slug)) {
    await Promise.all([
      clearWeihnachtstraum2026ScheduleNotices(),
      ensureWeihnachtstraum2026Venues(),
    ]);
  }
  // Never block public embed GET on DDL ensures (prod is migrate-deploy).
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
    void Promise.all([
      import("@/lib/commerce/ensure-event-pricing-schema").then(({ ensureEventPricingSchema }) =>
        ensureEventPricingSchema(prisma),
      ),
      ensureScheduleChangedAtColumn(),
    ]).catch((err) => console.error("[embed/event] schema ensure failed", err));
  }
  const event = await prisma.event.findFirst({
    where: { slug },
    include: {
      location: true,
      tour: {
        select: {
          slug: true,
          name: true,
          shortDescription: true,
          description: true,
          coverImageUrl: true,
          visibility: true,
        },
      },
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

  const effectiveDetails = resolveEffectiveEventDetails(event);

  const { ensurePresaleAutoRelease } = await import("@/lib/commerce/ensure-presale-release");
  const { effectiveEventStatus, isEventSaleOpen } = await import("@/lib/commerce/event-sale");
  void ensurePresaleAutoRelease({
    id: event.id,
    organizationId: event.organizationId,
    status: event.status,
    presaleStartsAt: event.presaleStartsAt,
    coverImageUrl: event.coverImageUrl,
    eventStartsAt: event.eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  }).catch((err) => console.error("[embed/event] presale release failed", err));
  event.status = effectiveEventStatus({
    status: event.status,
    presaleStartsAt: event.presaleStartsAt,
    coverImageUrl: event.coverImageUrl,
    eventStartsAt: event.eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  });

  if (
    event.status === "draft" ||
    event.status === "cancelled" ||
    event.status === "paused" ||
    event.tour?.visibility === "draft"
  ) {
    return (
      <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-10 text-center">
        <p className="font-semibold text-[var(--tf-navy)]">
          {event.status === "cancelled"
            ? "Event abgesagt"
            : event.status === "paused"
              ? "Verkauf pausiert"
              : "Event nicht freigeschaltet"}
        </p>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          {event.status === "cancelled"
            ? "Dieses Event wurde abgesagt — online sind keine Tickets mehr erhältlich."
            : event.status === "paused"
              ? "Der Ticketverkauf für dieses Event ist vorübergehend pausiert."
              : "Dieses Event ist online noch nicht öffentlich (Entwurf oder Tour noch als Entwurf)."}
        </p>
      </div>
    );
  }

  const coverImageUrl = resolveEventCoverUrl(event);

  const feeConfig = resolveActivePlatformFeeConfig(event.organization.settings?.platformFeeConfig);
  const saleOpen = isEventSaleOpen(event);

  const hasReservedSeating =
    Boolean(event.venuePlanId) &&
    (event.seatingBookingMode === "best_available" ||
      event.seatingBookingMode === "seat_map_and_best");

  const planBackedIds = hasReservedSeating
    ? event.ticketCategories
        .filter((c) =>
          isPlanBackedTicketCategory({
            freeSeating: c.freeSeating,
            categoryKind: c.categoryKind,
            seatingBookingMode: event.seatingBookingMode,
          }),
        )
        .map((c) => c.id)
    : [];

  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const {
    resolveTicketUnitPrice,
    pickActiveOrderCampaignBadge,
    formatOrderCampaignBadge,
    formatOrderCampaignDisclaimer,
  } = await import("@/lib/commerce/event-pricing");
  const [seatCounts, campaigns] = await Promise.all([
    hasReservedSeating
      ? assignedUnlockedSeatCounts(prisma, event.id, planBackedIds)
      : Promise.resolve({} as Record<string, number>),
    loadEventPriceCampaigns(event.id),
  ]);
  const accessibilityOffer = accessibilityOfferFromEvent(event);
  const priceNow = new Date();
  const orderCampaignBadge = pickActiveOrderCampaignBadge({
    categoryIds: event.ticketCategories.map((c) => c.id),
    channel: "online",
    now: priceNow,
    campaigns,
  });
  const orderPromo = orderCampaignBadge
    ? {
        badgeLabel: formatOrderCampaignBadge(orderCampaignBadge),
        disclaimer: formatOrderCampaignDisclaimer(orderCampaignBadge),
        campaignName: orderCampaignBadge.name,
        categoryIds: orderCampaignBadge.categoryIds,
      }
    : null;

  const categories = event.ticketCategories.map((category) => {
    const sellableCapacity = resolveSellableCategoryCapacity({
      categoryCapacity: category.capacity,
      categoryKind: category.categoryKind,
      freeSeating: category.freeSeating,
      seatingBookingMode: event.seatingBookingMode,
      assignedUnlockedSeatCount: hasReservedSeating ? (seatCounts[category.id] ?? 0) : null,
    });
    const available = category.pools.length
      ? channelAvailableQuantity(category.pools, "online", sellableCapacity)
      : Math.max(0, sellableCapacity - category.safetyReserve);
    const priced = resolveTicketUnitPrice({
      listCents: category.priceGrossCents,
      categoryId: category.id,
      channel: "online",
      now: priceNow,
      campaigns,
      accessibility: accessibilityOffer,
      accessibilitySelected: false,
    });
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      extrasShortText: category.extrasShortText,
      priceGrossCents: priced.unitCents,
      listPriceGrossCents: priced.listCents,
      campaignName: priced.campaignName,
      campaignBadgeLabel: priced.campaignBadgeLabel,
      campaignBadgeDisclaimer: priced.campaignBadgeDisclaimer,
      campaignValidUntil: priced.campaignValidUntil,
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
    ? formatDeDateTime(event.eventStartsAt, {
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

  const campaignValidUntils = categories.map((c) => c.campaignValidUntil);

  return (
    <>
      <OrgTracking
        embedMode
        eventSlug={event.slug}
        eventTracking={event}
        orgSettings={event.organization.settings}
      />
      <FunnelViewTracker
        kind="event_page_view"
        eventSlug={event.slug}
        eventId={event.id}
        eventTitle={effectiveDetails.name}
        valueCents={categories[0]?.priceGrossCents ?? null}
        embedMode
      />

      <article className="space-y-3">
        {event.tour?.slug ? (
          <EmbedBackLink fallbackHref={`/embed/tour/${event.tour.slug}`} label="Zurück zur Tour" />
        ) : (
          <EmbedBackLink fallbackHref="/embed/shop" label="Zurück" />
        )}
        {shouldShowScheduleChangedBanner(event.scheduleChangedAt) ? (
          <ScheduleChangedBanner compact />
        ) : null}
        <div className="mx-auto w-full max-w-[444px]">
          <div className="group overflow-hidden rounded-xl border border-[var(--tf-line)]">
            <div className="relative aspect-square w-full max-h-[444px] overflow-hidden bg-[var(--tf-navy)]">
              <ResponsiveImage
                src={coverImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                fallback="event"
              />
            </div>
            <div className="space-y-1.5 p-3">
              <h1 className="text-base font-bold leading-snug text-[var(--tf-navy)]">
                {effectiveDetails.name}
              </h1>
              {when ? (
                <p className="flex items-start gap-1.5 text-xs text-[var(--tf-text-secondary)]">
                  <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                  <span>{when}</span>
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
        </div>

        {effectiveDetails.shortDescription ? (
          <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
            {effectiveDetails.shortDescription}
          </p>
        ) : null}

        <section>
          <h2 id="tickets" className="scroll-mt-3 text-sm font-semibold text-[var(--tf-navy)]">
            Tickets
          </h2>
          <EventPageUrgencyCountdown
            className="mt-2"
            size="sm"
            campaignValidUntils={campaignValidUntils}
          />
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
                  orderPromo={orderPromo}
                  accessibilityOffer={
                    accessibilityOffer.enabled
                      ? {
                          label: accessibilityOffer.label,
                          type: accessibilityOffer.type,
                          value: accessibilityOffer.value,
                        }
                      : null
                  }
                />
              ) : (
                <AddToCartPanel
                  categories={categories}
                  feeSurchargeNote={feeSurchargeNote || undefined}
                  showRemainingAvailability={event.showRemainingAvailability}
                  cartHref="/embed/warenkorb"
                  checkoutHref="/embed/checkout"
                  compact
                  eventSlug={event.slug}
                  eventId={event.id}
                  eventTitle={effectiveDetails.name}
                  orderPromo={orderPromo}
                  accessibilityOffer={
                    accessibilityOffer.enabled
                      ? {
                          label: accessibilityOffer.label,
                          type: accessibilityOffer.type,
                          value: accessibilityOffer.value,
                        }
                      : null
                  }
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
