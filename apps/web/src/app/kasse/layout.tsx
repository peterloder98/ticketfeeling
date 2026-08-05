import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";

export default async function KasseLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  const boxOfficeOnly = membership
    ? await isBoxOfficeOnlyUser(session.user.id, membership.organizationId)
    : false;

  return (
    <AdminShell email={session.user.email ?? ""} boxOfficeOnly={boxOfficeOnly}>
      {children}
    </AdminShell>
  );
}
