"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Map main-site shop paths onto their /embed equivalents. */
export function mapPathToEmbed(pathname: string): string | null {
  if (!pathname || pathname.startsWith("/embed")) return null;
  if (pathname === "/warenkorb" || pathname.startsWith("/warenkorb/")) {
    return `/embed${pathname}`;
  }
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return `/embed${pathname}`;
  }
  if (pathname.startsWith("/event/")) return `/embed${pathname}`;
  if (pathname.startsWith("/tour/")) return `/embed${pathname}`;
  if (pathname.startsWith("/bestellung/")) return `/embed${pathname}`;
  if (pathname.startsWith("/ticket/")) return `/embed${pathname}`;
  if (pathname === "/shop" || pathname.startsWith("/shop/")) {
    return pathname === "/shop" ? "/embed/shop" : `/embed${pathname}`;
  }
  return null;
}

/**
 * Hard-guarantee: shop navigation stays inside the iframe.
 * Rewrites accidental /warenkorb|/checkout links and strips target=_top/_parent.
 */
export function EmbedStayInFrame() {
  const router = useRouter();

  useEffect(() => {
    try {
      // Same-origin navigations inside the iframe; Lax is enough to keep /tour → /embed/tour.
      document.cookie = "tf_embed=1; Path=/; SameSite=Lax; Max-Age=86400";
    } catch {
      /* ignore */
    }

    function rewrite(anchor: HTMLAnchorElement) {
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
        return null;
      }
      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin) return null;

      const mapped = mapPathToEmbed(url.pathname);
      if (!mapped) {
        // Legal / privacy may leave the shop — open in a new tab, never break the iframe shell.
        if (anchor.target === "_top" || anchor.target === "_parent") {
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
        }
        return null;
      }

      const next = `${mapped}${url.search}${url.hash}`;
      if (anchor.target === "_top" || anchor.target === "_parent" || anchor.target === "_blank") {
        anchor.removeAttribute("target");
        anchor.rel = "";
      }
      if (anchor.getAttribute("href") !== next) {
        anchor.setAttribute("href", next);
      }
      return next;
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;

      const next = rewrite(anchor);
      if (!next) return;

      // Ensure client navigation stays in this frame (never top).
      event.preventDefault();
      router.push(next);
    }

    // Catch anchors added later (just-added cart links, etc.)
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
