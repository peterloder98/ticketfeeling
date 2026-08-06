import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";
import { isScannerOnlyUser } from "@/lib/admin/staff-access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership) {
    const orgId = membership.organizationId;
    if (await isBoxOfficeOnlyUser(session.user.id, orgId)) {
      redirect("/kasse");
    }
    if (await isScannerOnlyUser(session.user.id, orgId)) {
      redirect("/scanner");
    }
  }

  return <AdminShell email={session.user.email ?? ""}>{children}</AdminShell>;
}
