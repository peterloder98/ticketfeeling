import type { EmbedHeightMode, EmbedWidthPreset } from "@/lib/embed/frame-size";
import {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_WIDTH,
  EMBED_AUTO_MAX_HEIGHT,
  EMBED_FIXED_HEIGHT_EVENT,
  EMBED_FIXED_HEIGHT_SHOP,
  embedWidthCss,
} from "@/lib/embed/frame-size";

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

export type { EmbedHeightMode, EmbedWidthPreset } from "@/lib/embed/frame-size";
export {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_WIDTH,
  EMBED_AUTO_MAX_HEIGHT,
  EMBED_FIXED_HEIGHT_EVENT,
  EMBED_FIXED_HEIGHT_SHOP,
  EMBED_FRAME_MAX_HEIGHT,
  EMBED_FRAME_WIDTH,
  EMBED_HEIGHT_MODES,
  EMBED_WIDTH_PRESETS,
  embedPreviewWidthClass,
  embedWidthCss,
} from "@/lib/embed/frame-size";

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

function buildEmbedResizeScript(
  matchSrcFragment: string,
  minHeight: number,
  maxHeight: number,
  expectedOrigin: string,
) {
  return `<script>
(function(){
  var expectedOrigin=${JSON.stringify(expectedOrigin)};
  function onMsg(e){
    if(e.origin!==expectedOrigin)return;
    if(!e.data||e.data.type!=="tf:embed-height")return;
    var frames=document.querySelectorAll("iframe");
    for(var i=0;i<frames.length;i++){
      var f=frames[i];
      if(f.src&&f.src.indexOf(${JSON.stringify(matchSrcFragment)})!==-1&&e.data.height){
        f.style.height=Math.min(${maxHeight},Math.max(${minHeight},e.data.height))+"px";
      }
    }
  }
  window.addEventListener("message",onMsg);
})();
</script>`;
}

function buildLoaderSnippet(input: {
  appUrl: string;
  src: string;
  title: string;
  height: number;
}) {
  const loader = `${input.appUrl}/embed/ticketfeeling.js`;
  return `<!-- Ticketfeeling Embed (Meta-Attribution + Auto-Höhe) -->
<script src="${loader}" async></script>
<div
  data-ticketfeeling-embed
  data-src="${input.src}"
  data-title="${input.title.replace(/"/g, "&quot;")}"
  data-height="${input.height}"
  data-min-height="320"
  data-max-height="1200"
></div>
<!-- Consent vom Parent (Cookie-Banner): Ticketfeeling.setConsent({statistics:true,marketing:true}) -->`;
}

function buildIframeSnippet(input: {
  src: string;
  title: string;
  matchSrcFragment: string;
  widthPreset?: EmbedWidthPreset;
  heightMode?: EmbedHeightMode;
  minHeight: number;
  /** Prefer official loader (Meta parent cookies / UTMs). */
  preferLoader?: boolean;
  appUrl?: string;
}) {
  const preferLoader = input.preferLoader !== false;
  if (preferLoader && input.appUrl) {
    return buildLoaderSnippet({
      appUrl: input.appUrl,
      src: input.src,
      title: input.title,
      height: Math.max(input.minHeight, 320),
    });
  }
  const widthPreset = input.widthPreset ?? DEFAULT_EMBED_WIDTH;
  const heightMode = input.heightMode ?? DEFAULT_EMBED_HEIGHT;
  const minHeight = Math.max(input.minHeight, 320);
  const maxHeight = heightMode === "auto" ? EMBED_AUTO_MAX_HEIGHT : minHeight;
  const heightCss =
    heightMode === "auto"
      ? `height:${minHeight}px;min-height:${minHeight}px;max-height:${maxHeight}px;`
      : `height:${minHeight}px;min-height:${minHeight}px;max-height:${minHeight}px;`;
  const widthCss = embedWidthCss(widthPreset);
  const iframe = `<iframe
  src="${input.src}"
  title="${input.title.replace(/"/g, "&quot;")}"
  style="${widthCss}${heightCss}border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="payment *"
></iframe>`;
  if (heightMode !== "auto") return iframe;
  let expectedOrigin = LIVE_APP_URL;
  try {
    expectedOrigin = new URL(input.src).origin;
  } catch {
    /* keep LIVE_APP_URL */
  }
  return `${iframe}
${buildEmbedResizeScript(input.matchSrcFragment, minHeight, maxHeight, expectedOrigin)}`;
}

export function buildEventEmbedSnippet(input: {
  appUrl: string;
  slug: string;
  title?: string;
  minHeight?: number;
  widthPreset?: EmbedWidthPreset;
  heightMode?: EmbedHeightMode;
  preferLoader?: boolean;
}) {
  const src = `${input.appUrl}/embed/event/${encodeURIComponent(input.slug)}`;
  const title = input.title?.trim() || "Tickets";
  return buildIframeSnippet({
    src,
    title: `${title} – Tickets`,
    matchSrcFragment: `/embed/event/${input.slug}`,
    widthPreset: input.widthPreset,
    heightMode: input.heightMode,
    minHeight: input.minHeight ?? EMBED_FIXED_HEIGHT_EVENT,
    preferLoader: input.preferLoader,
    appUrl: input.appUrl,
  });
}

export function buildShopEmbedSnippet(input: {
  appUrl: string;
  minHeight?: number;
  widthPreset?: EmbedWidthPreset;
  heightMode?: EmbedHeightMode;
  preferLoader?: boolean;
}) {
  const src = `${input.appUrl}/embed/shop`;
  return buildIframeSnippet({
    src,
    title: "Ticketfeeling – Events & Tickets",
    matchSrcFragment: "/embed/shop",
    widthPreset: input.widthPreset,
    heightMode: input.heightMode,
    minHeight: input.minHeight ?? EMBED_FIXED_HEIGHT_SHOP,
    preferLoader: input.preferLoader,
    appUrl: input.appUrl,
  });
}

export function buildEventEmbedSnippetForLive(input: {
  slug: string;
  title?: string;
  minHeight?: number;
  widthPreset?: EmbedWidthPreset;
  heightMode?: EmbedHeightMode;
}) {
  const appUrl = getEmbedAppUrl();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/event/${encodeURIComponent(input.slug)}`,
    snippet: buildEventEmbedSnippet({ appUrl, ...input }),
  };
}

export function buildShopEmbedSnippetForLive(input?: {
  minHeight?: number;
  widthPreset?: EmbedWidthPreset;
  heightMode?: EmbedHeightMode;
}) {
  const appUrl = getEmbedAppUrl();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/shop`,
    snippet: buildShopEmbedSnippet({ appUrl, ...input }),
  };
}
