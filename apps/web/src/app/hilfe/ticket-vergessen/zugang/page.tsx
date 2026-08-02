import Link from "next/link";
import { resolveRecoveryToken } from "@/lib/support/forgotten-ticket";
import { formatEuroFromCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket-Zugang" };

type Props = { searchParams: Promise<{ token?: string }> };

export default async function RecoveryAccessPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="tf-container py-12">
        <p className="text-[var(--muted)]">Ungültiger oder fehlender Link.</p>
      </div>
    );
  }

  const customer = await resolveRecoveryToken(token);
  if (!customer) {
    return (
      <div className="tf-container py-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          Link ungültig
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Der Zugangslink ist abgelaufen oder wurde bereits verwendet. Bitte erneut über „Ticket
          vergessen“ anfordern.
        </p>
        <Link href="/hilfe/ticket-vergessen" className="tf-btn tf-btn-primary mt-6 inline-flex">
          Erneut anfordern
        </Link>
      </div>
    );
  }

  return (
    <div className="tf-container space-y-6 py-12">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
          Deine Tickets
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Einmalzugang für {customer.email}. Dieser Link ist jetzt verbraucht. Für dauerhaften Zugriff
          bitte Konto anlegen/anmelden.
        </p>
        <Link href="/login" className="tf-btn tf-btn-secondary mt-4 inline-flex !py-2 text-sm">
          Zum Login
        </Link>
      </div>

      {customer.orders.map((order) => (
        <section key={order.id} className="tf-card space-y-3 print:break-inside-avoid">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">{order.orderNumber}</p>
            <p className="text-sm text-[var(--muted)]">
              {formatEuroFromCents(order.grossCents)} · {order.invoices[0]?.invoiceNumber ?? "—"}
            </p>
          </div>
          {order.tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-xl border border-[var(--line)] p-3 text-sm">
              <p className="font-semibold">{ticket.ticketNumber}</p>
              <p className="text-[var(--muted)]">
                {ticket.eventNameSnapshot} · {ticket.categorySnapshot}
              </p>
              {ticket.qrTokens[0] ? (
                <div className="mt-3 rounded-xl bg-white p-3 text-black">
                  <p className="text-xs uppercase tracking-wider text-black/60">Scan-Token</p>
                  <p className="mt-1 break-all font-mono text-[11px]">{ticket.qrTokens[0].token}</p>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
