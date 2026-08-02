"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, ShoppingCart, Heart, User } from "lucide-react";
import { useCart } from "@/components/cart-context";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/events", label: "Entdecken", icon: Compass },
  { href: "/warenkorb", label: "Warenkorb", icon: ShoppingCart, cart: true },
  { href: "/events", label: "Favoriten", icon: Heart },
  { href: "/konto", label: "Profil", icon: User },
] as const;

/** Mobile bottom navigation — Brand System §15 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/kasse") ||
    pathname.startsWith("/scanner") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/event/")
  ) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--tf-line)] bg-[rgba(248,250,252,0.94)] backdrop-blur-xl md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href === "/warenkorb" && pathname.startsWith("/warenkorb"));
          const Icon = item.icon;
          const isCart = "cart" in item && item.cart;
          return (
            <li key={item.label} className="flex-1">
              <Link
                href={item.href}
                aria-label={
                  isCart
                    ? itemCount > 0
                      ? `Warenkorb, ${itemCount} Artikel`
                      : "Warenkorb, leer"
                    : item.label
                }
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                  active ? "text-[var(--tf-teal)]" : "text-[var(--tf-text-secondary)]"
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  {isCart ? (
                    <span
                      className={`absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none ${
                        itemCount > 0
                          ? "bg-[var(--tf-teal)] text-white"
                          : "bg-[var(--tf-line)] text-[var(--tf-text-secondary)]"
                      }`}
                      aria-hidden
                    >
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
