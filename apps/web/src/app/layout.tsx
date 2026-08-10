import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { ConsentBanner } from "@/components/consent-banner";
import { OrgTracking } from "@/components/org-tracking";
import { Providers } from "@/components/providers";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { CartReminder } from "@/components/cart-reminder";
import { HideSiteChrome } from "@/components/hide-site-chrome";
import { SkipOnEmbed } from "@/components/skip-on-embed";
import "./globals.css";

/** DE product + EU Neon: never run SSR in iad1 (cross-Atlantic ≈ multi-second clicks). */
export const preferredRegion = "fra1";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ticketfeeling",
    template: "%s · Ticketfeeling",
  },
  description: "Mehr als ein Ticket. Vorfreude, Erinnerungen und Live-Erlebnisse.",
  icons: {
    icon: [
      { url: "/brand/icon-app-clear.png?v=20260805-tfmark", type: "image/png", sizes: "535x535" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/icon-app-clear.png?v=20260805-tfmark", type: "image/png", sizes: "535x535" }],
    shortcut: "/brand/icon-app-clear.png?v=20260805-tfmark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${inter.variable} tf-page-wash antialiased`}>
        <Providers>
          <HideSiteChrome>
            <SiteHeader />
          </HideSiteChrome>
          <main className="pb-20 md:pb-0">{children}</main>
          <HideSiteChrome>
            <SiteFooter />
            <MobileBottomNav />
            <CartReminder />
            <ChatWidget compact />
          </HideSiteChrome>
          <HideSiteChrome>
            <ConsentBanner />
          </HideSiteChrome>
          <SkipOnEmbed>
            <OrgTracking />
          </SkipOnEmbed>
        </Providers>
      </body>
    </html>
  );
}
