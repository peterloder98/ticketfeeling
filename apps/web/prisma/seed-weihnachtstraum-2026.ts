/**
 * SCHLAGERfeeling Weihnachtstraum 2026 — Tour mit 3 Terminen + 10€-ab-2-Tickets Aktion.
 * Run: npm run db:seed:weihnachtstraum  (from apps/web)
 *   or: npx tsx prisma/seed-weihnachtstraum-2026.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VIP_NAME = "VIP-Ticket | freie Sitzplatzwahl";
const VIP_DESCRIPTION =
  "VIP-Ticket mit freier Sitzplatzwahl:\n" +
  "• früherer Einlass (halbe Std. vor regulärem Einlass)\n" +
  "• Begrüßung durch Anni Perka und ihre Gäste\n" +
  "• Meet and Greet\n" +
  "• musikalische Überraschung\n" +
  "• beste und garantierte Sitzplätze direkt in den ersten Reihen";

const NORMAL_DESCRIPTION = "Normale Tickets · freie Platzwahl · Reihenbestuhlung.";

/** Promo: 10 € once off the order when buying ≥2 eligible tickets (Normal + VIP). */
const PROMO = {
  name: "10 € sparen",
  badgeLabel: "10 € sparen",
  badgeDisclaimer: "* beim Kauf von 2 Tickets",
  /** Inclusive end of day Europe/Berlin 2026-08-31 */
  validUntil: new Date("2026-08-31T23:59:59.999+02:00"),
  valueCents: 1000,
  minQuantity: 2,
};

const NORMAL_PRICE_CENTS = 4900;
const VIP_PRICE_CENTS = 8900;

type DateSpec = {
  slug: string;
  subtitle: string;
  location: {
    name: string;
    slug: string;
    city: string;
    postalCode: string;
    street: string;
    houseNumber: string | null;
    description: string;
    maxCapacity: number;
  };
  startsAt: string;
  endsAt: string;
  doorsOpenAt: string;
  vipDoorsOpenAt: string;
  capacityNormal: number;
  /** 0 = sold out but still listed */
  capacityVip: number;
};

const DATES: DateSpec[] = [
  {
    slug: "schlagerfeeling-weihnachtstraum-2026-loewenberg",
    subtitle: "Bürgerhaus Löwenberg · Löwenberger Land",
    location: {
      name: "Bürgerhaus Löwenberg",
      slug: "buergerhaus-loewenberg",
      city: "Löwenberger Land",
      postalCode: "16775",
      street: "Am Waldstadion",
      houseNumber: "6",
      description: "Bürgerhaus Löwenberg, Am Waldstadion 6, 16775 Löwenberger Land.",
      maxCapacity: 204,
    },
    startsAt: "2026-11-29T17:00:00+01:00",
    endsAt: "2026-11-29T20:30:00+01:00",
    doorsOpenAt: "2026-11-29T16:00:00+01:00",
    vipDoorsOpenAt: "2026-11-29T15:30:00+01:00",
    capacityNormal: 200,
    capacityVip: 4,
  },
  {
    slug: "schlagerfeeling-weihnachtstraum-2026-ergolding",
    subtitle: "Bürgersaal Ergolding",
    location: {
      name: "Bürgersaal Ergolding",
      slug: "buergersaal-ergolding",
      city: "Ergolding",
      postalCode: "84030",
      street: "Lindenstraße",
      houseNumber: "40",
      description: "Bürgersaal Ergolding, Lindenstraße 40, 84030 Ergolding.",
      maxCapacity: 287,
    },
    startsAt: "2026-12-10T19:00:00+01:00",
    endsAt: "2026-12-10T22:30:00+01:00",
    doorsOpenAt: "2026-12-10T18:00:00+01:00",
    vipDoorsOpenAt: "2026-12-10T17:30:00+01:00",
    capacityNormal: 283,
    capacityVip: 4,
  },
  {
    slug: "schlagerfeeling-weihnachtstraum-2026-hamburg",
    subtitle: "Kent Club · Hamburg",
    location: {
      name: "Kent Club Hamburg",
      slug: "kent-club-hamburg",
      city: "Hamburg",
      postalCode: "22769",
      street: "Stresemannstraße",
      houseNumber: "163",
      description: "Kent Club Hamburg, Stresemannstraße 163, 22769 Hamburg.",
      maxCapacity: 173,
    },
    startsAt: "2026-12-13T17:00:00+01:00",
    endsAt: "2026-12-13T20:30:00+01:00",
    doorsOpenAt: "2026-12-13T16:00:00+01:00",
    vipDoorsOpenAt: "2026-12-13T15:30:00+01:00",
    capacityNormal: 173,
    capacityVip: 0,
  },
];

