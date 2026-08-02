import { BrandLogo } from "@/components/brand-logo";
import { EmbedConsent } from "@/components/embed/embed-consent";
import { EmbedResizeNotifier } from "@/components/embed/embed-resize";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Transparent page chrome so wide parent iframes don’t show a huge white slab */}
      <style>{`
        html, body {
          background: transparent !important;
          background-image: none !important;
        }
        body.tf-page-wash {
          background: transparent !important;
        }
        body > main {
          padding-bottom: 0 !important;
        }
      `}</style>
      <div
        data-embed-root
        className="mx-auto w-full max-w-[400px] bg-transparent px-1 py-1 text-[#0F2747]"
      >
        <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_8px_28px_rgba(15,39,71,0.08)]">
          <EmbedConsent />
          <div className="border-b border-[#e2e8f0] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <BrandLogo href={null} variant="full" className="!w-[72px]" />
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#64748b]">
                Sicherer Ticketshop
              </p>
            </div>
          </div>
          <div className="px-3 py-3">{children}</div>
        </div>
        <EmbedResizeNotifier />
      </div>
    </>
  );
}
