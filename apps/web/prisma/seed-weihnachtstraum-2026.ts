/**
 * SCHLAGERfeeling Weihnachtstraum 2026 — Tour mit 3 Terminen.
 * Run: npx tsx prisma/seed-weihnachtstraum-2026.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VIP_DESCRIPTION =
  "VIP: Plätze in den ersten beiden Reihen, früherer Einlass (halbe Stunde früher), musikalische Überraschung. Freie Platzwahl · Reihenbestuhlung.";

const NORMAL_DESCRIPTION = "Normale Tickets · freie Platzwahl · Reihenbestuhlung.";

type DateSpec = {
  slug: string;
  subtitle: string;
  location: {
    name: string;
    slug: string;
    city: string;
    postalCode: string;
    street: string;
    description: string;
    maxCapacity: number;
  };
  /** ISO local with offset */
  startsAt: string;
  endsAt: string;
  doorsOpenAt: string;
  vipDoorsOpenAt: string;
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
      street: "Bürgerhaus Löwenberg",
      description: "Bürgerhaus Löwenberg im Löwenberger Land.",
      maxCapacity: 800,
    },
    startsAt: "2026-11-30T16:00:00+01:00",
    endsAt: "2026-11-30T19:30:00+01:00",
    doorsOpenAt: "2026-11-30T15:00:00+01:00",
    vipDoorsOpenAt: "2026-11-30T14:30:00+01:00",
  },
  {
    slug: "schlagerfeeling-weihnachtstraum-2026-ergolding",
    subtitle: "Bürgersaal Ergolding",
    location: {
      name: "Bürgersaal Ergolding",
      slug: "buergersaal-ergolding",
      city: "Ergolding",
      postalCode: "84030",
      street: "Am Bürgersaal",
      description: "Bürgersaal Ergolding — zentrale Location für große Schlagerabende.",
      maxCapacity: 1200,
    },
    startsAt: "2026-12-10T18:00:00+01:00",
    endsAt: "2026-12-10T21:30:00+01:00",
    doorsOpenAt: "2026-12-10T17:00:00+01:00",
    vipDoorsOpenAt: "2026-12-10T16:30:00+01:00",
  },
  {
    slug: "schlagerfeeling-weihnachtstraum-2026-hamburg",
    subtitle: "Kent Club · Hamburg",
    location: {
      name: "Kent Club",
      slug: "kent-club-hamburg",
      city: "Hamburg",
      postalCode: "20359",
      street: "Kent Club",
      description: "Kent Club Hamburg.",
      maxCapacity: 900,
    },
    startsAt: "2026-12-13T16:00:00+01:00",
    endsAt: "2026-12-13T19:30:00+01:00",
    doorsOpenAt: "2026-12-13T15:00:00+01:00",
    vipDoorsOpenAt: "2026-12-13T14:30:00+01:00",
  },
];

async function ensureCategories(
  eventId: string,
  taxRateId: string,
  capacityNormal: number,
  capacityVip: number,
) {
  const rows = [
    {
      name: "Normal",
      description: NORMAL_DESCRIPTION,
      priceGrossCents: 5490,
      capacity: capacityNormal,
      sortOrder: 2,
      categoryKind: "free_choice",
    },
    {
      name: "VIP",
      description: VIP_DESCRIPTION,
      priceGrossCents: 9890,
      capacity: capacityVip,
      sortOrder: 1,
      categoryKind: "vip",
    },
  ];

  // Remove legacy demo categories that no longer apply
  await prisma.eventTicketCategory.updateMany({
    where: {
      eventId,
      name: { in: ["Kategorie 1", "Kategorie 2", "Kategorie 3"] },
      status: "active",
    },
    data: { status: "inactive", onlineBookable: false, boxOfficeBookable: false },
  });

  for (const row of rows) {
    const existing = await prisma.eventTicketCategory.findFirst({
      where: { eventId, name: row.name },
    });
    const category = existing
      ? await prisma.eventTicketCategory.update({
          where: { id: existing.id },
          data: {
            description: row.description,
            priceGrossCents: row.priceGrossCents,
            capacity: row.capacity,
            safetyReserve: 5,
            maxPerOrder: 8,
            onlineBookable: true,
            boxOfficeBookable: true,
            freeSeating: true,
            categoryKind: row.categoryKind,
            sortOrder: row.sortOrder,
            status: "active",
            saleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
            taxRateId,
          },
        })
      : await prisma.eventTicketCategory.create({
          data: {
            eventId,
            taxRateId,
            name: row.name,
            description: row.description,
            priceGrossCents: row.priceGrossCents,
            capacity: row.capacity,
            safetyReserve: 5,
            maxPerOrder: 8,
            onlineBookable: true,
            boxOfficeBookable: true,
            freeSeating: true,
            categoryKind: row.categoryKind,
            sortOrder: row.sortOrder,
            status: "active",
            saleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
          },
        });

    const poolCap = Math.max(0, row.capacity - 5);
    await prisma.inventoryPool.upsert({
      where: { categoryId_channel: { categoryId: category.id, channel: "online" } },
      update: { capacity: poolCap },
      create: {
        eventId,
        categoryId: category.id,
        channel: "online",
        capacity: poolCap,
        soldQuantity: 0,
        heldQuantity: 0,
      },
    });
    await prisma.inventoryPool.upsert({
      where: { categoryId_channel: { categoryId: category.id, channel: "box_office" } },
      update: { capacity: Math.min(80, poolCap) },
      create: {
        eventId,
        categoryId: category.id,
        channel: "box_office",
        capacity: Math.min(80, poolCap),
        soldQuantity: 0,
        heldQuantity: 0,
      },
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
      description:
        "SCHLAGERfeeling Weihnachtstraum 2026 — drei Termine, freie Platzwahl (Reihenbestuhlung). Normal 54,90 € · VIP 98,90 € (erste beiden Reihen, Einlass 30 Min. früher, musikalische Überraschung).",
      startsOn: new Date("2026-11-30"),
      endsOn: new Date("2026-12-13"),
      visibility: "published",
    },
    create: {
      organizationId: org.id,
      name: "SCHLAGERfeeling Weihnachtstraum",
      slug: "schlagerfeeling-weihnachtstraum-2026",
      description:
        "SCHLAGERfeeling Weihnachtstraum 2026 — drei Termine, freie Platzwahl (Reihenbestuhlung). Normal 54,90 € · VIP 98,90 € (erste beiden Reihen, Einlass 30 Min. früher, musikalische Überraschung).",
      startsOn: new Date("2026-11-30"),
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
    "• Normal 54,90 €\n" +
    "• VIP 98,90 € — Plätze in den ersten beiden Reihen, Einlass eine halbe Stunde früher, musikalische Überraschung.";

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
          "Freie Platzwahl · Normal 54,90 € · VIP 98,90 € (erste Reihen, früherer Einlass, Überraschung).",
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
          "Freie Platzwahl · Normal 54,90 € · VIP 98,90 € (erste Reihen, früherer Einlass, Überraschung).",
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
      },
    });

    const normalCap = Math.max(200, Math.floor(date.location.maxCapacity * 0.85));
    const vipCap = Math.max(40, Math.floor(date.location.maxCapacity * 0.08));
    await ensureCategories(event.id, tax7.id, normalCap, vipCap);

    console.log(`  ✓ ${date.subtitle} → /event/${event.slug}`);
  }

  console.log("Seeded SCHLAGERfeeling Weihnachtstraum 2026 (Tour, 3 Termine)");
  console.log("  Normal 54,90 € · VIP 98,90 € · freie Platzwahl");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
