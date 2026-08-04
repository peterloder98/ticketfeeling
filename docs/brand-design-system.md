# Ticketfeeling Brand & Design System v1.0

**Quelle der Wahrheit** für UI, Tokens und Komponenten. Keine abweichenden Farbwelten pro Modul.

## Tokens

Definiert in `apps/web/src/app/globals.css`:

| Token | Light | Verwendung |
|---|---|---|
| `--tf-navy` | `#0F2747` | Primär, Typo, Vertrauen |
| `--tf-teal` | `#14B8A6` | Buttons, Links, aktiv |
| `--tf-gold` / `--vip` | `#D6A642` | Nur VIP/Premium |
| `--tf-bg` | `#F8FAFC` | Seite |
| `--tf-card` | `#FFFFFF` | Cards |
| `--tf-text` | `#0B1421` | Fließtext |
| `--tf-text-secondary` | `#64748B` | Meta |

Dark Mode: `html.dark` (eigene Surfaces, kein Invert).

## Typografie

Nur **Inter** (`next/font`). Weights: 400 / 500 / 600 / 700.

## Komponenten

| Klasse / Component | Zweck |
|---|---|
| `.tf-btn-primary` | Türkis, weiß, min 48px |
| `.tf-btn-secondary` | Weiß, Navy-Border |
| `.tf-card` | Weiß, Soft Shadow, Radius 20 |
| `.tf-input` | Radius 14, großer Touch |
| `BrandLogo` | Offizielles Lockup (SVG: `BrandLogoLockup` / `/brand/logo-ticketfeeling.svg`) |
| `EventCard` | Event-Kachel mit Bild, Datum, Ort, CTA |

## Logo-Regeln

- Nur das offizielle Artwork
- Nicht verzerren, nicht umfärben, keine Outline/Schatten/3D
- Web: Vektor-Lockup (`BrandLogo` → SVG), Quelle `apps/web/public/brand/logo-ticketfeeling.svg`
- E-Mail/PDF: hochaufgelöste PNGs aus dem SVG (`npx tsx scripts/render-brand-logos.ts`)
- Transparenter Hintergrund — keine schwarze Plate, kein JPEG-Knockout
- Mark/App: `icon-mark.svg` / `BrandLogoMark` (nicht die alten ChatGPT-Raster)

## Sprache

Menschlich, nicht bürokratisch. Beispiel: „Geschafft! Deine Tickets sind da.“ statt „Bestellung abgeschlossen“.

## Zielbild

Apple × Airbnb für Live-Events — ruhig, premium, viel Weißraum, große Typo und Bilder.
