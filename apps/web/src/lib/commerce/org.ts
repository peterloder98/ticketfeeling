import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

const loadDefaultOrganization = unstable_cache(
  async () =>
    prisma.organization.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
      include: { settings: true },
    }),
  ["default-organization"],
  { revalidate: 60, tags: ["default-organization"] },
);

/** Request-deduped + 60s cross-request cache. */
export const getDefaultOrganization = cache(() => loadDefaultOrganization());
