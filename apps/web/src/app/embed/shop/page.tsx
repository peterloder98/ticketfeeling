import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { OrgTracking } from "@/components/org-tracking";
import { PaymentBrandRow } from "@/components/payment-brand-marks";
import { ResponsiveImage } from "@/components/responsive-image";
import { Calendar, MapPin } from "lucide-react";
import {
  buildPublicListingCards,
  remainingForCategories,
  type ListingEvent,
} from "@/lib/commerce/public-listings";
import {
  PUBLIC_LISTING_STATUSES,
  publicListingInclude,
} from "@/lib/commerce/listing-query";

export const revalidate = 60;
export const metadata = { title: "Events & Tickets" };

export default async function EmbedShopPage() {
  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = (await prisma.event.findMany({
    where: {
      status: { in: [...PUBLIC_LISTING_STATUSES] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      subtitle: true,
      status: true,
      eventStartsAt: true,
      showRemainingAvailability: true,
      coverImageUrl: true,
      tourId: true,
      ...publicListingInclude,
    },
    orderBy: { eventStartsAt: "asc" },
    take: 48,
  })) as ListingEvent[];

  const listings = buildPublicListingCards(events, { linkMode: "embed" });

  return (
    <>
      <OrgTracking embedMode />

      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--tf-navy)]">
            Aktuelle Events
          </h1>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Wähle ein Event und sichere dir deine Tickets.
          </p>
        </div>

        <div className="space-y-3">
          {listings.map((card) => {
            const cheapest = Math.min(
              ...card.ticketCategories.map((c) => c.priceGrossCents),
              Number.POSITIVE_INFINITY,
            );
            const priced =
              Number.isFinite(cheapest) && cheapest < Number.POSITIVE_INFINITY
                ? formatCustomerPriceLabel({
                    ticketGrossCents: cheapest,
                    feeConfig,
                    formatEuro: formatEuroFromCents,
                    prefix: "ab",
                  })
                : null;
            const place =
              card.locationCity === "Mehrere Orte"
                ? "Mehrere Orte"
                : [card.locationName, card.locationCity].filter(Boolean).join(", ");
            const { remaining } = remainingForCategories(card.ticketCategories);

            return (
              <Link
                key={card.key}
                href={card.href}
                className="flex gap-3 overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white transition hover:border-[var(--tf-teal)] hover:shadow-[0_8px_24px_rgba(15,39,71,0.08)]"
              >
                <div className="relative h-28 w-28 shrink-0 bg-[var(--tf-navy)] sm:h-32 sm:w-32">
                  <ResponsiveImage
                    src={card.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback="event"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-3">
                  <h2 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--tf-navy)] sm:text-lg">
                    {card.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--tf-text-secondary)] sm:text-sm">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                    <span className="truncate">{card.whenLabel}</span>
                  </p>
                  {place ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--tf-text-secondary)] sm:text-sm">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                      <span className="truncate">{place}</span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--tf-navy)]">
                        {priced?.totalLabel ?? "Tickets"}
                      </p>
                      {priced?.surchargeLabel ? (
                        <p className="text-[11px] text-[var(--tf-text-secondary)]">
                          {priced.surchargeLabel}
                        </p>
                      ) : null}
                      {card.showRemainingAvailability && remaining >= 0 ? (
                        <p className="text-[11px] text-[var(--tf-text-secondary)]">
                          Noch {remaining} Tickets
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-[var(--tf-navy)] px-3 py-1.5 text-xs font-semibold text-white">
                      {card.dateCount > 1 ? "Termine" : "Tickets"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {listings.length === 0 ? (
          <p className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[var(--tf-text-secondary)]">
            Aktuell sind keine Events im Vorverkauf.
          </p>
        ) : null}

        <div className="space-y-1.5 border-t border-[var(--tf-line)] pt-4">
          <p className="text-center text-[11px] font-medium text-[var(--tf-text-secondary)]">
            Sicher bezahlen mit
          </p>
          <PaymentBrandRow className="justify-center" />
        </div>
      </div>
    </>
  );
}
