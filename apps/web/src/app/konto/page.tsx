import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { orderStatusLabel } from "@/lib/commerce/channels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Konto" };

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const customers = await prisma.customer.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);

  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } },
    orderBy: { createdAt: "desc" },
    include: {
      tickets: true,
      invoices: { select: { id: true, invoiceNumber: true } },
    },
  });

  return (
    <div className="tf-container py-12">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
        Mein Konto
      </h1>
      <p className="mt-2 text-[var(--muted)]">{session.user.email}</p>

      <div className="mt-8 space-y-3">
        {orders.map((order) => {
          const invoice = order.invoices[0];
          const showInvoice = Boolean(invoice && (order.invoiceRequested || invoice));
          return (
            <Link key={order.id} href={`/konto/bestellung/${order.id}`} className="tf-card block">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-[var(--gold)]">{orderStatusLabel(order.status)}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {formatEuroFromCents(order.grossCents)} · {order.tickets.length} Ticket(s)
                {showInvoice && invoice ? (
                  <> · Rechnung {invoice.invoiceNumber}</>
                ) : order.invoiceRequested ? (
                  <> · Rechnung angefordert</>
                ) : null}
              </p>
            </Link>
          );
        })}
        {orders.length === 0 ? (
          <p className="text-[var(--muted)]">Noch keine Bestellungen.</p>
        ) : null}
      </div>
    </div>
  );
}
