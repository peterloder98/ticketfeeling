import { PrismaClient } from "@prisma/client";

/** Bump after Prisma schema changes so HMR drops a stale global client. */
const PRISMA_CLIENT_EPOCH = 10;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaEpoch?: number;
};

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function isFreshClient(client: PrismaClient) {
  const c = client as unknown as Record<string, { findMany?: unknown; count?: unknown }>;
  // Detect stale Prisma clients after schema changes (HMR / globalThis cache).
  return (
    typeof c.ticketCategoryTemplate?.findMany === "function" &&
    typeof c.boxOfficeSellerGrant?.findMany === "function" &&
    typeof c.boxOfficeInvite?.findMany === "function" &&
    typeof c.organizationEmailAccount?.count === "function" &&
    typeof c.eventSeat?.findMany === "function" &&
    typeof c.venuePlan?.findMany === "function"
  );
}

export function getPrisma() {
  if (globalForPrisma.prismaEpoch !== PRISMA_CLIENT_EPOCH) {
    if (globalForPrisma.prisma) {
      void globalForPrisma.prisma.$disconnect().catch(() => undefined);
    }
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaEpoch = PRISMA_CLIENT_EPOCH;
  }

  const existing = globalForPrisma.prisma;
  if (existing && isFreshClient(existing)) return existing;
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrisma();
  if (!isFreshClient(client)) {
    throw new Error(
      "Prisma Client fehlt OrganizationEmailAccount — bitte `npx prisma generate` und Dev-Server neu starten.",
    );
  }
  // Always pin — avoids opening a new pool per serverless isolate / HMR churn.
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrisma();
