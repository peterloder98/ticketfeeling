import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";
import { isScannerOnlyUser } from "@/lib/admin/staff-access";

export default async function KasseLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  const orgId = membership?.organizationId;
  const [scannerOnly, boxOfficeOnly] = orgId
    ? await Promise.all([
        isScannerOnlyUser(session.user.id, orgId),
        isBoxOfficeOnlyUser(session.user.id, orgId),
      ])
    : [false, false];
  if (scannerOnly) redirect("/scanner");

  return (
    <AdminShell email={session.user.email ?? ""} boxOfficeOnly={boxOfficeOnly}>
      {children}
    </AdminShell>
  );
}
