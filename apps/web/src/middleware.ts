import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Embed routes are meant to be framed on organizer sites (any domain).
 * Optional Env EMBED_FRAME_ANCESTORS restricts parents (space/comma separated).
 * Unset / "*" → allow all (avoids blank white iframes on partner sites).
 */
function frameAncestorsDirective() {
  const fromEnv = process.env.EMBED_FRAME_ANCESTORS?.trim();
  if (!fromEnv || fromEnv === "*") {
    return "frame-ancestors *";
  }
  const list = fromEnv.split(/[\s,]+/).filter(Boolean);
  if (list.includes("*")) return "frame-ancestors *";
  return `frame-ancestors 'self' ${list.join(" ")}`;
}

/** Keep accidental non-embed shop URLs inside the iframe. */
function embedPathForIframe(pathname: string): string | null {
  if (pathname.startsWith("/embed")) return null;
  if (pathname === "/warenkorb" || pathname.startsWith("/warenkorb/")) {
    return `/embed${pathname}`;
  }
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return `/embed${pathname}`;
  }
  if (pathname.startsWith("/event/")) return `/embed${pathname}`;
  if (pathname.startsWith("/tour/")) return `/embed${pathname}`;
  if (pathname.startsWith("/bestellung/")) return `/embed${pathname}`;
  if (pathname === "/shop") return "/embed/shop";
  return null;
}

function applyEmbedFrameHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", frameAncestorsDirective());
  // Legacy header blocks framing in some browsers even when CSP allows it.
  response.headers.delete("X-Frame-Options");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function clearEmbedCookie(response: NextResponse) {
  response.cookies.set({
    name: "tf_embed",
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isIframe = request.headers.get("sec-fetch-dest") === "iframe";
  const embedShell = request.cookies.get("tf_embed")?.value === "1";

  // Only rewrite shop paths when the request is actually framed.
  // Never use the sticky tf_embed cookie alone — that redirected normal
  // /event/[slug] browsing (and Next Link RSC fetches) into /embed/event/...
  // after any prior embed/admin preview visit.
  if (isIframe) {
    const embedPath = embedPathForIframe(pathname);
    if (embedPath) {
      const url = request.nextUrl.clone();
      url.pathname = embedPath;
      return applyEmbedFrameHeaders(NextResponse.redirect(url));
    }
  }

  if (pathname.startsWith("/embed")) {
    const res = applyEmbedFrameHeaders(NextResponse.next());
    // Top-level /embed preview (admin) must not poison public browsing.
    if (!isIframe && embedShell) clearEmbedCookie(res);
    return res;
  }

  // Drop leftover embed cookie on public top-level traffic.
  if (!isIframe && embedShell) {
    return clearEmbedCookie(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Clear sticky tf_embed on any public navigation (incl. `/`), and keep
     * iframe shop paths remapped. Skip static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/|uploads/|.*\\..*).*)",
  ],
};
