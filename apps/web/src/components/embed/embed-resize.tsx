"use client";

import { useEffect } from "react";

/** Posts iframe content height to the parent page for auto-resize. */
export function EmbedResizeNotifier() {
  useEffect(() => {
    function publish() {
      if (typeof window === "undefined" || window.parent === window) return;
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      try {
        window.parent.postMessage({ type: "tf:embed-height", height }, "*");
      } catch {
        /* ignore */
      }
    }

    publish();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(document.documentElement);
    window.addEventListener("load", publish);
    const id = window.setInterval(publish, 1200);
    return () => {
      ro?.disconnect();
      window.removeEventListener("load", publish);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
