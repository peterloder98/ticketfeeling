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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isIframe = request.headers.get("sec-fetch-dest") === "iframe";

  if (isIframe) {
    const embedPath = embedPathForIframe(pathname);
    if (embedPath) {
      const url = request.nextUrl.clone();
      url.pathname = embedPath;
      return applyEmbedFrameHeaders(NextResponse.redirect(url));
    }
  }

  if (pathname.startsWith("/embed")) {
    return applyEmbedFrameHeaders(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/embed/:path*",
    "/warenkorb",
    "/warenkorb/:path*",
    "/checkout",
    "/checkout/:path*",
    "/event/:path*",
    "/tour/:path*",
    "/bestellung/:path*",
    "/shop",
  ],
};
