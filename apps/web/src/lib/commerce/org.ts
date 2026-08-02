import { prisma } from "@/lib/db";

export async function getDefaultOrganization() {
  return prisma.organization.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    include: { settings: true },
  });
}
