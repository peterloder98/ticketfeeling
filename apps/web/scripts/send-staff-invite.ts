/**
 * One-off: send a staff invite email via createStaffInvite (production DB + SMTP).
 *
 * Usage:
 *   npx vercel env pull /tmp/tf-prod.env --environment production --yes
 *   set -a && source /tmp/tf-prod.env && set +a
 *   cd apps/web && npx tsx scripts/send-staff-invite.ts \
 *     --email stephan.eschl@web.de --first Stephan --last Eschlberger --role organizer_admin
 */
import { PrismaClient } from "@prisma/client";
import { createStaffInvite } from "../src/lib/admin/staff-invite";

function arg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return fallback;
}

async function main() {
  const email = arg("email");
  const firstName = arg("first");
  const lastName = arg("last");
  const roleKey = (arg("role", "organizer_admin") ?? "organizer_admin") as
    | "organizer_admin"
    | "scanner";

  if (!email || !firstName || !lastName) {
    console.error("Required: --email --first --last [--role organizer_admin|scanner]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — pull Vercel production env first.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const host = (() => {
      try {
        return new URL(process.env.DATABASE_URL!).hostname;
      } catch {
        return "?";
      }
    })();
    console.log(`[invite] DATABASE host=${host} email=${email} role=${roleKey}`);

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!org) throw new Error("No organization found");

    const inviter =
      (await prisma.membership.findFirst({
        where: {
          organizationId: org.id,
          status: "active",
          roles: { some: { role: { key: "organizer_admin" } } },
        },
        select: { userId: true, user: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      })) ??
      (await prisma.membership.findFirst({
        where: { organizationId: org.id, status: "active" },
        select: { userId: true, user: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      }));
    if (!inviter) throw new Error("No active membership to act as inviter");

    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, status: true },
    });
    const pendingInvite = await prisma.staffInvite.findFirst({
      where: {
        organizationId: org.id,
        emailNormalized: email.trim().toLowerCase(),
        status: "pending",
      },
      select: { id: true, expiresAt: true, roleKey: true },
    });

    console.log(
      `[invite] org=${org.name} inviter=${inviter.user.email}` +
        (existingUser ? ` existingUser=yes status=${existingUser.status}` : " existingUser=no") +
        (pendingInvite
          ? ` pendingInvite=yes role=${pendingInvite.roleKey}`
          : " pendingInvite=no"),
    );

    if (pendingInvite) {
      // Expire old pending invite so we can send a fresh one with a new token.
      await prisma.staffInvite.update({
        where: { id: pendingInvite.id },
        data: { status: "expired", token: `expired:${pendingInvite.id}` },
      });
      console.log("[invite] expired previous pending invite");
    }

    const invite = await createStaffInvite({
      organizationId: org.id,
      invitedByUserId: inviter.userId,
      email,
      firstName,
      lastName,
      roleKey,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          inviteId: invite.id,
          email: invite.email,
          firstName: invite.firstName,
          lastName: invite.lastName,
          roleKey: invite.roleKey,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
          acceptPathPrefix: "/einladung/",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[invite] failed", err instanceof Error ? err.message : err);
  process.exit(1);
});