async function ensureCategory(input: {
  eventId: string;
  taxRateId: string;
  name: string;
  description: string;
  priceGrossCents: number;
  capacity: number;
  sortOrder: number;
  categoryKind: string;
  doorsOpenAt: Date | null;
  doorsNote: string | null;
  /** When true, fill online pool as sold (VIP Hamburg) */
  forceSoldOut?: boolean;
}) {
  const {
    eventId,
    taxRateId,
    name,
    description,
    priceGrossCents,
    capacity,
    sortOrder,
    categoryKind,
    doorsOpenAt,
    doorsNote,
    forceSoldOut,
  } = input;

  // Match by kind first (rename Normal/VIP → VIP-Ticket …), else by exact name.
  const existing =
    (await prisma.eventTicketCategory.findFirst({
      where: { eventId, categoryKind, status: "active" },
    })) ??
    (await prisma.eventTicketCategory.findFirst({
      where: { eventId, name },
    })) ??
    (categoryKind === "vip"
      ? await prisma.eventTicketCategory.findFirst({
          where: { eventId, name: { startsWith: "VIP" } },
        })
      : await prisma.eventTicketCategory.findFirst({
          where: { eventId, name: "Normal" },
        }));

  const safetyReserve = 0;
  const data = {
    name,
    description,
    priceGrossCents,
    capacity,
    safetyReserve,
    maxPerOrder: 8,
    onlineBookable: true,
    boxOfficeBookable: true,
    freeSeating: true,
    categoryKind,
    sortOrder,
    status: "active" as const,
    saleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
    taxRateId,
    doorsOpenAt,
    doorsNote,
  };

  const category = existing
    ? await prisma.eventTicketCategory.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.eventTicketCategory.create({
        data: { eventId, ...data },
      });

  const poolCap = Math.max(0, capacity - safetyReserve);
  const soldOnline = forceSoldOut ? poolCap : undefined;

  await prisma.inventoryPool.upsert({
    where: { categoryId_channel: { categoryId: category.id, channel: "online" } },
    update: {
      capacity: poolCap,
      ...(soldOnline != null ? { soldQuantity: soldOnline, heldQuantity: 0 } : {}),
    },
    create: {
      eventId,
      categoryId: category.id,
      channel: "online",
      capacity: poolCap,
      soldQuantity: soldOnline ?? 0,
      heldQuantity: 0,
    },
  });
  await prisma.inventoryPool.upsert({
    where: { categoryId_channel: { categoryId: category.id, channel: "box_office" } },
    update: {
      capacity: Math.min(80, poolCap),
      ...(forceSoldOut ? { soldQuantity: Math.min(80, poolCap), heldQuantity: 0 } : {}),
    },
    create: {
      eventId,
      categoryId: category.id,
      channel: "box_office",
      capacity: Math.min(80, poolCap),
      soldQuantity: forceSoldOut ? Math.min(80, poolCap) : 0,
      heldQuantity: 0,
    },
  });

  return category;
}

