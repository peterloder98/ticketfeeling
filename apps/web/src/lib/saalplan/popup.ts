/** postMessage from Saalplan editor popup → opener (wizard / event). */
export const SAALPLAN_DONE_MESSAGE = "tf:saalplan-done" as const;

export type SaalplanDoneMessage = {
  type: typeof SAALPLAN_DONE_MESSAGE;
  planId?: string;
  returnTo?: string;
};

export function isSaalplanDoneMessage(data: unknown): data is SaalplanDoneMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as SaalplanDoneMessage).type === SAALPLAN_DONE_MESSAGE
  );
}

/** Named window so reopen reuses the same editor tab/popup. */
export const SAALPLAN_WINDOW_NAME = "tf-saalplan-editor";

export function buildSaalplanEditorHref(
  planId: string,
  opts: {
    returnTo: string;
    returnLabel: string;
    /** Hide site/admin chrome — default true for wizard/event round-trips. */
    popup?: boolean;
  },
): string {
  const sp = new URLSearchParams();
  sp.set("returnTo", opts.returnTo);
  sp.set("returnLabel", opts.returnLabel);
  if (opts.popup !== false) sp.set("popup", "1");
  return `/admin/saalplan/${planId}?${sp.toString()}`;
}

/** Open geometry editor; keep opener so return can close + focus. */
export function openSaalplanEditorWindow(href: string): Window | null {
  // Do not pass noopener/noreferrer — we need window.opener for close/focus.
  return window.open(href, SAALPLAN_WINDOW_NAME);
}
