"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminSubnavActive, type AdminSubNavItem } from "@/lib/admin/nav";

export function AdminSubnav({ items }: { items: readonly AdminSubNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-[var(--tf-line)] pb-4"
      aria-label="Bereich"
    >
      {items.map((item) => {
        const active = isAdminSubnavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
              active
                ? "bg-[rgba(20,184,166,0.14)] text-[var(--tf-teal-hover)]"
                : "bg-[rgba(15,39,71,0.04)] text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.08)] hover:text-[var(--tf-navy)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminHubCards({
  items,
}: {
  items: readonly AdminSubNavItem[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tf-card block !p-5 transition hover:ring-2 hover:ring-[var(--tf-teal)]/40"
        >
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">{item.label}</h2>
          {item.description ? (
            <p className="mt-1.5 text-sm text-[var(--tf-text-secondary)]">{item.description}</p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
