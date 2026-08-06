import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";
import { isScannerOnlyUser } from "@/lib/admin/staff-access";

export default async function KasseLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership) {
    if (await isScannerOnlyUser(session.user.id, membership.organizationId)) {
      redirect("/scanner");
    }
  }

  const boxOfficeOnly = membership
    ? await isBoxOfficeOnlyUser(session.user.id, membership.organizationId)
    : false;

  return (
    <AdminShell email={session.user.email ?? ""} boxOfficeOnly={boxOfficeOnly}>
      {children}
    </AdminShell>
  );
}
