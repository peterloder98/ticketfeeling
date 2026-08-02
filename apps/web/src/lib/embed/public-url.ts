/** Public base URL for embed snippets and absolute links. */
export function getPublicAppUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
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
