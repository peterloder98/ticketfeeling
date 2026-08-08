import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AddToCartPanel } from "@/components/add-to-cart";
import { SeatBookingPanel } from "@/components/seat-booking-panel";
import { MobilePurchaseBar } from "@/components/mobile-purchase-bar";
import { FunnelViewTracker } from "@/components/funnel-view-tracker";
import { ResponsiveImage } from "@/components/responsive-image";
import { formatEuroFromCents } from "@/lib/money";
import {
  Calendar,
  MapPin,
  Clock,
  DoorOpen,
  Accessibility,
  Car,
  Utensils,
} from "lucide-react";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import {
  formatCustomerPriceLabel,
  formatFeeSurchargeNote,
} from "@/lib/commerce/public-price";
import { categoryNeedsSeats } from "@/lib/seating/types";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { channelAvailableQuantity } from "@/lib/commerce/inventory-availability";
import {
  assignedUnlockedSeatCounts,
  isPlanBackedTicketCategory,
  resolveSellableCategoryCapacity,
} from "@/lib/seating/sync-category-capacity";
import { formatDeDateTime, formatDeTime } from "@/lib/datetime-de";
import { ScheduleChangedBanner } from "@/components/schedule-changed-banner";
import { EventPageUrgencyCountdown } from "@/components/live-urgency-countdown";
import { ensureScheduleChangedAtColumn } from "@/lib/commerce/ensure-schedule-changed";
import { ensureTicketSponsorLogoColumns } from "@/lib/commerce/ensure-ticket-sponsor-logos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  await ensureTicketSponsorLogoColumns();
  const event = await prisma.event.findFirst({ where: { slug } });
  return { title: event?.name ?? "Event" };
}

