import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PERMISSIONS: { key: string; description: string }[] = [
  { key: "org:read", description: "Organisation lesen" },
  { key: "org:write", description: "Organisation bearbeiten" },
  { key: "bank:read", description: "Bankdaten lesen" },
  { key: "bank:write", description: "Bankdaten schreiben" },
  { key: "legal:read", description: "Rechtstexte lesen" },
  { key: "legal:write", description: "Rechtstexte schreiben" },
  { key: "users:read", description: "Benutzer lesen" },
  { key: "users:write", description: "Benutzer verwalten" },
  { key: "roles:read", description: "Rollen lesen" },
  { key: "roles:write", description: "Rollen verwalten" },
  { key: "artists:read", description: "Künstler lesen" },
  { key: "artists:write", description: "Künstler schreiben" },
  { key: "locations:read", description: "Locations lesen" },
  { key: "locations:write", description: "Locations schreiben" },
  { key: "tours:read", description: "Touren lesen" },
  { key: "tours:write", description: "Touren schreiben" },
  { key: "events:read", description: "Events lesen" },
  { key: "events:write", description: "Events schreiben" },
  { key: "events:publish", description: "Events veröffentlichen" },
  { key: "audit:read", description: "Audit-Log lesen" },
  { key: "support:inbox", description: "Support-Posteingang" },
  { key: "support:knowledge:write", description: "Wissensartikel pflegen" },
  { key: "reports:read", description: "Berichte lesen" },
  { key: "checkin:scan", description: "Tickets am Einlass scannen" },
  { key: "checkin:manual_override", description: "Manueller Einlass-Override" },
  { key: "box_office:sell", description: "Tageskasse verkaufen" },
  { key: "box_office:close", description: "Tageskasse abschließen" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  system_admin: PERMISSIONS.map((p) => p.key),
  organizer_admin: PERMISSIONS.map((p) => p.key).filter((k) => !k.startsWith("platform:")),
  event_manager: [
    "org:read",
    "artists:read",
    "artists:write",
    "locations:read",
    "locations:write",
    "tours:read",
    "tours:write",
    "events:read",
    "events:write",
    "legal:read",
    "support:knowledge:write",
  ],
  accounting: ["org:read", "bank:read", "audit:read", "reports:read"],
  marketing: [
    "org:read",
    "artists:read",
    "artists:write",
    "events:read",
    "events:write",
    "tours:read",
    "tours:write",
    "support:knowledge:write",
    "reports:read",
  ],
  customer_service: [
    "org:read",
    "events:read",
    "artists:read",
    "support:inbox",
    "audit:read",
  ],
  box_office: ["org:read", "events:read", "box_office:sell", "checkin:scan"],
  gate_manager: [
    "org:read",
    "events:read",
    "checkin:scan",
    "checkin:manual_override",
    "reports:read",
  ],
  scanner: ["events:read", "checkin:scan"],
  read_only: ["org:read", "events:read", "artists:read", "reports:read"],
};

async function main() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const permByKey = Object.fromEntries(allPermissions.map((p) => [p.key, p]));

  const publicCompanyAddress = {
    street: "Innere Münchener Str.",
    houseNumber: "36",
    postalCode: "84028",
    city: "Landshut",
    country: "DE",
  };
  const billingCompanyAddress = {
    street: "Konradinstr.",
    houseNumber: "6",
    postalCode: "84032",
    city: "Altdorf",
    country: "DE",
  };

  const orgSettingsData = {
    legalPersonName: "Peter Loder",
    tradeName: "Ticketfeeling",
    brandName: "SCHLAGERfeeling",
    taxOffice: "Finanzamt Landshut (ergänzen)",
    publicCompanyAddress,
    billingCompanyAddress,
  };

  const org = await prisma.organization.upsert({
    where: { slug: "schlagerfeeling" },
    update: { name: "Ticketfeeling", status: "active" },
    create: {
      name: "Ticketfeeling",
      slug: "schlagerfeeling",
      status: "active",
    },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: org.id },
    update: {
      legalName: "Peter Loder",
      legalForm: "Einzelunternehmen",
      contactFirstName: "Peter",
      contactLastName: "Loder",
      street: publicCompanyAddress.street,
      houseNumber: publicCompanyAddress.houseNumber,
      postalCode: publicCompanyAddress.postalCode,
      city: publicCompanyAddress.city,
      country: publicCompanyAddress.country,
      publicCompanyAddress,
      billingCompanyAddress,
      phone: "+49 (wird ergänzt)",
      email: "info@ticketfeeling.de",
      supportEmail: "support@ticketfeeling.de",
      homepage: "https://www.ticketfeeling.de",
      ticketShopDomain: "www.ticketfeeling.de",
      managingDirectors: "Peter Loder",
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Berlin",
      defaultLocale: "de-DE",
      data: orgSettingsData,
    },
    create: {
      organizationId: org.id,
      legalName: "Peter Loder",
      legalForm: "Einzelunternehmen",
      contactFirstName: "Peter",
      contactLastName: "Loder",
      street: publicCompanyAddress.street,
      houseNumber: publicCompanyAddress.houseNumber,
      postalCode: publicCompanyAddress.postalCode,
      city: publicCompanyAddress.city,
      country: publicCompanyAddress.country,
      publicCompanyAddress,
      billingCompanyAddress,
      phone: "+49 (wird ergänzt)",
      email: "info@ticketfeeling.de",
      supportEmail: "support@ticketfeeling.de",
      homepage: "https://www.ticketfeeling.de",
      ticketShopDomain: "www.ticketfeeling.de",
      managingDirectors: "Peter Loder",
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Berlin",
      defaultLocale: "de-DE",
      data: orgSettingsData,
    },
  });

  const roleDefs = [
    { key: "organizer_admin", name: "Veranstalteradministrator", isSystem: true },
    { key: "event_manager", name: "Eventmanager", isSystem: true },
    { key: "accounting", name: "Buchhaltung", isSystem: true },
    { key: "marketing", name: "Marketing", isSystem: true },
    { key: "customer_service", name: "Kundenservice", isSystem: true },
    { key: "box_office", name: "Tageskasse", isSystem: true },
    { key: "gate_manager", name: "Einlassleitung", isSystem: true },
    { key: "scanner", name: "Scannerpersonal", isSystem: true },
    { key: "read_only", name: "Lesender Zugriff", isSystem: true },
  ];

  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) {
    const role = await prisma.role.upsert({
      where: {
        organizationId_key: { organizationId: org.id, key: def.key },
      },
      update: { name: def.name, isSystem: def.isSystem },
      create: {
        organizationId: org.id,
        key: def.key,
        name: def.name,
        isSystem: def.isSystem,
      },
    });
    roles[def.key] = role;

    const keys = ROLE_PERMISSIONS[def.key] ?? [];
    for (const key of keys) {
      const permission = permByKey[key];
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@ticketfeeling.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "TicketfeelingAdmin!2026";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Ticketfeeling Admin",
      passwordHash,
      emailVerified: new Date(),
      status: "active",
    },
    create: {
      email,
      name: "Ticketfeeling Admin",
      passwordHash,
      emailVerified: new Date(),
      status: "active",
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: admin.id },
    },
    update: { status: "active" },
    create: {
      organizationId: org.id,
      userId: admin.id,
      status: "active",
    },
  });

  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: membership.id,
        roleId: roles.organizer_admin.id,
      },
    },
    update: {},
    create: {
      membershipId: membership.id,
      roleId: roles.organizer_admin.id,
    },
  });

  const faq = [
    {
      slug: "tickets-nicht-gefunden",
      title: "Ich finde meine Tickets nicht",
      body: "Wenn du deine Tickets nicht findest, nutze bitte die Funktion „Ticket vergessen“. Wir senden dir bei vorhandener Bestellung einen sicheren Link an die E-Mail-Adresse deiner Bestellung. Prüfe auch Spam-Ordner. Mit Login findest du Tickets jederzeit unter Konto.",
      tags: ["tickets", "email", "hilfe", "konto"],
    },
    {
      slug: "wie-funktioniert-der-kauf",
      title: "Wie funktioniert der Ticketkauf?",
      body: "Wähle ein Event, lege Tickets in den Warenkorb, gehe zur Kasse, prüfe die Bestellübersicht und bestätige mit „Zahlungspflichtig bestellen“. Nach erfolgreicher Zahlung erhältst du Tickets und Rechnung per E-Mail — und siehst sie im Konto.",
      tags: ["kauf", "checkout", "bestellen", "warenkorb"],
    },
    {
      slug: "zahlung",
      title: "Wie kann ich bezahlen?",
      body: "Im Checkout zahlst du online (u. a. Karte, je nach Freischaltung). Der Betrag wird erst mit „zahlungspflichtig bestellen“ fällig. Nach erfolgreicher Zahlung sind Tickets sofort verfügbar.",
      tags: ["zahlung", "bezahlen", "paypal", "karte", "checkout"],
    },
    {
      slug: "meine-tickets",
      title: "Wo sind meine Tickets?",
      body: "Nach dem Login unter „Konto“ siehst du Bestellungen und kannst PDF-Tickets mit QR-Code herunterladen. Ohne Zugang: „Ticket vergessen“ mit der Bestell-E-Mail nutzen.",
      tags: ["tickets", "konto", "pdf", "qr"],
    },
    {
      slug: "einlass",
      title: "Wann ist Einlass?",
      body: "Die Einlasszeiten stehen auf der jeweiligen Eventseite und auf deinem Ticket. VIP-Einlass kann früher beginnen, sofern ausgewiesen.",
      tags: ["einlass", "event", "beginn"],
    },
    {
      slug: "erstattung",
      title: "Kann ich Tickets stornieren oder erstatten lassen?",
      body: "Erstattungen richten sich nach den Ticket-AGB und den Bedingungen des jeweiligen Events. Nutze den Chat für eine Weiterleitung an den Kundenservice — der Bot führt keine Erstattungen selbst durch.",
      tags: ["erstattung", "storno", "widerruf"],
    },
  ];

  for (const article of faq) {
    await prisma.supportKnowledgeArticle.upsert({
      where: {
        organizationId_slug_locale: {
          organizationId: org.id,
          slug: article.slug,
          locale: "de-DE",
        },
      },
      update: {
        title: article.title,
        body: article.body,
        tags: article.tags,
        status: "published",
        visibility: "public",
        publishedAt: new Date(),
      },
      create: {
        organizationId: org.id,
        slug: article.slug,
        title: article.title,
        body: article.body,
        tags: article.tags,
        locale: "de-DE",
        status: "published",
        visibility: "public",
        publishedAt: new Date(),
      },
    });
  }

  const categoryTemplates = [
    { name: "Kat. 3", priceGrossCents: 4500, capacity: 150, maxPerOrder: 10, sortOrder: 0 },
    { name: "Kat. 2", priceGrossCents: 5500, capacity: 120, maxPerOrder: 10, sortOrder: 1 },
    { name: "Kat. 1", priceGrossCents: 6500, capacity: 100, maxPerOrder: 8, sortOrder: 2 },
    {
      name: "VIP",
      priceGrossCents: 9900,
      capacity: 40,
      maxPerOrder: 4,
      sortOrder: 3,
      description: "VIP inkl. bevorzugter Einlass",
    },
  ];
  for (const tpl of categoryTemplates) {
    const existing = await prisma.ticketCategoryTemplate.findFirst({
      where: { organizationId: org.id, name: tpl.name },
    });
    if (!existing) {
      await prisma.ticketCategoryTemplate.create({
        data: { organizationId: org.id, ...tpl },
      });
    }
  }

  const { syncLegalCatalog } = await import("../src/lib/legal/sync-catalog");
  await syncLegalCatalog(org.id, prisma);

  const location = await prisma.location.upsert({
    where: {
      organizationId_slug: { organizationId: org.id, slug: "beispiel-arena" },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "Beispiel Arena",
      slug: "beispiel-arena",
      city: "München",
      postalCode: "80331",
      street: "Musterstraße",
      houseNumber: "1",
      country: "DE",
      maxCapacity: 5000,
      description: "Beispiel-Location für die lokale Entwicklung.",
    },
  });

  let room = await prisma.locationRoom.findFirst({
    where: { locationId: location.id, name: "Hauptsaal" },
  });
  if (!room) {
    room = await prisma.locationRoom.create({
      data: {
        locationId: location.id,
        name: "Hauptsaal",
        maxCapacity: 4500,
      },
    });
  }

  const artist = await prisma.artist.upsert({
    where: {
      organizationId_slug: { organizationId: org.id, slug: "beispiel-kuenstler" },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "Beispiel Künstler",
      slug: "beispiel-kuenstler",
      artistType: "solo",
      genre: "Schlager",
      shortBio: "Beispielkünstler für die lokale Entwicklung.",
      biography: "Ausführliche Biografie folgt.",
      visibility: "published",
      publishedAt: new Date(),
    },
  });

  const eventStarts = new Date("2026-12-12T19:00:00+01:00");
  const event = await prisma.event.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "schlagerfeeling-weihnachtstraum-2026",
      },
    },
    update: {
      status: "presale_active",
      shortDescription: "Vorverkauf aktiv — lokale Demo mit freier Platzwahl.",
      description:
        "Demo-Event mit Ticketverkauf. Zahlung läuft über den Dev-Provider (Webhook), bis Stripe Direct angebunden ist.",
      presaleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
      locationId: location.id,
      roomId: room.id,
    },
    create: {
      organizationId: org.id,
      locationId: location.id,
      roomId: room.id,
      name: "SCHLAGERfeeling Weihnachtstraum",
      subtitle: "Beispieltermin 2026",
      slug: "schlagerfeeling-weihnachtstraum-2026",
      eventType: "concert",
      shortDescription: "Vorverkauf aktiv — lokale Demo mit freier Platzwahl.",
      description:
        "Demo-Event mit Ticketverkauf. Zahlung läuft über den Dev-Provider (Webhook), bis Stripe Direct angebunden ist.",
      status: "presale_active",
      eventStartsAt: eventStarts,
      eventEndsAt: new Date("2026-12-12T22:30:00+01:00"),
      doorsOpenAt: new Date("2026-12-12T17:30:00+01:00"),
      visibleFrom: new Date(),
      presaleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
      coverImageUrl: null,
    },
  });

  await prisma.eventArtist.upsert({
    where: {
      eventId_artistId: { eventId: event.id, artistId: artist.id },
    },
    update: { isHeadliner: true, sortOrder: 1 },
    create: {
      eventId: event.id,
      artistId: artist.id,
      role: "headliner",
      isHeadliner: true,
      sortOrder: 1,
      announced: true,
    },
  });

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

  await prisma.taxRate.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Regel 19%" } },
    update: { rateBps: 1900, active: true },
    create: {
      organizationId: org.id,
      name: "Regel 19%",
      rateBps: 1900,
      isDefaultTicket: false,
      active: true,
    },
  });

  const categories = [
    {
      name: "Kategorie 1",
      description: "Sehr gute Sicht",
      priceGrossCents: 6900,
      capacity: 200,
      sortOrder: 1,
    },
    {
      name: "Kategorie 2",
      description: "Gute Sicht",
      priceGrossCents: 4900,
      capacity: 400,
      sortOrder: 2,
    },
    {
      name: "VIP",
      description: "Früherer Einlass inkl. VIP-Bereich",
      priceGrossCents: 12900,
      capacity: 40,
      sortOrder: 0,
    },
  ];

  for (const cat of categories) {
    const existing = await prisma.eventTicketCategory.findFirst({
      where: { eventId: event.id, name: cat.name },
    });
    const category =
      existing ??
      (await prisma.eventTicketCategory.create({
        data: {
          eventId: event.id,
          taxRateId: tax7.id,
          name: cat.name,
          description: cat.description,
          priceGrossCents: cat.priceGrossCents,
          capacity: cat.capacity,
          safetyReserve: 5,
          maxPerOrder: 8,
          onlineBookable: true,
          freeSeating: true,
          sortOrder: cat.sortOrder,
          status: "active",
          saleStartsAt: new Date("2026-01-01T10:00:00+01:00"),
        },
      }));

    await prisma.inventoryPool.upsert({
      where: {
        categoryId_channel: { categoryId: category.id, channel: "online" },
      },
      update: {
        capacity: Math.max(0, cat.capacity - 5),
      },
      create: {
        eventId: event.id,
        categoryId: category.id,
        channel: "online",
        capacity: Math.max(0, cat.capacity - 5),
        soldQuantity: 0,
        heldQuantity: 0,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorUserId: admin.id,
      action: "seed.completed",
      entityType: "system",
      entityId: org.id,
      after: { message: "Seed with commerce catalog completed" },
    },
  });

  console.log("Seed complete");
  console.log(`  Org:      ${org.name} (${org.slug})`);
  console.log(`  Admin:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Event:    /event/${event.slug}`);
  console.log(`  Shop:     Vorverkauf aktiv (Dev-Zahlung)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
