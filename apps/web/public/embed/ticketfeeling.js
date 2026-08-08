/**
 * Ticketfeeling official embed loader (parent page).
 * Prefer this over a bare iframe so attribution + consent + first-party pixels work.
 *
 * Usage:
 *   <script src="https://…/embed/ticketfeeling.js" async></script>
 *   <div data-ticketfeeling-embed data-src="https://…/embed/event/slug" data-height="720"></div>
 *   // or:
 *   Ticketfeeling.embed({ target: '#shop', src: 'https://…/embed/shop' });
 *   Ticketfeeling.setConsent({ statistics: true, marketing: true });
 */
(function (window, document) {
  "use strict";

  var NS = "Ticketfeeling";
  if (window[NS] && window[NS].__loaded) return;

  var ORIGIN = (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      var src = s.src || "";
      if (src.indexOf("/embed/ticketfeeling.js") !== -1) {
        try {
          return new URL(src).origin;
        } catch (e) {}
      }
    }
    return "";
  })();

  function readQueryAttribution() {
    var q = {};
    try {
      var params = new URLSearchParams(window.location.search);
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "fbclid",
        "msclkid",
        "ttclid",
      ].forEach(function (k) {
        var v = params.get(k);
        if (v) q[k] = v;
      });
    } catch (e) {}
    return q;
  }

  function camelAttr(q) {
    return {
      utmSource: q.utm_source || null,
      utmMedium: q.utm_medium || null,
      utmCampaign: q.utm_campaign || null,
      utmTerm: q.utm_term || null,
      utmContent: q.utm_content || null,
      gclid: q.gclid || null,
      fbclid: q.fbclid || null,
      msclkid: q.msclkid || null,
      ttclid: q.ttclid || null,
      parentUrl: window.location.href,
      referrer: document.referrer || null,
      embedHost: window.location.hostname,
      landingPath: window.location.pathname,
    };
  }

  var consentState = null;
  var frames = [];

  function postToFrames(payload) {
    frames.forEach(function (f) {
      try {
        if (f.contentWindow) {
          f.contentWindow.postMessage(payload, ORIGIN || "*");
        }
      } catch (e) {}
    });
  }

  function readCookie(name) {
    try {
      var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function pushAttribution(iframe) {
    var attr = camelAttr(readQueryAttribution());
    var fbp = readCookie("_fbp");
    var fbc = readCookie("_fbc");
    try {
      iframe.contentWindow.postMessage(
        {
          type: "tf:attribution",
          attribution: attr,
          fbp: fbp,
          fbc: fbc,
          consent: consentState,
        },
        ORIGIN || "*",
      );
    } catch (e) {}
  }

  function onMessage(event) {
    if (ORIGIN && event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "tf:embed-height" && data.height) {
      frames.forEach(function (f) {
        if (f.contentWindow === event.source) {
          var minH = parseInt(f.getAttribute("data-min-height") || "320", 10);
          var maxH = parseInt(f.getAttribute("data-max-height") || "1200", 10);
          var h = Math.min(maxH, Math.max(minH, Number(data.height) || minH));
          f.style.height = h + "px";
        }
      });
      return;
    }

    if (data.type === "tf:tracking-ready") {
      frames.forEach(function (f) {
        if (f.contentWindow === event.source) pushAttribution(f);
      });
      return;
    }

    if (data.type === "tf:track") {
      // Parent-side first-party GA4 / Meta (session stays on organizer domain)
      try {
        if (typeof window.gtag === "function" && data.name) {
          var gparams = { event_id: data.eventId };
          if (data.transactionId) gparams.transaction_id = data.transactionId;
          if (data.valueCents != null) {
            gparams.value = data.valueCents / 100;
            gparams.currency = data.currency || "EUR";
          }
          var gaName = data.name === "purchase" ? "purchase" : data.name;
          window.gtag("event", gaName, gparams);
        }
      } catch (e) {}
      try {
        if (typeof window.fbq === "function") {
          var metaEvent =
            data.metaEvent ||
            (data.name === "purchase"
              ? "Purchase"
              : data.name === "begin_checkout"
                ? "InitiateCheckout"
                : data.name === "add_to_cart"
                  ? "AddToCart"
                  : data.name === "add_payment_info"
                    ? "AddPaymentInfo"
                    : data.name === "event_page_view" || data.name === "ticket_shop_view"
                      ? "ViewContent"
                      : null);
          if (metaEvent) {
            var mparams = data.payload || {};
            if (data.valueCents != null) {
              mparams.value = data.valueCents / 100;
              mparams.currency = data.currency || "EUR";
            }
            if (!mparams.content_type) mparams.content_type = "product";
            window.fbq("track", metaEvent, mparams, { eventID: data.eventId });
          }
        }
      } catch (e) {}
    }
  }

  function createIframe(opts) {
    var src = opts.src;
    if (!src) throw new Error("Ticketfeeling.embed: src required");
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = opts.title || "Tickets";
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allow", "payment *");
    iframe.setAttribute("data-ticketfeeling-frame", "1");
    if (opts.minHeight) iframe.setAttribute("data-min-height", String(opts.minHeight));
    if (opts.maxHeight) iframe.setAttribute("data-max-height", String(opts.maxHeight));
    iframe.style.cssText =
      (opts.widthStyle || "width:100%;max-width:100%;") +
      "height:" +
      (opts.height || 720) +
      "px;border:0;border-radius:16px;display:block;background:transparent;margin:0 auto;";
    iframe.addEventListener("load", function () {
      pushAttribution(iframe);
      if (consentState) {
        try {
          iframe.contentWindow.postMessage(
            {
              type: "tf:consent",
              statistics: !!consentState.statistics,
              marketing: !!consentState.marketing,
              externalMedia: !!consentState.externalMedia,
            },
            ORIGIN || "*",
          );
        } catch (e) {}
      }
    });
    frames.push(iframe);
    return iframe;
  }

  function embed(options) {
    var opts = options || {};
    var target =
      typeof opts.target === "string"
        ? document.querySelector(opts.target)
        : opts.target;
    if (!target) throw new Error("Ticketfeeling.embed: target not found");
    var iframe = createIframe(opts);
    target.innerHTML = "";
    target.appendChild(iframe);
    return iframe;
  }

  function setConsent(partial) {
    consentState = {
      statistics: !!partial.statistics,
      marketing: !!partial.marketing,
      externalMedia:
        partial.externalMedia != null
          ? !!partial.externalMedia
          : !!partial.marketing,
    };
    postToFrames({
      type: "tf:consent",
      statistics: consentState.statistics,
      marketing: consentState.marketing,
      externalMedia: consentState.externalMedia,
    });
  }

  function autoMount() {
    var nodes = document.querySelectorAll("[data-ticketfeeling-embed]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-tf-mounted") === "1") continue;
      el.setAttribute("data-tf-mounted", "1");
      var src = el.getAttribute("data-src") || el.getAttribute("data-ticketfeeling-src");
      if (!src) continue;
      embed({
        target: el,
        src: src,
        title: el.getAttribute("data-title") || "Tickets",
        height: parseInt(el.getAttribute("data-height") || "720", 10),
        minHeight: parseInt(el.getAttribute("data-min-height") || "320", 10),
        maxHeight: parseInt(el.getAttribute("data-max-height") || "1200", 10),
      });
    }
  }

  window.addEventListener("message", onMessage);
  window[NS] = {
    __loaded: true,
    origin: ORIGIN,
    embed: embed,
    setConsent: setConsent,
    getConsent: function () {
      return consentState;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
})(window, document);
