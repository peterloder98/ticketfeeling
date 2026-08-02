import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function ScannerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/scanner");
  }

  return (
    <AdminShell email={session.user.email ?? ""} fullBleedMobile>
      {children}
    </AdminShell>
  );
}
