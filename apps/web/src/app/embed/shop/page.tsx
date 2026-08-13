import Link from "next/link";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { OrgTracking } from "@/components/org-tracking";
import { PaymentBrandRow } from "@/components/payment-brand-marks";
import { ResponsiveImage } from "@/components/responsive-image";
import { CampaignPromoCallout } from "@/components/campaign-promo-callout";
import { Calendar, MapPin } from "lucide-react";
import { buildPublicListingCards } from "@/lib/commerce/public-listings";
import { listingCardsToEventCardData } from "@/lib/commerce/listing-card-data";
import { loadPublicListingEvents } from "@/lib/commerce/listing-query";
import { FeeSurchargeNote } from "@/components/fee-info-dialog";

/** Live flip of due Vorverkaufsstart must not wait on ISR cache. */
export const dynamic = "force-dynamic";
export const metadata = { title: "Events & Tickets" };

export default async function EmbedShopPage() {
  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = await loadPublicListingEvents({ take: 48 });

  const listings = buildPublicListingCards(events, { linkMode: "embed" });
  const cards = await listingCardsToEventCardData(listings, feeConfig);
  const byKey = new Map(listings.map((c) => [c.key, c]));

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
          {cards.map((card) => {
            const listing = byKey.get(card.id);
            const place =
              card.locationCity === "Mehrere Orte"
                ? "Mehrere Orte"
                : [card.locationName, card.locationCity].filter(Boolean).join(", ");
            const remaining = card.remainingTickets ?? 0;
            const onSale = Boolean(card.listPriceLabel && card.saleBadge);

            return (
              <Link
                key={card.id}
                href={card.href ?? "#"}
                className="group flex gap-3 overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white transition hover:border-[var(--tf-teal)] hover:shadow-[0_8px_24px_rgba(15,39,71,0.08)]"
              >
                <div className="relative h-28 w-28 shrink-0 overflow-hidden bg-[var(--tf-navy)] sm:h-32 sm:w-32">
                  <ResponsiveImage
                    src={card.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
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
                    <div className="min-w-0">
                      {onSale ? (
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-xs tabular-nums text-[var(--tf-text-secondary)] line-through">
                            {card.listPriceLabel}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-[var(--tf-sale)]">
                            {card.priceLabel}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-[var(--tf-navy)]">
                          {card.priceLabel ?? "Tickets"}
                        </p>
                      )}
                      {card.saleBadge || card.campaignName || card.saleDisclaimer ? (
                        <CampaignPromoCallout
                          campaignName={card.campaignName}
                          saleBadge={card.saleBadge}
                          saleDisclaimer={card.saleDisclaimer}
                          size="sm"
                          className="mt-1.5"
                        />
                      ) : null}
                      {card.priceNote ? (
                        <FeeSurchargeNote
                          as="p"
                          note={card.priceNote}
                          feePercentageBasisPoints={feeConfig.percentageBasisPoints}
                          textClassName="text-[11px] text-[var(--tf-text-secondary)]"
                        />
                      ) : null}
                      {card.showRemainingAvailability && remaining >= 0 ? (
                        <p className="text-[11px] text-[var(--tf-text-secondary)]">
                          Noch {remaining} Tickets
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-[var(--tf-navy)] px-3 py-1.5 text-xs font-semibold text-white">
                      {(listing?.dateCount ?? 1) > 1 ? "Termine" : "Tickets"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {cards.length === 0 ? (
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