function formatEventDate(date: Date) {
  const day = date.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${day} · ${formatDeTime(date)}`;
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const { ensureEventPricingSchema } = await import(
    "@/lib/commerce/ensure-event-pricing-schema"
  );
  await ensureEventPricingSchema(prisma);
  await ensureScheduleChangedAtColumn();
  await ensureTicketSponsorLogoColumns();
  const event = await prisma.event.findFirst({
    where: { slug },
    include: {
      location: true,
      room: true,
      tour: { select: { coverImageUrl: true, visibility: true } },
      organization: { select: { name: true, settings: true } },
      artists: { include: { artist: true }, orderBy: { sortOrder: "asc" } },
      ticketCategories: {
        where: { status: "active", onlineBookable: true },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!event) notFound();

  const { ensurePresaleAutoRelease } = await import("@/lib/commerce/ensure-presale-release");
  const released = await ensurePresaleAutoRelease({
    id: event.id,
    organizationId: event.organizationId,
    status: event.status,
    presaleStartsAt: event.presaleStartsAt,
  });
  if (released.flipped) event.status = released.status;

  // Draft / paused events are not a public shop surface; cancelled shows a soft page.
  if (event.status === "draft" || event.status === "paused" || event.tour?.visibility === "draft") {
    notFound();
  }

  if (event.status === "cancelled") {
    const when = event.eventStartsAt
      ? formatDeDateTime(event.eventStartsAt, {
          dateStyle: "full",
          timeStyle: "short",
        })
      : null;
    return (
      <div className="tf-container py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--tf-line)] bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--tf-teal)]">
            Ticketfeeling
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
            {event.name}
          </h1>
          <p className="mt-3 text-base text-[var(--tf-text-secondary)]">
            Dieses Event wurde abgesagt. Tickets sind nicht mehr erhältlich.
          </p>
          {when ? (
            <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">{when}</p>
          ) : null}
          <Link href="/events" className="tf-btn tf-btn-primary mt-6 inline-flex !min-h-10 text-sm">
            Andere Events entdecken
          </Link>
        </div>
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
  const seatCounts = hasReservedSeating
    ? await assignedUnlockedSeatCounts(prisma, event.id, planBackedIds)
    : {};

  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  const campaigns = await loadEventPriceCampaigns(event.id);
  const accessibilityOffer = accessibilityOfferFromEvent(event);
  const priceNow = new Date();

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
      priceGrossCents: priced.unitCents,
      listPriceGrossCents: priced.listCents,
      campaignName: priced.campaignName,
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
  const fromListTicket = categories.length
    ? Math.min(...categories.map((c) => c.listPriceGrossCents ?? c.priceGrossCents))
    : null;
  const fromCampaignName =
    fromTicket != null
      ? categories.find((c) => c.priceGrossCents === fromTicket && c.campaignName)?.campaignName ??
        null
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
  const fromPriceLabel = fromPrice
    ? fromCampaignName &&
      fromTicket != null &&
      fromListTicket != null &&
      fromListTicket > fromTicket
      ? `Tickets ${fromPrice.totalLabel} · ${fromCampaignName}`
      : `Tickets ${fromPrice.totalLabel}`
    : "Tickets";

  const campaignValidUntils = categories.map((c) => c.campaignValidUntil);
  const eventStartsIso = event.eventStartsAt?.toISOString() ?? null;

  const placeName = event.location?.name ?? null;
  const placeAddress = event.location
    ? [
        [event.location.street, event.location.houseNumber].filter(Boolean).join(" "),
        [event.location.postalCode, event.location.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const place = [placeName, placeAddress || event.location?.city].filter(Boolean).join(" · ") || null;

  const infoItems = [
    event.eventStartsAt
      ? {
          icon: Clock,
          label: "Beginn",
          value: formatDeTime(event.eventStartsAt),
        }
      : null,
    event.doorsOpenAt
      ? {
          icon: DoorOpen,
          label: "Einlass",
          value: formatDeTime(event.doorsOpenAt),
        }
      : null,
    place ? { icon: MapPin, label: "Location", value: place } : null,
    event.location?.parking
      ? { icon: Car, label: "Parken", value: "Parkmöglichkeiten vorhanden" }
      : null,
    event.location?.gastronomy
      ? { icon: Utensils, label: "Gastronomie", value: "Vor Ort verfügbar" }
      : null,
    event.location?.wheelchairAccess
      ? { icon: Accessibility, label: "Barrierefreiheit", value: "Rollstuhlzugang" }
      : null,
  ].filter(Boolean) as { icon: typeof Calendar; label: string; value: string }[];

  return (
    <div className="pb-28 md:pb-0">
      <FunnelViewTracker
        kind="event_page_view"
        eventSlug={event.slug}
        eventId={event.id}
        eventTitle={event.name}
        valueCents={categories[0]?.priceGrossCents ?? null}
      />
      <section className="border-b border-[var(--tf-line)] bg-[var(--tf-navy)] text-white">
        <div className="tf-container grid items-center gap-8 py-8 md:grid-cols-[1.4fr_1fr] md:gap-10 md:py-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--tf-teal)]">
              Live bei Ticketfeeling
            </p>
            <h1 className="mt-3 max-w-3xl text-[2.125rem] font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-[3.75rem]">
              {event.name}
            </h1>
            <EventPageUrgencyCountdown
              className="mt-5"
              variant="heroText"
              eventStartsAt={eventStartsIso}
              campaignValidUntils={campaignValidUntils}
            />
            {event.shortDescription ? (
              <p className="mt-4 max-w-[40rem] text-base leading-relaxed text-white/85 md:text-lg">
                {event.shortDescription}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 text-base text-white/85">
              {event.eventStartsAt ? (
                <p className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-teal)]" strokeWidth={2} />
                  <span>{formatEventDate(event.eventStartsAt)}</span>
                </p>
              ) : null}
              {placeName || placeAddress ? (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tf-teal)]" strokeWidth={2} />
                  <span className="min-w-0">
                    {placeName ? <span className="font-medium text-white">{placeName}</span> : null}
                    {placeName && placeAddress ? <span className="text-white/60"> · </span> : null}
                    {placeAddress ? <span className="text-white/75">{placeAddress}</span> : null}
                  </span>
                </p>
              ) : null}
            </div>
            {event.scheduleChangedAt ? (
              <div className="mt-4 max-w-xl">
                <ScheduleChangedBanner />
              </div>
            ) : null}
            <div className="mt-6">
              {saleOpen ? (
                <a href="#tickets" className="tf-btn tf-btn-primary !min-h-12 !px-6 text-base">
                  Tickets sichern
                </a>
              ) : (
                <span className="tf-btn tf-btn-secondary cursor-default !border-white/30 !bg-white/10 !text-white">
                  Vorverkauf folgt
                </span>
              )}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[444px]">
            <div className="group overflow-hidden rounded-[28px] border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
              <div className="aspect-square max-h-[444px] overflow-hidden">
                <ResponsiveImage
                  src={coverImageUrl}
                  alt={`Cover: ${event.name}`}
                  className="h-full w-full transition duration-300 group-hover:scale-[1.02]"
                  fallback="event"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tf-container grid gap-8 py-8 lg:grid-cols-3 lg:py-10">
        <div className="order-2 space-y-10 lg:order-1 lg:col-span-2">
          <div>
            <h2 className="tf-display text-2xl md:text-3xl">Darauf kannst du dich freuen</h2>
            <p className="mt-3 max-w-[70ch] whitespace-pre-wrap text-base leading-relaxed text-[var(--tf-text-secondary)]">
              {event.description || event.shortDescription || "Details folgen in Kürze."}
            </p>
          </div>

          {infoItems.length > 0 ? (
            <div>
              <h2 className="tf-display text-2xl md:text-3xl">Wichtige Infos</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {infoItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[16px] border border-[var(--tf-line)] bg-white p-4"
                  >
                    <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--tf-navy)]">
                      <item.icon className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-base text-[var(--tf-text-secondary)]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {accessibilityOffer.enabled ? (
            <div className="rounded-[16px] border border-[var(--tf-line)] bg-white p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--tf-navy)]">
                <Accessibility className="h-5 w-5 text-[var(--tf-teal)]" strokeWidth={2} />
                {accessibilityOffer.label}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-[var(--tf-text-secondary)]">
                {accessibilityOffer.description?.trim() ||
                  "Du kannst beim Ticketkauf die Ermäßigung selbst auswählen."}
              </p>
            </div>
          ) : null}

          <div>
            <h2 className="tf-display text-2xl md:text-3xl">Line-up</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {event.artists.map((link) => {
                const role = link.isHeadliner
                  ? "Headliner"
                  : link.role === "moderation"
                    ? "Moderation"
                    : "Künstler";
                return (
                  <Link
                    key={link.id}
                    href={`/kuenstler/${link.artist.slug}?event=${encodeURIComponent(event.slug)}`}
                    className="flex items-center gap-4 rounded-[20px] border border-[var(--tf-line)] bg-white p-4 transition hover:border-[var(--tf-teal)]"
                  >
                    <ResponsiveImage
                      src={link.artist.profileImageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-full"
                      fallback="person"
                      initials={link.artist.name}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-[var(--tf-navy)]">
                        {link.artist.name}
                      </p>
                      <p className="text-sm text-[var(--tf-text-secondary)]">{role}</p>
                      {link.artist.shortBio ? (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--tf-text-secondary)]">
                          {link.artist.shortBio}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
              {event.artists.length === 0 ? (
                <p className="text-base text-[var(--tf-text-secondary)]">Line-up folgt.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] p-5">
            <p className="text-base font-semibold text-[var(--tf-navy)]">
              Veranstaltet von {event.organization.name}
            </p>
            <p className="mt-1 text-base text-[var(--tf-text-secondary)]">
              Die Tickets werden direkt über Ticketfeeling verkauft.
            </p>
            <Link href="/hilfe#kontakt" className="tf-link mt-3 inline-flex text-base">
              Noch Fragen zu diesem Event?
            </Link>
          </div>
        </div>

        {!hasReservedSeating ? (
          <aside
            id="tickets"
            className="order-1 h-fit scroll-mt-24 lg:sticky lg:top-[88px] lg:order-2"
          >
            <div className="rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_12px_40px_rgba(15,39,71,0.08)] md:p-6">
              <h2 className="tf-display text-2xl">Tickets</h2>
              <p className="mt-1 text-base text-[var(--tf-text-secondary)]">
                Sichere dir jetzt deinen Platz.
              </p>
              <EventPageUrgencyCountdown
                className="mt-3"
                eventStartsAt={eventStartsIso}
                campaignValidUntils={campaignValidUntils}
              />
              {saleOpen ? (
                <div className="mt-4">
                  <AddToCartPanel
                    categories={categories}
                    feeSurchargeNote={feeSurchargeNote || undefined}
                    showRemainingAvailability={event.showRemainingAvailability}
                    eventSlug={event.slug}
                    eventId={event.id}
                    eventTitle={event.name}
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
                </div>
              ) : (
                <p className="mt-3 text-base text-[var(--tf-text-secondary)]">
                  Der Vorverkauf ist noch nicht offen.
                </p>
              )}
            </div>
          </aside>
        ) : (
          <aside className="order-1 h-fit lg:sticky lg:top-[88px] lg:order-2">
            <div className="rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_12px_40px_rgba(15,39,71,0.08)] md:p-6">
              <h2 id="tickets" className="tf-display scroll-mt-24 text-2xl lg:scroll-mt-[96px]">
                Tickets
              </h2>
              <EventPageUrgencyCountdown
                className="mt-3"
                eventStartsAt={eventStartsIso}
                campaignValidUntils={campaignValidUntils}
              />
              {saleOpen ? (
                <div className="mt-4">
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
                    mapHostId="saalplan-map"
                    cartScrollId="tickets"
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
                </div>
              ) : (
                <p className="mt-3 text-base text-[var(--tf-text-secondary)]">
                  Der Vorverkauf ist noch nicht offen.
                </p>
              )}
            </div>
          </aside>
        )}
      </section>

      {hasReservedSeating ? (
        <div id="saalplan-map" className="tf-container scroll-mt-24 pb-8" />
      ) : null}

      {saleOpen ? (
        <MobilePurchaseBar
          fromPriceLabel={fromPriceLabel}
          priceNote={feeSurchargeNote || null}
          targetId="tickets"
        />
      ) : null}
    </div>
  );
}
