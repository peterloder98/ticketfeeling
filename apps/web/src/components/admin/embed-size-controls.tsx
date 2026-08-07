"use client";

import {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_WIDTH,
  EMBED_HEIGHT_MODES,
  EMBED_WIDTH_PRESETS,
  type EmbedHeightMode,
  type EmbedWidthPreset,
} from "@/lib/embed/frame-size";

function SegmentedButton({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-2 text-left transition-colors duration-200 ${
        selected
          ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.1)] text-[var(--tf-navy)]"
          : "border-[var(--tf-line)] bg-white text-[var(--tf-text-secondary)] hover:border-[rgba(20,184,166,0.45)]"
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{hint}</span>
    </button>
  );
}

export function EmbedSizeControls({
  widthPreset,
  heightMode,
  onWidthChange,
  onHeightChange,
}: {
  widthPreset: EmbedWidthPreset;
  heightMode: EmbedHeightMode;
  onWidthChange: (v: EmbedWidthPreset) => void;
  onHeightChange: (v: EmbedHeightMode) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
          Breite
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(EMBED_WIDTH_PRESETS) as EmbedWidthPreset[]).map((key) => (
            <SegmentedButton
              key={key}
              selected={widthPreset === key}
              label={EMBED_WIDTH_PRESETS[key].label}
              hint={EMBED_WIDTH_PRESETS[key].hint}
              onClick={() => onWidthChange(key)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-text-secondary)]">
          Höhe
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(EMBED_HEIGHT_MODES) as EmbedHeightMode[]).map((key) => (
            <SegmentedButton
              key={key}
              selected={heightMode === key}
              label={EMBED_HEIGHT_MODES[key].label}
              hint={EMBED_HEIGHT_MODES[key].hint}
              onClick={() => onHeightChange(key)}
            />
          ))}
        </div>
      </div>
      {widthPreset === DEFAULT_EMBED_WIDTH && heightMode === DEFAULT_EMBED_HEIGHT ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">
          Standard + Fest entspricht der bisherigen Einbindung.
        </p>
      ) : null}
    </div>
  );
}
