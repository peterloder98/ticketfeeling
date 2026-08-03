/**
 * Verifies the admin email-accounts page data path:
 * ensureEmailAccountsMigrated → findMany for the org → UI-shaped props.
 * Run: npx tsx scripts/verify-email-accounts-ui.ts
 */
import { getPrisma, prisma } from "../src/lib/db";
import { ensureEmailAccountsMigrated } from "../src/lib/email/accounts";

async function main() {
  const db = getPrisma();
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    console.error("NO_ORG");
    process.exit(1);
  }

  // Simulate stale-export risk: module prisma must still hit a live client.
  await ensureEmailAccountsMigrated(org.id);
  const accounts = await prisma.organizationEmailAccount.findMany({
    where: { organizationId: org.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const uiProps = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    host: a.host,
    fromEmail: a.fromEmail,
    isDefault: a.isDefault,
    passwordSet: Boolean(a.passwordEnc),
  }));

  const viaGetPrisma = await getPrisma().organizationEmailAccount.count({
    where: { organizationId: org.id },
  });

  console.log(
    JSON.stringify(
      {
        organizationId: org.id,
        organizationName: org.name,
        accountCount: accounts.length,
        countViaGetPrisma: viaGetPrisma,
        wouldPassNonEmptyToManager: accounts.length > 0,
        accounts: uiProps,
      },
      null,
      2,
    ),
  );

  if (accounts.length === 0) {
    const settings = await db.organizationSettings.findUnique({
      where: { organizationId: org.id },
      select: { smtpHost: true, smtpUser: true, smtpPasswordEnc: true },
    });
    console.error(
      "EMPTY_ACCOUNTS",
      settings?.smtpHost && settings.smtpUser && settings.smtpPasswordEnc
        ? "legacy_smtp_present_but_migrate_failed"
        : "no_legacy_smtp",
    );
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => getPrisma().$disconnect());
