import { BrandLogo } from "@/components/brand-logo";
import { EmbedConsent } from "@/components/embed/embed-consent";
import { EmbedResizeNotifier } from "@/components/embed/embed-resize";
import { EmbedCartBar } from "@/components/embed/embed-cart-bar";
import { EmbedHistoryTracker } from "@/components/embed/embed-back-link";
import { EmbedStayInFrame } from "@/components/embed/embed-stay-in-frame";

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
        className="mx-auto flex h-full w-full max-w-full flex-col overflow-hidden bg-transparent text-[#0F2747]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_8px_28px_rgba(15,39,71,0.08)]">
          <div className="shrink-0 border-b border-[#e2e8f0] bg-white">
            <EmbedConsent />
            <div className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <BrandLogo href="/embed/shop" variant="mark" className="!h-7 !w-auto shrink-0" />
                <EmbedCartBar />
              </div>
            </div>
          </div>
          <div data-embed-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {children}
          </div>
        </div>
        <EmbedHistoryTracker />
        <EmbedStayInFrame />
        <EmbedResizeNotifier />
      </div>
    </>
  );
}
