"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HEATMAP_PERIOD_OPTIONS, type HeatmapPeriodKey } from "@/lib/admin/buyer-geo";

export type HeatmapPointProp = {
  lat: number;
  lng: number;
  weight: number;
  city: string | null;
  postalPrefix: string;
};

type LeafletMap = {
  remove: () => void;
  fitBounds: (b: unknown, o?: object) => void;
  setView: (c: [number, number], z: number) => void;
};

type LeafletNs = {
  map: (el: HTMLElement, opts?: object) => LeafletMap & { addLayer: (l: unknown) => void };
  tileLayer: (url: string, opts?: object) => { addTo: (m: unknown) => void };
  circleMarker: (
    latlng: [number, number],
    opts?: object,
  ) => { addTo: (m: unknown) => void; bindPopup: (html: string) => void };
  featureGroup: (layers: unknown[]) => { getBounds: () => unknown };
  latLngBounds: (latlngs: [number, number][]) => unknown;
};

declare global {
  interface Window {
    L?: LeafletNs;
  }
}

function loadLeaflet(): Promise<LeafletNs> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);

  return new Promise((resolve, reject) => {
    const cssId = "leaflet-css-cdn";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.getElementById("leaflet-js-cdn") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet missing"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "leaflet-js-cdn";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("Leaflet missing"));
    };
    script.onerror = () => reject(new Error("Leaflet load failed"));
    document.body.appendChild(script);
  });
}

export function BuyerHeatmap({
  points,
  orderCount,
  withGeo,
  periodKey,
  periodLabel,
  title = "Käufer-Heatmap",
  paramPrefix = "hm",
}: {
  points: HeatmapPointProp[];
  orderCount: number;
  withGeo: number;
  periodKey: HeatmapPeriodKey;
  periodLabel: string;
  title?: string;
  /** Query param prefix to avoid clashes on event page */
  paramPrefix?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const periodParam = `${paramPrefix}Period`;
  const fromParam = `${paramPrefix}From`;
  const toParam = `${paramPrefix}To`;

  const customFrom = searchParams.get(fromParam) ?? "";
  const customTo = searchParams.get(toParam) ?? "";

  function setPeriod(next: HeatmapPeriodKey) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete(periodParam);
    else sp.set(periodParam, next);
    if (next !== "custom") {
      sp.delete(fromParam);
      sp.delete(toParam);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function applyCustom() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(periodParam, "custom");
    if (customFrom) sp.set(fromParam, customFrom);
    else sp.delete(fromParam);
    if (customTo) sp.set(toParam, customTo);
    else sp.delete(toParam);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const center = useMemo((): [number, number] => {
    if (points.length === 0) return [51.16, 10.45];
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return [lat, lng];
  }, [points]);

  useEffect(() => {
    let cancelled = false;
    const el = mapEl.current;
    if (!el) return;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const map = L.map(mapEl.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });
        mapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 12,
        }).addTo(map);

        const markers: unknown[] = [];
        for (const p of points) {
          const radius = Math.min(28, 6 + Math.sqrt(p.weight) * 3);
          const m = L.circleMarker([p.lat, p.lng], {
            radius,
            color: "#0D9488",
            fillColor: "#14B8A6",
            fillOpacity: 0.55,
            weight: 1,
          });
          m.addTo(map);
          const label = [p.city, p.postalPrefix ? `PLZ ${p.postalPrefix}…` : null]
            .filter(Boolean)
            .join(" · ");
          m.bindPopup(
            `<strong>${p.weight}</strong> Ticket${p.weight === 1 ? "" : "s"}${
              label ? `<br/>${label}` : ""
            }`,
          );
          markers.push(m);
        }

        if (points.length > 0) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds(), { padding: [28, 28], maxZoom: 9 });
        } else {
          map.setView(center, 6);
        }
      })
      .catch(() => {
        if (!cancelled) setMapError("Karte konnte nicht geladen werden.");
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points, center]);

  return (
    <section className="tf-card !p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Ungefähre Herkunft nach PLZ ({periodLabel}). Keine Straßenadressen —
            nur Regionen.
          </p>
        </div>
        <p className="text-xs text-[var(--tf-text-secondary)]">
          {withGeo} von {orderCount} Bestellungen mit PLZ
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {HEATMAP_PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPeriod(opt.key)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              periodKey === opt.key
                ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-teal-hover)]"
                : "border-[var(--tf-line)] text-[var(--tf-text-secondary)] hover:border-[var(--tf-teal)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {periodKey === "custom" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--tf-text-secondary)]">
            Von
            <input
              type="date"
              className="tf-input mt-1 block"
              value={customFrom}
              onChange={(e) => {
                const sp = new URLSearchParams(searchParams.toString());
                sp.set(periodParam, "custom");
                if (e.target.value) sp.set(fromParam, e.target.value);
                else sp.delete(fromParam);
                router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
              }}
            />
          </label>
          <label className="text-xs text-[var(--tf-text-secondary)]">
            Bis
            <input
              type="date"
              className="tf-input mt-1 block"
              value={customTo}
              onChange={(e) => {
                const sp = new URLSearchParams(searchParams.toString());
                sp.set(periodParam, "custom");
                if (e.target.value) sp.set(toParam, e.target.value);
                else sp.delete(toParam);
                router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
              }}
            />
          </label>
          <button type="button" className="tf-btn tf-btn-secondary !min-h-10 text-sm" onClick={applyCustom}>
            Anwenden
          </button>
        </div>
      ) : null}

      {mapError ? (
        <p className="mt-4 text-sm text-[var(--danger)]">{mapError}</p>
      ) : (
        <div
          ref={mapEl}
          className="mt-4 h-[320px] w-full overflow-hidden rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.04)]"
        />
      )}
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
          Für diesen Zeitraum liegen keine Bestellungen mit PLZ vor (z. B. Online ohne
          Rechnungsadresse).
        </p>
      ) : null}
    </section>
  );
}
