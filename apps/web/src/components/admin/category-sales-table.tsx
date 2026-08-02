import { formatEuroFromCents } from "@/lib/money";
import type { CategorySalesRow } from "@/lib/commerce/event-sales-report";

export function CategorySalesTable({ rows }: { rows: CategorySalesRow[] }) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.capacity += row.capacity;
      acc.onlineSold += row.onlineSold;
      acc.boxOfficeSold += row.boxOfficeSold;
      acc.totalSold += row.totalSold;
      acc.revenueCents += row.revenueCents;
      return acc;
    },
    { capacity: 0, onlineSold: 0, boxOfficeSold: 0, totalSold: 0, revenueCents: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--tf-line)] bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--tf-line)] text-left text-[var(--tf-navy)]">
            <th className="px-4 py-3 font-semibold">Ticket</th>
            <th className="px-4 py-3 text-right font-semibold">Kontingent</th>
            <th className="px-4 py-3 text-right font-semibold">Shop</th>
            <th className="px-4 py-3 text-right font-semibold">Tageskasse</th>
            <th className="px-4 py-3 text-right font-semibold">Gesamt</th>
            <th className="px-4 py-3 text-right font-semibold">Umsatz</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.categoryId} className="border-b border-[var(--tf-line)] last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-[var(--tf-teal-hover)]">{row.name}</p>
                <p className="text-xs text-[var(--tf-text-secondary)]">
                  {formatEuroFromCents(row.priceGrossCents)} · noch {row.remaining} frei
                </p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.capacity}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.onlineSold}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.boxOfficeSold}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{row.totalSold}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatEuroFromCents(row.revenueCents)}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-[var(--tf-text-secondary)]">
                Noch keine Kategorien angelegt.
              </td>
            </tr>
          ) : null}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] font-semibold text-[var(--tf-navy)]">
              <td className="px-4 py-3">Gesamt</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.capacity}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.onlineSold}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.boxOfficeSold}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.totalSold}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatEuroFromCents(totals.revenueCents)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function TicketProgressBar({ sold, capacity }: { sold: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums text-[var(--tf-navy)]">
          {sold} / {capacity}
        </span>
        <span className="text-[var(--tf-text-secondary)]">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--tf-line)]">
        <div
          className="h-full rounded-full bg-[var(--tf-teal)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
