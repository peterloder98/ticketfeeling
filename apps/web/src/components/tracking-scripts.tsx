"use client";

import { useEffect, useState } from "react";
import { readConsent, type ConsentState } from "@/lib/consent";

type Props = {
  ga4MeasurementId?: string | null;
  gtmContainerId?: string | null;
  metaPixelId?: string | null;
  googleAdsId?: string | null;
  enabled?: boolean;
  linkerDomains?: string[];
  eventSlug?: string | null;
  embedMode?: boolean;
};

function ensureScript(id: string, src?: string, inline?: string) {
  if (document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  el.async = true;
  if (src) el.src = src;
  if (inline) el.text = inline;
  document.head.appendChild(el);
}

function injectGa4(input: {
  measurementId: string;
  linkerDomains: string[];
  eventSlug?: string | null;
  embedMode?: boolean;
  googleAdsId?: string | null;
}) {
  ensureScript(
    "tf-gtag-src",
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(input.measurementId)}`,
  );

  const config: Record<string, unknown> = {
    send_page_view: true,
  };
  if (input.linkerDomains.length > 0) {
    config.linker = {
      domains: input.linkerDomains,
      accept_incoming: true,
    };
    config.cookie_flags = "SameSite=None;Secure";
  }
  if (input.eventSlug) config.event_slug = input.eventSlug;
  if (input.embedMode) config.tf_embed = "1";

  const adsLine = input.googleAdsId
    ? `gtag('config', ${JSON.stringify(input.googleAdsId)});`
    : "";

  ensureScript(
    "tf-gtag-init",
    undefined,
    `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = window.gtag || gtag;
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(input.measurementId)}, ${JSON.stringify(config)});
      ${adsLine}
    `,
  );
}

function injectGtm(containerId: string) {
  ensureScript(
    "tf-gtm",
    undefined,
    `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer',${JSON.stringify(containerId)});
    `,
  );
}

function injectMetaPixel(pixelId: string) {
  ensureScript(
    "tf-fbq",
    undefined,
    `
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', ${JSON.stringify(pixelId)});
      fbq('track', 'PageView');
    `,
  );
}

export function TrackingScripts({
  ga4MeasurementId,
  gtmContainerId,
  metaPixelId,
  googleAdsId,
  enabled = true,
  linkerDomains = [],
  eventSlug,
  embedMode = false,
}: Props) {
  const [consent, setConsent] = useState<ConsentState | null>(null);

  useEffect(() => {
    setConsent(readConsent());
    function onConsent(event: Event) {
      const detail = (event as CustomEvent<ConsentState>).detail;
      if (detail) setConsent(detail);
      else setConsent(readConsent());
    }
    window.addEventListener("tf:consent", onConsent);
    window.addEventListener("storage", onConsent);
    return () => {
      window.removeEventListener("tf:consent", onConsent);
      window.removeEventListener("storage", onConsent);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !consent) return;

    if (consent.statistics) {
      if (ga4MeasurementId) {
        injectGa4({
          measurementId: ga4MeasurementId,
          linkerDomains,
          eventSlug,
          embedMode,
          googleAdsId: consent.marketing ? googleAdsId : null,
        });
      }
      if (gtmContainerId) injectGtm(gtmContainerId);
    }
    if (consent.marketing && metaPixelId) {
      injectMetaPixel(metaPixelId);
    }

    if (embedMode && typeof window !== "undefined" && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            type: "tf:tracking-ready",
            embed: true,
            eventSlug: eventSlug ?? null,
            statistics: consent.statistics,
            marketing: consent.marketing,
          },
          "*",
        );
      } catch {
        /* ignore */
      }
    }
  }, [
    enabled,
    consent,
    ga4MeasurementId,
    gtmContainerId,
    metaPixelId,
    googleAdsId,
    linkerDomains,
    eventSlug,
    embedMode,
  ]);

  return null;
}
