"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { EMBED_FRAME_MAX_HEIGHT } from "@/lib/embed/public-url";

/**
 * Posts iframe height to the parent. Caps at EMBED_FRAME_MAX_HEIGHT so the
 * header stays visible and the embed body scrolls internally.
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
      const viewportCap = Math.min(
        EMBED_FRAME_MAX_HEIGHT,
        Math.round(window.innerHeight * 0.9) || EMBED_FRAME_MAX_HEIGHT,
      );
      const height = Math.max(320, Math.min(contentHeight, viewportCap));

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
