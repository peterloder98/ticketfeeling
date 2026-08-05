function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

/** Fixed inner + iframe width for all public embeds (px). */
export const EMBED_FRAME_WIDTH = 420;

/** Max iframe height so header stays pinned and body scrolls inside the frame. */
export const EMBED_FRAME_MAX_HEIGHT = 780;

/**
 * Live Ticketfeeling host (Vercel). Change only when the production domain moves
 * (e.g. to ticketfeeling.de) — prefer Env NEXT_PUBLIC_APP_URL then.
 */
export const LIVE_APP_URL = "https://ticketfeeling-web.vercel.app";

function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

/** Absolute http(s) URL suitable for buyer-facing emails / redirects. */
export function isUsablePublicAppUrl(raw: string | undefined | null): boolean {
  const value = raw?.trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname) return false;
    // On Vercel, never emit localhost links (emails / redirects would be dead).
    if (process.env.VERCEL && isLoopbackHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Public site URL for embeds, emails, absolute links.
 * Priority: explicit env → Vercel production URL → LIVE_APP_URL.
 * Never falls back to localhost on Vercel (that broke confirmation-mail links).
 */
export function getPublicAppUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "",
    // Last resort on any Vercel deploy (preview/prod) before hard-coded LIVE.
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];
  for (const candidate of candidates) {
    if (isUsablePublicAppUrl(candidate)) {
      return stripTrailingSlash(candidate!.trim());
    }
  }
  if (!process.env.VERCEL && process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return LIVE_APP_URL;
}

/** Embed iframes always point at the live app (or Env override when domain changes). */
export function getEmbedAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);
  return LIVE_APP_URL;
}

/** @deprecated use getEmbedAppUrl — kept for call sites that awaited request host */
export async function getEmbedAppUrlFromRequest() {
  return getEmbedAppUrl();
}

/**
 * Domains allowed to frame Ticketfeeling embeds.
 * Default: all (`*`) — embeds must work on arbitrary organizer sites.
 * Restrict via Env `EMBED_FRAME_ANCESTORS` (space/comma separated).
 */
export function getEmbedFrameAncestors(): string[] {
  const fromEnv = process.env.EMBED_FRAME_ANCESTORS?.trim();
  if (!fromEnv || fromEnv === "*") return ["*"];
  const list = fromEnv.split(/[\s,]+/).filter(Boolean);
  return list.length > 0 ? list : ["*"];
}

/** GA4 linker / cross-domain tracking hosts. */
export function getTrackingLinkerDomains(): string[] {
  const fromEnv = process.env.TRACKING_LINKER_DOMAINS?.trim();
  if (fromEnv) {
    return fromEnv.split(/[\s,]+/).filter(Boolean);
  }
  return [
    "schlagerfeeling.de",
    "www.schlagerfeeling.de",
    "ticketfeeling.de",
    "www.ticketfeeling.de",
    "ticketfeeling-web.vercel.app",
  ];
}

export function buildEventEmbedSnippet(input: {
  appUrl: string;
  slug: string;
  title?: string;
  minHeight?: number;
}) {
  const src = `${input.appUrl}/embed/event/${encodeURIComponent(input.slug)}`;
  const title = input.title?.trim() || "Tickets";
  const minHeight = input.minHeight ?? 520;
  const maxHeight = EMBED_FRAME_MAX_HEIGHT;
  const w = EMBED_FRAME_WIDTH;
  return `<iframe
  src="${src}"
  title="${title.replace(/"/g, "&quot;")} – Tickets"
  style="width:${w}px;max-width:100%;height:${minHeight}px;max-height:${maxHeight}px;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="payment *"
></iframe>
<script>
(function(){
  function onMsg(e){
    if(!e.data||e.data.type!=="tf:embed-height")return;
    var frames=document.querySelectorAll("iframe");
    for(var i=0;i<frames.length;i++){
      var f=frames[i];
      if(f.src&&f.src.indexOf(${JSON.stringify(`/embed/event/${input.slug}`)})!==-1&&e.data.height){
        f.style.height=Math.min(${maxHeight},Math.max(${minHeight},e.data.height))+"px";
      }
    }
  }
  window.addEventListener("message",onMsg);
})();
</script>`;
}

export function buildShopEmbedSnippet(input: {
  appUrl: string;
  minHeight?: number;
}) {
  const src = `${input.appUrl}/embed/shop`;
  const minHeight = input.minHeight ?? 560;
  const maxHeight = EMBED_FRAME_MAX_HEIGHT;
  const w = EMBED_FRAME_WIDTH;
  return `<iframe
  src="${src}"
  title="Ticketfeeling – Events & Tickets"
  style="width:${w}px;max-width:100%;height:${minHeight}px;max-height:${maxHeight}px;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="payment *"
></iframe>
<script>
(function(){
  function onMsg(e){
    if(!e.data||e.data.type!=="tf:embed-height")return;
    var frames=document.querySelectorAll("iframe");
    for(var i=0;i<frames.length;i++){
      var f=frames[i];
      if(f.src&&f.src.indexOf("/embed/shop")!==-1&&e.data.height){
        f.style.height=Math.min(${maxHeight},Math.max(${minHeight},e.data.height))+"px";
      }
    }
  }
  window.addEventListener("message",onMsg);
})();
</script>`;
}

export function buildEventEmbedSnippetForLive(input: {
  slug: string;
  title?: string;
  minHeight?: number;
}) {
  const appUrl = getEmbedAppUrl();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/event/${encodeURIComponent(input.slug)}`,
    snippet: buildEventEmbedSnippet({ appUrl, ...input }),
  };
}

export function buildShopEmbedSnippetForLive(input?: { minHeight?: number }) {
  const appUrl = getEmbedAppUrl();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/shop`,
    snippet: buildShopEmbedSnippet({ appUrl, ...input }),
  };
}
