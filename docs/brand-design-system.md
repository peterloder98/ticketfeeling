# Ticketfeeling Brand & Design System v1.0

**Quelle der Wahrheit** für UI, Tokens und Komponenten. Keine abweichenden Farbwelten pro Modul.

## Tokens

Definiert in `apps/web/src/app/globals.css`:

| Token | Light | Verwendung |
|---|---|---|
| `--tf-navy` | `#0F2747` | Primär, Typo, Vertrauen |
| `--tf-teal` | `#14B8A6` | Buttons, Links, aktiv |
| `--tf-gold` / `--vip` | `#D6A642` | Nur VIP/Premium |
| `--tf-action-bg` | `#FFF4D6` | Aktions-Badge Fläche |
| `--tf-action-border` | `#F2C96D` | Aktions-Badge Rahmen |
| `--tf-action-accent` | `#B87500` | Ersparnis / Sale-Preis |
| `--tf-action-text` | `#0F2747` | Aktions-Badge Text |
| `--tf-sale` | → `--tf-action-accent` | Legacy-Alias |
| `--tf-availability-*` | cool navy tint | Echte Knappheit (kein Fehler-Rot) |
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
| `BrandLogo` | Full: Mark-Raster `/brand/icon-tf.png` + Inter-Wortmarke (`tone="dark"` für Navy); Mark/App: `/brand/icon-tf.png` |
| `EventCard` | Event-Kachel mit Bild, Datum, Ort, CTA |
| `PromotionBadge` | Aktion (warm amber) / Status (teal|neutral|VIP) / Availability — Varianten `compact` \| `standard` \| `checkout` |

## Logo-Regeln

- Nur das offizielle Artwork
- Nicht verzerren, nicht umfärben, keine Outline/Schatten/3D
- Web full lockup (`BrandLogo` full): offizielles Mark-Raster `/brand/icon-tf.png` + scharfe Inter-Wortmarke/Tagline (kein JPEG-Lockup — der soft-knockout PNG-Wordmark war unscharf). Auf dunklem Grund: `tone="dark"` (helle Wortmarke, Tagline teal)
- E-Mail-Header: scharfes `/brand/icon-tf.png` (CID + absolute URL) **plus** HTML/CSS-Wortmarke — nie soft `logo-ticketfeeling.png` / `logo-email.png` als Header
- PDF/Ticket-Dokumente: `/brand/logo-ticketfeeling.png` aus `npx tsx scripts/make-logo-master.ts` nur wo Raster-Lockup nötig ist
- Transparenter Hintergrund (soft-knockout der schwarzen Plate)
- Mark/App (Nav/Admin): original Raster (`BrandLogo` mark/app → `/brand/icon-tf.png`), gebaut mit `npx tsx scripts/make-icon-master.ts` — nicht die SVG-Rekonstruktion

## Sprache

Menschlich, nicht bürokratisch. Beispiel: „Geschafft! Deine Tickets sind da.“ statt „Bestellung abgeschlossen“.

## Zielbild

Apple × Airbnb für Live-Events — ruhig, premium, viel Weißraum, große Typo und Bilder.
