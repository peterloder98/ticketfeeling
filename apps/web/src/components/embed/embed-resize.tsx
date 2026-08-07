"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { EMBED_AUTO_MAX_HEIGHT } from "@/lib/embed/public-url";

/**
 * Posts iframe height to the parent (used when snippet height mode = Automatisch).
 * Soft-capped so host pages stay usable; fixed-height snippets ignore the message.
 */
export function EmbedResizeNotifier() {
  const pathname = usePathname();

  useEffect(() => {
    function publish() {
      if (typeof window === "undefined" || window.parent === window) return;
      const root = document.querySelector<HTMLElement>("[data-embed-root]");
      const scroll = document.querySelector<HTMLElement>("[data-embed-scroll]");
      const header = root?.firstElementChild?.firstElementChild as HTMLElement | null;

      const contentHeight = Math.ceil(
        (header?.offsetHeight ?? 0) + (scroll?.scrollHeight ?? 0) + 4,
      );
      const height = Math.max(320, Math.min(contentHeight, EMBED_AUTO_MAX_HEIGHT));

      try {
        window.parent.postMessage({ type: "tf:embed-height", height }, "*");
      } catch {
        /* ignore */
      }
    }

    publish();
    const root = document.querySelector("[data-embed-root]");
    const scroll = document.querySelector("[data-embed-scroll]");
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => publish()) : null;
    if (root) ro?.observe(root);
    if (scroll) ro?.observe(scroll);
    window.addEventListener("load", publish);
    const id = window.setInterval(publish, 800);
    return () => {
      ro?.disconnect();
      window.removeEventListener("load", publish);
      window.clearInterval(id);
    };
  }, [pathname]);

  return null;
}
