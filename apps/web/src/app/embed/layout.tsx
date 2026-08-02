import { BrandLogo } from "@/components/brand-logo";
import { EmbedConsent } from "@/components/embed/embed-consent";
import { EmbedResizeNotifier } from "@/components/embed/embed-resize";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[240px] bg-white text-[#0F2747]">
      <EmbedConsent />
      <div className="border-b border-[#e2e8f0] px-3 py-2">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <BrandLogo href={null} variant="full" className="!w-[88px]" />
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#64748b]">
            Sicherer Ticketshop
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-xl px-3 py-3 text-[#0F2747]">{children}</div>
      <EmbedResizeNotifier />
    </div>
  );
}
