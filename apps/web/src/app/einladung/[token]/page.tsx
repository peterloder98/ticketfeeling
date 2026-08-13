import { notFound } from "next/navigation";
import { getPendingInviteByToken } from "@/lib/commerce/box-office-invite";
import { getPendingStaffInviteByToken } from "@/lib/admin/staff-invite";
import { staffRoleLabel } from "@/lib/admin/staff-access";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;

  const boxInvite = await getPendingInviteByToken(token);
  if (boxInvite) {
    if (boxInvite.expiresAt.getTime() < Date.now()) {
      return (
        <div className="tf-container py-16">
          <p className="text-center text-[var(--danger)]">
            Diese Einladung ist abgelaufen. Bitte fordere eine neue Einladung an.
          </p>
        </div>
      );
    }

    return (
      <div className="tf-container py-12">
        <AcceptInviteForm
          token={token}
          email={boxInvite.email}
          firstName={boxInvite.firstName}
          lastName={boxInvite.lastName}
          eventNames={boxInvite.events.map((e) => e.event.name)}
          kind="box_office"
        />
      </div>
    );
  }

  const staffInvite = await getPendingStaffInviteByToken(token);
  if (!staffInvite) notFound();

  if (staffInvite.expiresAt.getTime() < Date.now()) {
    return (
      <div className="tf-container py-16">
        <p className="text-center text-[var(--danger)]">
          Diese Einladung ist abgelaufen. Bitte fordere eine neue Einladung an.
        </p>
      </div>
    );
  }

  return (
    <div className="tf-container py-12">
      <AcceptInviteForm
        token={token}
        email={staffInvite.email}
        firstName={staffInvite.firstName}
        lastName={staffInvite.lastName}
        kind="staff"
        roleName={staffRoleLabel(staffInvite.roleKey)}
      />
    </div>
  );
}
