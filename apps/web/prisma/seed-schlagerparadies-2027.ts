/**
 * Seeds Schlagerparadies 2027 events + artists.
 * Run: npx tsx prisma/seed-schlagerparadies-2027.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ARTISTS: {
  name: string;
  type: string;
  genre: string;
  shortBio: string;
  biography: string;
  youtube: string;
  homepage: string;
  image: string;
  header: string;
  origin?: string;
}[] = [
  {
    name: "Anni Perka",
    type: "solo",
    genre: "Schlager",
    origin: "Hamburg",
    shortBio: "Hamburger Popschlager mit Bühnenpower — von der Musical-Ausbildung zu eigenen Hits.",
    biography:
      "Anni Perka (* 8. März 1989 in Hamburg) ist deutsche Schlagersängerin. Nach der Musical-Ausbildung an der Stage School Hamburg sammelte sie Bühnenerfahrung, u. a. als Helene-Fischer-Double. 2015 debütierte sie im TV bei Florian Silbereisen; 2016 erschien bei Telamo ihr Debütalbum „Lass uns träumen“ (Top 10 der Schlagercharts). Bekannt u. a. für Hits wie „Bitte melde dich“.",
    youtube: "https://www.youtube.com/watch?v=WS-15hSpp2E",
    homepage: "https://www.anniperka.de/",
    image: "/artists/anni-perka.jpg",
    header: "/artists/anni-perka.jpg",
  },
  {
    name: "Norman Langen",
    type: "solo",
    genre: "Schlager",
    origin: "Kreis Heinsberg",
    shortBio: "DSDS-Absolvent, Chart-Hits und Ballermann-Energie — seit 2011 fest im Popschlager.",
    biography:
      "Norman Langen (* 7. März 1985 in Würselen-Bardenberg) wurde 2011 durch „Deutschland sucht den Superstar“ bekannt. Noch im selben Jahr stieg sein Debütalbum „Pures Gold“ auf Platz 11 der deutschen Charts. Seither ist er mit Alben wie „Dieses Gefühl“ und Hits wie „Isabella“ eine feste Größe im deutschsprachigen Popschlager; ausgezeichnet u. a. mit Ballermann- und smago!-Awards.",
    youtube: "https://www.youtube.com/watch?v=xbKE3xbepK4",
    homepage: "https://www.norman-langen.de/",
    image: "/artists/norman-langen.jpg",
    header: "/artists/norman-langen.jpg",
  },
  {
    name: "Sonia Liebing",
    type: "solo",
    genre: "Schlager",
    origin: "Köln / Pulheim",
    shortBio: "Kraftvolle Stimme aus Köln — Electrola-Künstlerin mit Gefühl und Hitgefühl.",
    biography:
      "Sonia Liebing (* 6. September 1989 in Köln) ist gelernte Einzelhandelskauffrau und lebt mit ihrer Familie in Pulheim. Über die „Schlagernacht des Jahres“-Tour wurde sie einem großen Publikum bekannt; seit 2019 steht sie bei Electrola unter Vertrag. Debütalbum „Wunschlos glücklich“ (2019); aktuelle Hits wie „Jugendliebe (2025 Version)“ zeigen ihren modernen Schlager-Sound.",
    youtube: "https://www.youtube.com/watch?v=uEjCDd_g3Mo",
    homepage: "https://sonialiebing.de/",
    image: "/artists/sonia-liebing.jpg",
    header: "/artists/sonia-liebing.jpg",
  },
  {
    name: "Pietro Basile",
    type: "solo",
    genre: "Schlager / Pop",
    origin: "München",
    shortBio: "Deutsch-italienischer Pop mit Herz — von „Scusami“ bis zu Millionen Streams.",
    biography:
      "Pietro Basile (* 21. Juli 1989 in München) wuchs zweisprachig auf und verbindet deutsche und italienische Texte. 2008 wurde „Scusami“ zum YouTube-Hit; später folgten Chart-Duette mit Sarah Engels („Ich liebe nur dich“) und Erfolge wie „Gianna“. Live bringt er emotionale Balladen und poppige Up-Tempo-Nummern auf die Bühne.",
    youtube: "https://www.youtube.com/watch?v=diOxltF_UQ4",
    homepage: "https://www.pietrobasile.com/",
    image: "/artists/pietro-basile.jpg",
    header: "/artists/pietro-basile.jpg",
  },
  {
    name: "Laura und Mark",
    type: "duo",
    genre: "Pop-Schlager",
    origin: "NL / DE",
    shortBio: "DSDS-Paar und Duo — echte Liebesgeschichte, selbst produzierter Popschlager.",
    biography:
      "Laura van den Elzen und Mark Hoffmann lernten sich 2016 bei „Deutschland sucht den Superstar“ kennen (Laura Platz 2, Mark Platz 4) und sind seither privat und musikalisch ein Paar. Unter dem Label ELPEMA schreiben und produzieren sie ihre Songs selbst. Mit Titeln wie „Ein bisschen verliebt“ und „Ach was, ich wag das?!“ sind sie in Radio, TV und auf großen Schlagerbühnen präsent.",
    youtube: "https://www.youtube.com/watch?v=jJv261N60QQ",
    homepage: "https://lauraundmark.de/",
    image: "/artists/laura-und-mark.jpg",
    header: "/artists/laura-und-mark.jpg",
  },
  {
    name: "Bürgermeister MarKuss",
    type: "solo",
    genre: "Schlager / Entertainment",
    origin: "Bad Kötzting",
    shortBio: "Bürgermeister by day, Schlagersänger by night — Show aus dem Bayerischen Wald.",
    biography:
      "Markus Hofmann (* 5. September 1975) ist seit 2014 Erster Bürgermeister von Bad Kötzting und tritt als Schlagersänger unter dem Namen Bürgermeister MarKuss auf. Parallel zum Rathaus bringt er Gute-Laune-Schlager wie „You Made My Day“ und „Kick Down“ auf die Bühne — Unterhaltung mit Augenzwinkern und regionalem Charme.",
    youtube: "https://www.youtube.com/watch?v=fTT3b16UW-Q",
    homepage: "https://schlager-buergermeister-markuss.de/",
    image: "/artists/buergermeister-markuss.jpg",
    header: "/artists/buergermeister-markuss.jpg",
  },
  {
    name: "Joelina Drews",
    type: "solo",
    genre: "Schlager / Pop",
    origin: "München",
    shortBio: "Tochter von Jürgen Drews — eigener Pop-Sound zwischen NDW-Flair und Schlager.",
    biography:
      "Joelina Drews (* 27. September 1995 in München) ist die Tochter von Jürgen Drews und Ramona Drews. Früh veröffentlichte sie Songs (u. a. „Trendsetter“); zeitweise trat sie als Joedy auf. Mit Titeln wie „Raumschiff“ und dem Cover „Durch und durch“ verbindet sie Pop, Schlager und 80er-/NDW-Einflüsse — und steht regelmäßig in TV-Shows auf der Bühne.",
    youtube: "https://www.youtube.com/watch?v=Q_ulg7T3QoU",
    homepage: "https://www.instagram.com/ichbinjoelina/",
    image: "/artists/joelina-drews.jpg",
    header: "/artists/joelina-drews.jpg",
  },
  {
    name: "Tammy",
    type: "solo",
    genre: "Mundart-Schlager",
    origin: "Schöllnach / Niederbayern",
    shortBio: "Bayerische Mundart mit Pop-Feeling — Lehrerin und Schlagersängerin aus Leidenschaft.",
    biography:
      "Tammy (bürgerlich Tamara Kreilinger) stammt aus Schöllnach in Niederbayern. Sie singt ausschließlich in bairischer Mundart und arbeitet parallel als Realschullehrerin für Deutsch und Geografie. Seit 2017 professionell unterwegs, produziert u. a. mit Willy Klüter; bekannt durch TV-Auftritte (z. B. ZDF-Fernsehgarten) und Songs wie „Lausbua“ und „Vogelwuid“.",
    youtube: "https://www.youtube.com/watch?v=75q6hQl_I-s",
    homepage: "https://www.tammy.tv/",
    image: "/artists/tammy.jpg",
    header: "/artists/tammy.jpg",
  },
  {
    name: "Mitch Keller",
    type: "solo",
    genre: "Schlager",
    origin: "Berlin",
    shortBio: "Vom Background für Reim & Berg zum eigenen Popschlager — Stimme mit Rockkante.",
    biography:
      "Mitch Keller (bürgerlich Michael Keller, * 5. Februar 1973 in West-Berlin) war lange Studiosänger und Background für Größen wie Matthias Reim und Andrea Berg, bevor er 2015 mit dem Album „Einer dieser Tage“ solo durchstartete. Er schreibt auch für andere Künstler, betreibt ein eigenes Studio und liefert modernen Schlager mit rockigen Akzenten — aktuell u. a. mit „Houston – das ist doch kein Problem“.",
    youtube: "https://www.youtube.com/watch?v=vDCsolTtJCw",
    homepage: "https://www.mitchkeller.de/",
    image: "/artists/mitch-keller.jpg",
    header: "/artists/mitch-keller.jpg",
  },
];

async function upsertArtist(
  organizationId: string,
  data: (typeof ARTISTS)[number],
  sortOrder: number,
) {
  const slug = slugify(data.name);
  return prisma.artist.upsert({
    where: { organizationId_slug: { organizationId, slug } },
    update: {
      name: data.name,
      artistType: data.type,
      genre: data.genre,
      origin: data.origin ?? null,
      shortBio: data.shortBio,
      biography: data.biography,
      youtube: data.youtube,
      homepage: data.homepage,
      profileImageUrl: data.image,
      headerImageUrl: data.header,
      visibility: "published",
      publishedAt: new Date(),
      sortOrder,
    },
    create: {
      organizationId,
      name: data.name,
      slug,
      artistType: data.type,
      genre: data.genre,
      origin: data.origin ?? null,
      shortBio: data.shortBio,
      biography: data.biography,
      youtube: data.youtube,
      homepage: data.homepage,
      profileImageUrl: data.image,
      headerImageUrl: data.header,
      visibility: "published",
      publishedAt: new Date(),
      sortOrder,
    },
  });
}

async function ensureCategories(
  eventId: string,
  taxRateId: string,
  rows: { name: string; priceGrossCents: number; capacity: number; sortOrder: number; description: string }[],
) {
  for (const row of rows) {
    const existing = await prisma.eventTicketCategory.findFirst({
      where: { eventId, name: row.name },
    });
    const category =
      existing ??
      (await prisma.eventTicketCategory.create({
        data: {
          eventId,
          taxRateId,
          name: row.name,
          description: row.description,
          priceGrossCents: row.priceGrossCents,
          capacity: row.capacity,
          safetyReserve: 10,
          maxPerOrder: 8,
          onlineBookable: true,
          boxOfficeBookable: true,
          freeSeating: true,
          sortOrder: row.sortOrder,
          status: "active",
          saleStartsAt: new Date(),
        },
      }));

    if (existing) {
      await prisma.eventTicketCategory.update({
        where: { id: existing.id },
        data: {
          priceGrossCents: row.priceGrossCents,
          capacity: row.capacity,
          description: row.description,
          sortOrder: row.sortOrder,
          status: "active",
        },
      });
    }

    await prisma.inventoryPool.upsert({
      where: { categoryId_channel: { categoryId: category.id, channel: "online" } },
      update: { capacity: Math.max(0, row.capacity - 10) },
      create: {
        eventId,
        categoryId: category.id,
        channel: "online",
        capacity: Math.max(0, row.capacity - 10),
        soldQuantity: 0,
        heldQuantity: 0,
      },
    });
  }
}

async function linkArtists(
  eventId: string,
  artistIds: string[],
) {
  let order = 1;
  for (const artistId of artistIds) {
    await prisma.eventArtist.upsert({
      where: { eventId_artistId: { eventId, artistId } },
      update: {
        announced: true,
        sortOrder: order,
        isHeadliner: order <= 2,
        role: order === 1 ? "headliner" : "artist",
      },
      create: {
        eventId,
        artistId,
        announced: true,
        sortOrder: order,
        isHeadliner: order <= 2,
        role: order === 1 ? "headliner" : "artist",
      },
    });
    order += 1;
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

  const artistMap: Record<string, string> = {};
  for (let i = 0; i < ARTISTS.length; i += 1) {
    const a = await upsertArtist(org.id, ARTISTS[i], i + 1);
    artistMap[ARTISTS[i].name] = a.id;
  }

  const ergolding = await prisma.location.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "buergersaal-ergolding" } },
    update: {
      name: "Bürgersaal Ergolding",
      city: "Ergolding",
      postalCode: "84030",
      street: "Am Bürgersaal",
      country: "DE",
      description: "Bürgersaal Ergolding — zentrale Location für große Schlagerabende.",
    },
    create: {
      organizationId: org.id,
      name: "Bürgersaal Ergolding",
      slug: "buergersaal-ergolding",
      city: "Ergolding",
      postalCode: "84030",
      street: "Am Bürgersaal",
      country: "DE",
      maxCapacity: 1200,
      description: "Bürgersaal Ergolding — zentrale Location für große Schlagerabende.",
    },
  });

  const hutzenthaler = await prisma.location.upsert({
    where: {
      organizationId_slug: { organizationId: org.id, slug: "landgasthof-hutzenthaler-bruckberg" },
    },
    update: {
      name: "Landgasthof Hutzenthaler",
      city: "Bruckberg",
      postalCode: "84079",
      street: "Hutzenthal",
      country: "DE",
      description: "Landgasthof Hutzenthaler in Bruckberg — Open-Air-Feeling mit Bühne und Atmosphäre.",
    },
    create: {
      organizationId: org.id,
      name: "Landgasthof Hutzenthaler",
      slug: "landgasthof-hutzenthaler-bruckberg",
      city: "Bruckberg",
      postalCode: "84079",
      street: "Hutzenthal",
      country: "DE",
      maxCapacity: 2500,
      description: "Landgasthof Hutzenthaler in Bruckberg — Open-Air-Feeling mit Bühne und Atmosphäre.",
    },
  });

  const herzen = await prisma.event.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "schlagernacht-der-herzen-2027",
      },
    },
    update: {
      name: "Schlagerparadies on tour: Schlagernacht der Herzen",
      subtitle: "Bürgersaal Ergolding",
      status: "presale_active",
      locationId: ergolding.id,
      eventStartsAt: new Date("2027-02-14T18:00:00+01:00"),
      eventEndsAt: new Date("2027-02-14T23:00:00+01:00"),
      doorsOpenAt: new Date("2027-02-14T16:30:00+01:00"),
      shortDescription: "Ein Abend voller Hits, Emotionen und großer Stimmen im Bürgersaal Ergolding.",
      description:
        "Schlagerparadies on tour präsentiert die Schlagernacht der Herzen. Mit dabei u. a. Anni Perka, Norman Langen, Sonia Liebing, Pietro Basile, Laura und Mark sowie Bürgermeister MarKuss. Beginn 18:00 Uhr.",
      // coverImageUrl: filled below if still empty (keep existing admin uploads)
      visibleFrom: new Date(),
      presaleStartsAt: new Date(),
    },
    create: {
      organizationId: org.id,
      locationId: ergolding.id,
      name: "Schlagerparadies on tour: Schlagernacht der Herzen",
      subtitle: "Bürgersaal Ergolding",
      slug: "schlagernacht-der-herzen-2027",
      eventType: "concert",
      status: "presale_active",
      eventStartsAt: new Date("2027-02-14T18:00:00+01:00"),
      eventEndsAt: new Date("2027-02-14T23:00:00+01:00"),
      doorsOpenAt: new Date("2027-02-14T16:30:00+01:00"),
      shortDescription: "Ein Abend voller Hits, Emotionen und großer Stimmen im Bürgersaal Ergolding.",
      description:
        "Schlagerparadies on tour präsentiert die Schlagernacht der Herzen. Mit dabei u. a. Anni Perka, Norman Langen, Sonia Liebing, Pietro Basile, Laura und Mark sowie Bürgermeister MarKuss. Beginn 18:00 Uhr.",
      coverImageUrl: "/events/schlagernacht-der-herzen-2027.webp",
      visibleFrom: new Date(),
      presaleStartsAt: new Date(),
      trackingReviewedAt: new Date(),
      trackingUseOrgDefaults: true,
    },
  });

  // Prefer bundled demo cover over empty / broken remote placeholders
  if (
    !herzen.coverImageUrl ||
    herzen.coverImageUrl.startsWith("https://images.unsplash.com/")
  ) {
    await prisma.event.update({
      where: { id: herzen.id },
      data: { coverImageUrl: "/events/schlagernacht-der-herzen-2027.webp" },
    });
  }

  await ensureCategories(herzen.id, tax7.id, [
    { name: "Kategorie 3", priceGrossCents: 4500, capacity: 350, sortOrder: 4, description: "Eintritt Kat. 3" },
    { name: "Kategorie 2", priceGrossCents: 5500, capacity: 300, sortOrder: 3, description: "Eintritt Kat. 2" },
    { name: "Kategorie 1", priceGrossCents: 6900, capacity: 220, sortOrder: 2, description: "Eintritt Kat. 1" },
    { name: "VIP", priceGrossCents: 9900, capacity: 80, sortOrder: 1, description: "VIP inkl. bevorzugtem Bereich" },
  ]);

  await linkArtists(herzen.id, [
    artistMap["Anni Perka"],
    artistMap["Norman Langen"],
    artistMap["Sonia Liebing"],
    artistMap["Pietro Basile"],
    artistMap["Laura und Mark"],
    artistMap["Bürgermeister MarKuss"],
  ]);

  const openAir = await prisma.event.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "schlagerfeeling-open-air-2027",
      },
    },
    update: {
      name: "Schlagerparadies on tour: SCHLAGERfeeling Open Air",
      subtitle: "Landgasthof Hutzenthaler · Bruckberg",
      status: "presale_active",
      locationId: hutzenthaler.id,
      eventStartsAt: new Date("2027-07-31T16:00:00+02:00"),
      eventEndsAt: new Date("2027-07-31T23:00:00+02:00"),
      doorsOpenAt: new Date("2027-07-31T14:00:00+02:00"),
      shortDescription: "Open Air in Bruckberg — Sommer, Hits und Live-Feeling ab 16:00 Uhr.",
      description:
        "SCHLAGERfeeling Open Air am Landgasthof Hutzenthaler in Bruckberg. Mit dabei u. a. Anni Perka, Joelina Drews, Tammy und Mitch Keller. Weitere Acts folgen. Beginn 16:00 Uhr.",
      // coverImageUrl: never overwrite — keep admin uploads
      visibleFrom: new Date(),
      presaleStartsAt: new Date(),
    },
    create: {
      organizationId: org.id,
      locationId: hutzenthaler.id,
      name: "Schlagerparadies on tour: SCHLAGERfeeling Open Air",
      subtitle: "Landgasthof Hutzenthaler · Bruckberg",
      slug: "schlagerfeeling-open-air-2027",
      eventType: "festival",
      status: "presale_active",
      eventStartsAt: new Date("2027-07-31T16:00:00+02:00"),
      eventEndsAt: new Date("2027-07-31T23:00:00+02:00"),
      doorsOpenAt: new Date("2027-07-31T14:00:00+02:00"),
      shortDescription: "Open Air in Bruckberg — Sommer, Hits und Live-Feeling ab 16:00 Uhr.",
      description:
        "SCHLAGERfeeling Open Air am Landgasthof Hutzenthaler in Bruckberg. Mit dabei u. a. Anni Perka, Joelina Drews, Tammy und Mitch Keller. Weitere Acts folgen. Beginn 16:00 Uhr.",
      coverImageUrl: "https://images.unsplash.com/photo-1459749411175-047513050fa9?w=1600&q=80",
      visibleFrom: new Date(),
      presaleStartsAt: new Date(),
      trackingReviewedAt: new Date(),
      trackingUseOrgDefaults: true,
    },
  });

  await ensureCategories(openAir.id, tax7.id, [
    { name: "Kategorie 3", priceGrossCents: 5900, capacity: 500, sortOrder: 4, description: "Open Air Kat. 3" },
    { name: "Kategorie 2", priceGrossCents: 6900, capacity: 400, sortOrder: 3, description: "Open Air Kat. 2" },
    { name: "Kategorie 1", priceGrossCents: 7900, capacity: 300, sortOrder: 2, description: "Open Air Kat. 1" },
    { name: "VIP", priceGrossCents: 11900, capacity: 100, sortOrder: 1, description: "VIP Open Air" },
  ]);

  await linkArtists(openAir.id, [
    artistMap["Anni Perka"],
    artistMap["Joelina Drews"],
    artistMap["Tammy"],
    artistMap["Mitch Keller"],
  ]);

  console.log("Seeded Schlagerparadies 2027");
  console.log("  Event:", `/event/${herzen.slug}`);
  console.log("  Event:", `/event/${openAir.slug}`);
  console.log("  Artists:", Object.keys(artistMap).length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