async function ensurePromoCampaign(
  eventId: string,
  categoryIds: string[],
) {
  const existing = await prisma.eventPriceCampaign.findFirst({
    where: {
      eventId,
      OR: [{ name: PROMO.name }, { badgeLabel: PROMO.badgeLabel }],
    },
  });

  const data = {
    name: PROMO.name,
    active: true,
    validFrom: new Date("2026-01-01T00:00:00+01:00"),
    validUntil: PROMO.validUntil,
    type: "fixed",
    value: PROMO.valueCents,
    channels: "both",
    applyMode: "order",
    minQuantity: PROMO.minQuantity,
    badgeLabel: PROMO.badgeLabel,
    badgeDisclaimer: PROMO.badgeDisclaimer,
  };

  let campaignId: string;
  if (existing) {
    await prisma.eventPriceCampaign.update({
      where: { id: existing.id },
      data,
    });
    campaignId = existing.id;
    await prisma.eventPriceCampaignCategory.deleteMany({ where: { campaignId } });
  } else {
    const created = await prisma.eventPriceCampaign.create({
      data: { eventId, ...data },
    });
    campaignId = created.id;
  }

  if (categoryIds.length > 0) {
    await prisma.eventPriceCampaignCategory.createMany({
      data: categoryIds.map((categoryId) => ({ campaignId, categoryId })),
      skipDuplicates: true,
    });
  }
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "schlagerfeeling" } });
  if (!org) throw new Error("Organization schlagerfeeling missing — run main seed first");

  const tax7 = await prisma.taxRate.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Ermäßigt 7%" } },
    update: { rateBps: 700, isDefaultTicket: true, active: true },
    create: {
      organizationId: org.id,
      name: "Ermäßigt 7%",
      rateBps: 700,
      isDefaultTicket: true,
      active: true,
    },
  });

  const tour = await prisma.tour.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "schlagerfeeling-weihnachtstraum-2026",
      },
    },
    update: {
      name: "SCHLAGERfeeling Weihnachtstraum",
      shortDescription:
        "Freie Platzwahl · Normal 49,00 € · VIP 89,00 € · Aktion: 10 € sparen ab 2 Tickets.",
      description:
        "SCHLAGERfeeling Weihnachtstraum 2026 — drei Termine, freie Platzwahl (Reihenbestuhlung). Normal 49,00 € · VIP 89,00 €. Aktion: 10 € sparen beim Kauf von 2 Tickets (bis 31.08.2026).",
      startsOn: new Date("2026-11-29"),
      endsOn: new Date("2026-12-13"),
      visibility: "published",
    },
    create: {
      organizationId: org.id,
      name: "SCHLAGERfeeling Weihnachtstraum",
      slug: "schlagerfeeling-weihnachtstraum-2026",
      shortDescription:
        "Freie Platzwahl · Normal 49,00 € · VIP 89,00 € · Aktion: 10 € sparen ab 2 Tickets.",
      description:
        "SCHLAGERfeeling Weihnachtstraum 2026 — drei Termine, freie Platzwahl (Reihenbestuhlung). Normal 49,00 € · VIP 89,00 €. Aktion: 10 € sparen beim Kauf von 2 Tickets (bis 31.08.2026).",
      startsOn: new Date("2026-11-29"),
      endsOn: new Date("2026-12-13"),
      visibility: "published",
    },
  });

  // Retire the old single demo event slug if it still exists
  const legacy = await prisma.event.findFirst({
    where: {
      organizationId: org.id,
      slug: "schlagerfeeling-weihnachtstraum-2026",
    },
  });
  if (legacy) {
    await prisma.event.update({
      where: { id: legacy.id },
      data: {
        slug: "schlagerfeeling-weihnachtstraum-2026-legacy",
        status: "cancelled",
        name: "SCHLAGERfeeling Weihnachtstraum (alt)",
      },
    });
  }

  const description =
    "SCHLAGERfeeling Weihnachtstraum — weihnachtliche Schlager-Show mit freier Platzwahl (Reihenbestuhlung).\n\n" +
    "Tickets:\n" +
    "• Normal 49,00 €\n" +
    "• VIP 89,00 € — freier Sitzplatzwahl, früherer Einlass, Begrüßung, Meet and Greet, musikalische Überraschung, beste Plätze in den ersten Reihen.\n\n" +
    "Aktion bis 31.08.2026: 10 € sparen beim Kauf von 2 Tickets.";

  for (const date of DATES) {
    const location = await prisma.location.upsert({
      where: {
        organizationId_slug: { organizationId: org.id, slug: date.location.slug },
      },
      update: {
        name: date.location.name,
        city: date.location.city,
        postalCode: date.location.postalCode,
        street: date.location.street,
        houseNumber: date.location.houseNumber,
        country: "DE",
        description: date.location.description,
        maxCapacity: date.location.maxCapacity,
      },
      create: {
        organizationId: org.id,
        name: date.location.name,
        slug: date.location.slug,
        city: date.location.city,
        postalCode: date.location.postalCode,
        street: date.location.street,
        houseNumber: date.location.houseNumber,
        country: "DE",
        description: date.location.description,
        maxCapacity: date.location.maxCapacity,
      },
    });

    const event = await prisma.event.upsert({
      where: {
        organizationId_slug: { organizationId: org.id, slug: date.slug },
      },
      update: {
        tourId: tour.id,
        locationId: location.id,
        name: "SCHLAGERfeeling Weihnachtstraum",
        subtitle: date.subtitle,
        eventType: "concert",
        shortDescription:
          "Freie Platzwahl · Normal 49,00 € · VIP 89,00 € · Aktion: 10 € sparen ab 2 Tickets.",
        description,
        status: "presale_active",
        seatingBookingMode: "none",
        eventStartsAt: new Date(date.startsAt),
        eventEndsAt: new Date(date.endsAt),
        doorsOpenAt: new Date(date.doorsOpenAt),
        vipDoorsOpenAt: new Date(date.vipDoorsOpenAt),
        visibleFrom: new Date(),
        presaleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
        trackingReviewedAt: new Date(),
        trackingUseOrgDefaults: true,
        showRemainingAvailability: false,
        artistsUseTourDefaults: true,
        detailsUseTourDefaults: true,
      },
      create: {
        organizationId: org.id,
        tourId: tour.id,
        locationId: location.id,
        name: "SCHLAGERfeeling Weihnachtstraum",
        subtitle: date.subtitle,
        slug: date.slug,
        eventType: "concert",
        shortDescription:
          "Freie Platzwahl · Normal 49,00 € · VIP 89,00 € · Aktion: 10 € sparen ab 2 Tickets.",
        description,
        status: "presale_active",
        seatingBookingMode: "none",
        eventStartsAt: new Date(date.startsAt),
        eventEndsAt: new Date(date.endsAt),
        doorsOpenAt: new Date(date.doorsOpenAt),
        vipDoorsOpenAt: new Date(date.vipDoorsOpenAt),
        visibleFrom: new Date(),
        presaleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
        trackingReviewedAt: new Date(),
        trackingUseOrgDefaults: true,
        showRemainingAvailability: false,
        artistsUseTourDefaults: true,
        detailsUseTourDefaults: true,
      },
    });

    // Retire legacy demo categories
    await prisma.eventTicketCategory.updateMany({
      where: {
        eventId: event.id,
        name: { in: ["Kategorie 1", "Kategorie 2", "Kategorie 3"] },
        status: "active",
      },
      data: { status: "inactive", onlineBookable: false, boxOfficeBookable: false },
    });

    const normal = await ensureCategory({
      eventId: event.id,
      taxRateId: tax7.id,
      name: "Normal",
      description: NORMAL_DESCRIPTION,
      priceGrossCents: NORMAL_PRICE_CENTS,
      capacity: date.capacityNormal,
      sortOrder: 2,
      categoryKind: "free_choice",
      doorsOpenAt: null,
      doorsNote: null,
    });

    const vip = await ensureCategory({
      eventId: event.id,
      taxRateId: tax7.id,
      name: VIP_NAME,
      description: VIP_DESCRIPTION,
      priceGrossCents: VIP_PRICE_CENTS,
      capacity: date.capacityVip,
      sortOrder: 1,
      categoryKind: "vip",
      doorsOpenAt: new Date(date.vipDoorsOpenAt),
      doorsNote: "VIP-Einlass: eine halbe Stunde vor dem regulären Einlass",
      forceSoldOut: date.capacityVip === 0,
    });

    await ensurePromoCampaign(event.id, [normal.id, vip.id]);

    console.log(
      `  ✓ ${date.subtitle} → /event/${event.slug}` +
        ` · Normal ${date.capacityNormal}` +
        ` · VIP ${date.capacityVip === 0 ? "ausverkauft" : date.capacityVip}`,
    );
  }

  console.log("Seeded SCHLAGERfeeling Weihnachtstraum 2026 (Tour, 3 Termine)");
  console.log("  Normal 49,00 € · VIP 89,00 € · Aktion 10 € ab 2 Tickets bis 31.08.2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
