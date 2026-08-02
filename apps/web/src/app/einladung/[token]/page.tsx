import { notFound } from "next/navigation";
import { getPendingInviteByToken } from "@/lib/commerce/box-office-invite";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;
  const invite = await getPendingInviteByToken(token);
  if (!invite) notFound();
  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <div className="tf-container py-16">
        <p className="text-center text-[var(--danger)]">
          Diese Einladung ist abgelaufen. Bitte fordern Sie eine neue Einladung an.
        </p>
      </div>
    );
  }

  return (
    <div className="tf-container py-12">
      <AcceptInviteForm
        token={token}
        email={invite.email}
        firstName={invite.firstName}
        lastName={invite.lastName}
        eventNames={invite.events.map((e) => e.event.name)}
      />
    </div>
  );
}
