"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Posts iframe content height to the parent page for auto-resize. */
export function EmbedResizeNotifier() {
  const pathname = usePathname();

  useEffect(() => {
    function publish() {
      if (typeof window === "undefined" || window.parent === window) return;
      const root = document.querySelector<HTMLElement>("[data-embed-root]");
      const height = Math.ceil(
        Math.max(
          root?.scrollHeight ?? 0,
          root?.offsetHeight ?? 0,
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
      );
      if (!height) return;
      try {
        window.parent.postMessage({ type: "tf:embed-height", height }, "*");
      } catch {
        /* ignore */
      }
    }

    publish();
    const root = document.querySelector("[data-embed-root]");
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => publish()) : null;
    if (root) ro?.observe(root);
    ro?.observe(document.documentElement);
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
