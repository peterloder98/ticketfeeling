import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership) {
    const boxOnly = await isBoxOfficeOnlyUser(
      session.user.id,
      membership.organizationId,
    );
    if (boxOnly) {
      // Vorverkaufsstellen have no admin surface — Tageskasse only.
      redirect("/kasse");
    }
  }

  return <AdminShell email={session.user.email ?? ""}>{children}</AdminShell>;
}
