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
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events & Tickets" };

export default async function EmbedShopPage() {
  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["announcement", "published", "presale_active"] },
    },
    include: {
      location: true,
      tour: { select: { coverImageUrl: true } },
      ticketCategories: {
        where: { status: "active", onlineBookable: true },
        orderBy: { priceGrossCents: "asc" },
        take: 1,
      },
    },
    orderBy: { eventStartsAt: "asc" },
  });

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
          {events.map((event) => {
            const cheapest = event.ticketCategories[0];
            const priced = cheapest
              ? formatCustomerPriceLabel({
                  ticketGrossCents: cheapest.priceGrossCents,
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
              : "Termin folgt";
            const place = [event.location?.name, event.location?.city].filter(Boolean).join(", ");

            return (
              <Link
                key={event.id}
                href={`/embed/event/${event.slug}`}
                className="flex gap-3 overflow-hidden rounded-2xl border border-[var(--tf-line)] bg-white transition hover:border-[var(--tf-teal)] hover:shadow-[0_8px_24px_rgba(15,39,71,0.08)]"
              >
                <div className="relative h-28 w-28 shrink-0 bg-[var(--tf-navy)] sm:h-32 sm:w-32">
                  <ResponsiveImage
                    src={resolveEventCoverUrl(event)}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback="event"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-3">
                  <h2 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--tf-navy)] sm:text-lg">
                    {event.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--tf-text-secondary)] sm:text-sm">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                    <span className="truncate">{when}</span>
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
                    </div>
                    <span className="rounded-full bg-[var(--tf-navy)] px-3 py-1.5 text-xs font-semibold text-white">
                      Tickets
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {events.length === 0 ? (
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
