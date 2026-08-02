function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

/** Fixed inner + iframe width for all public embeds (px). */
export const EMBED_FRAME_WIDTH = 420;

/**
 * Live Ticketfeeling host (Vercel). Change only when the production domain moves
 * (e.g. to ticketfeeling.de) — prefer Env NEXT_PUBLIC_APP_URL then.
 */
export const LIVE_APP_URL = "https://ticketfeeling-web.vercel.app";

/**
 * Public site URL for embeds, emails, absolute links.
 * Priority: NEXT_PUBLIC_APP_URL → LIVE_APP_URL (current Vercel).
 */
export function getPublicAppUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  if (explicit) return stripTrailingSlash(explicit);
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
  const w = EMBED_FRAME_WIDTH;
  return `<iframe
  src="${src}"
  title="${title.replace(/"/g, "&quot;")} – Tickets"
  style="width:${w}px;max-width:100%;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;"
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
        f.style.height=Math.max(${minHeight},e.data.height)+"px";
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
  const w = EMBED_FRAME_WIDTH;
  return `<iframe
  src="${src}"
  title="Ticketfeeling – Events & Tickets"
  style="width:${w}px;max-width:100%;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;"
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
        f.style.height=Math.max(${minHeight},e.data.height)+"px";
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
