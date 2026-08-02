import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canInbox = await userHasPermission(session.user.id, membership.organizationId, "support:inbox");
  const canKnowledge = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "support:knowledge:write",
  );

  if (!canInbox && !canKnowledge) {
    return <p className="text-[var(--danger)]">Keine Support-Berechtigung.</p>;
  }

  const [requests, articles, forgotten] = await Promise.all([
    canInbox
      ? prisma.supportRequest.findMany({
          where: { organizationId: membership.organizationId },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.supportKnowledgeArticle.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { updatedAt: "desc" },
    }),
    canInbox
      ? prisma.forgottenTicketRequest.findMany({
          where: { organizationId: membership.organizationId },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">Support</h1>
        <p className="mt-2 text-[var(--muted)]">Chat-Handoffs, FAQ und Ticket-vergessen-Anfragen.</p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.system} />

      {canInbox ? (
        <section>
          <h2 className="text-xl font-semibold">Offene / aktuelle Anfragen</h2>
          <div className="mt-3 space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="tf-card text-sm">
                <p className="font-semibold">
                  {request.subject} · {request.status}
                </p>
                <p className="text-[var(--muted)]">{request.email}</p>
                <p className="mt-2">{request.body}</p>
              </div>
            ))}
            {requests.length === 0 ? <p className="text-[var(--muted)]">Keine Anfragen.</p> : null}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-semibold">Wissensartikel</h2>
        <div className="mt-3 space-y-2">
          {articles.map((article) => (
            <div key={article.id} className="tf-card text-sm">
              <p className="font-semibold">
                {article.title} · {article.status}
              </p>
              <p className="text-[var(--muted)]">{article.slug}</p>
            </div>
          ))}
        </div>
      </section>

      {canInbox ? (
        <section>
          <h2 className="text-xl font-semibold">Ticket vergessen — Anfragen</h2>
          <div className="mt-3 space-y-2">
            {forgotten.map((item) => (
              <div key={item.id} className="tf-card text-sm">
                <p>
                  {item.status} · {item.createdAt.toLocaleString("de-DE")}
                </p>
                <p className="text-[var(--muted)]">
                  E-Mail gehasht/normalisiert gespeichert · Hint: {item.orderNumberHint ?? "—"}
                </p>
              </div>
            ))}
            {forgotten.length === 0 ? <p className="text-[var(--muted)]">Noch keine Anfragen.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
