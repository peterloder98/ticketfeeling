/** Shared TF monogram — navy T + teal F, italic slant. Transparent, no plate. */

export const BRAND_NAVY = "#0F2747";
export const BRAND_TEAL = "#14B8A6";
export const BRAND_GOLD = "#D6A642";

/** Mark viewBox size (wide italic monogram). */
export const MARK_VB = { w: 520, h: 220 } as const;

/** Full lockup viewBox (mark + wordmark + tagline). */
export const LOCKUP_VB = { w: 520, h: 360 } as const;

type SvgProps = {
  className?: string;
};

function MarkPaths() {
  return (
    <g transform="translate(10,10) skewX(-12)">
      {/* Navy T — top bar + stem */}
      <path
        fill={BRAND_NAVY}
        d="M20 0
           H255
           a22 22 0 0 1 0 44
           H122
           V190
           a20 20 0 0 1 -40 0
           V44
           H20
           a22 22 0 0 1 0 -44
           Z"
      />
      {/* Teal F — upper wing (close to T bar, pointed tip) */}
      <path
        fill={BRAND_TEAL}
        d="M262 0
           H410
           L472 22
           L410 44
           H262
           a22 22 0 0 1 0 -44
           Z"
      />
      {/* Teal F — lower wing */}
      <path
        fill={BRAND_TEAL}
        d="M262 98
           H372
           L428 120
           L372 142
           H262
           a22 22 0 0 1 0 -44
           Z"
      />
    </g>
  );
}

/** Crisp vector TF mark. */
export function BrandLogoMark({ className }: SvgProps) {
  return (
    <svg
      viewBox={`0 0 ${MARK_VB.w} ${MARK_VB.h}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <MarkPaths />
    </svg>
  );
}

type LockupProps = SvgProps & { title?: string };

/**
 * Full brand lockup: TF mark + Inter wordmark + gold tagline.
 * Wordmark/tagline use the app Inter stack via CSS variable — sharp at any size.
 */
export function BrandLogoLockup({ className, title = "Ticketfeeling" }: LockupProps) {
  return (
    <svg
      viewBox={`0 0 ${LOCKUP_VB.w} ${LOCKUP_VB.h}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g transform="translate(28,4)">
        <MarkPaths />
      </g>

      <text
        x={LOCKUP_VB.w / 2}
        y={268}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-body), Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: "-0.02em",
        }}
      >
        <tspan fill={BRAND_NAVY}>ticket</tspan>
        <tspan fill={BRAND_TEAL}>feeling</tspan>
      </text>

      <text
        x={LOCKUP_VB.w / 2}
        y={318}
        textAnchor="middle"
        fill={BRAND_GOLD}
        style={{
          fontFamily: "var(--font-body), Inter, system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: "0.14em",
        }}
      >
        MEHR ALS EIN TICKET.
      </text>
    </svg>
  );
}
