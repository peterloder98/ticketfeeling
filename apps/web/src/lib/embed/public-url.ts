function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

function vercelDeploymentUrl(): string | null {
  const host = process.env.VERCEL_URL?.trim();
  if (!host) return null;
  return stripTrailingSlash(`https://${host}`);
}

/**
 * Canonical public site URL (emails, absolute links).
 * Custom domain when ready via NEXT_PUBLIC_APP_URL; on Vercel without that → deployment URL.
 */
export function getPublicAppUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = vercelDeploymentUrl();
  if (vercel) return vercel;

  return "http://localhost:3000";
}

/**
 * URL for embed iframes — always the host this request is served from
 * (Vercel preview / production / later eigene Domain). Never a stale Env-Domain.
 */
export async function getEmbedAppUrlFromRequest() {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim();
    if (host) {
      const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const proto =
        (h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https")).split(",")[0]?.trim() ||
        (isLocal ? "http" : "https");
      return stripTrailingSlash(`${proto}://${host}`);
    }
  } catch {
    // non-request context (scripts / build)
  }

  // Same deploy, no request: Vercel URL beats a premature custom-domain env.
  const vercel = vercelDeploymentUrl();
  if (vercel) return vercel;

  return getPublicAppUrl();
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
  return `<iframe
  src="${src}"
  title="${title.replace(/"/g, "&quot;")} – Tickets"
  style="width:100%;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:#fff;"
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
  const minHeight = input.minHeight ?? 640;
  return `<iframe
  src="${src}"
  title="Ticketfeeling – Events & Tickets"
  style="width:100%;min-height:${minHeight}px;border:0;border-radius:16px;display:block;background:#fff;"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="payment *"
></iframe>
<script>
(function(){
  function onMsg(e){
    if(!e.data||e.data.type!=="tf:embed-height")return;
    var f=document.querySelector('iframe[src^="${src}"]');
    if(f&&e.data.height){f.style.height=Math.max(${minHeight},e.data.height)+"px";}
  }
  window.addEventListener("message",onMsg);
})();
</script>`;
}

/** Snippet with live request host baked in (preferred for Admin UI). */
export async function buildEventEmbedSnippetForRequest(input: {
  slug: string;
  title?: string;
  minHeight?: number;
}) {
  const appUrl = await getEmbedAppUrlFromRequest();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/event/${encodeURIComponent(input.slug)}`,
    snippet: buildEventEmbedSnippet({ appUrl, ...input }),
  };
}

export async function buildShopEmbedSnippetForRequest(input?: { minHeight?: number }) {
  const appUrl = await getEmbedAppUrlFromRequest();
  return {
    appUrl,
    previewUrl: `${appUrl}/embed/shop`,
    snippet: buildShopEmbedSnippet({ appUrl, ...input }),
  };
}
