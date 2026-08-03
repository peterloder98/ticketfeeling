import { BrandLogo } from "@/components/brand-logo";
import { EmbedConsent } from "@/components/embed/embed-consent";
import { EmbedResizeNotifier } from "@/components/embed/embed-resize";
import { EmbedCartBar } from "@/components/embed/embed-cart-bar";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { EmbedStayInFrame } from "@/components/embed/embed-stay-in-frame";
import { EMBED_FRAME_WIDTH, EMBED_FRAME_MAX_HEIGHT } from "@/lib/embed/public-url";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          background: transparent !important;
          background-image: none !important;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }
        body.tf-page-wash {
          background: transparent !important;
        }
        body > main {
          padding-bottom: 0 !important;
          height: 100%;
          max-height: 100%;
          overflow: hidden;
        }
      `}</style>
      <div
        data-embed-root
        className="mx-auto flex flex-col overflow-hidden bg-transparent text-[#0F2747]"
        style={{
          width: EMBED_FRAME_WIDTH,
          maxWidth: "100%",
          height: "100%",
          maxHeight: EMBED_FRAME_MAX_HEIGHT,
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_8px_28px_rgba(15,39,71,0.08)]">
          <div className="shrink-0 border-b border-[#e2e8f0] bg-white">
            <EmbedConsent />
            <div className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <EmbedBackLink variant="header" label="Zurück" fallbackHref="/embed/shop" />
                  <BrandLogo href="/embed/shop" variant="full" className="!w-[72px]" />
                </div>
                <EmbedCartBar />
              </div>
            </div>
          </div>
          <div data-embed-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {children}
          </div>
        </div>
        <EmbedStayInFrame />
        <EmbedResizeNotifier />
      </div>
    </>
  );
}
