// Tackle theme tokens and palette.
//
// Single source of truth for the sidebar's `--tk-*` design tokens. Component
// CSS reads these via var(--tk-*) and never inlines hex values or references
// var(--vscode-*) for color (font props and HC contrastBorder are excepted).
//
// Palette source: docs/visual-identity.md §2.1 — MAI-derived neutrals
// (stone for light, slate for dark) with orange-450 / cyan-450 accents and
// HC-mapped surfaces using --vscode-contrastBorder for strokes.
//
// The mapper translates the runtime VS Code color theme kind to the
// `data-theme` attribute value placed on `<html>` by the webview entry.

/** Logical theme kind used as the `data-theme` attribute value. */
export type ThemeKind = 'light' | 'dark' | 'hc-dark' | 'hc-light';

// VS Code's `vscode.ColorThemeKind` enum values. Hard-coded so this module
// has no `vscode` runtime dependency and is unit-testable in node.
//   Light = 1, Dark = 2, HighContrast = 3, HighContrastLight = 4
const KIND_LIGHT = 1;
const KIND_DARK = 2;
const KIND_HC = 3;
const KIND_HC_LIGHT = 4;

/**
 * Pure mapper from `vscode.ColorThemeKind` to the `data-theme` attribute
 * value. Unknown / undefined kinds fall back to `'light'` so the sidebar
 * always renders something legible.
 */
export function kindToDataTheme(kind: number | undefined): ThemeKind {
  switch (kind) {
    case KIND_LIGHT:
      return 'light';
    case KIND_DARK:
      return 'dark';
    case KIND_HC:
      return 'hc-dark';
    case KIND_HC_LIGHT:
      return 'hc-light';
    default:
      return 'light';
  }
}

// ── Token palette ──────────────────────────────────────────────────────────
//
// Light (default, `:root`): stone neutrals + orange-450 accent.
// Dark: slate neutrals + cyan-450 accent.
// HC variants: solid surfaces with --vscode-contrastBorder strokes and a
// full-saturation accent; no soft shadow.

export const THEME_CSS = `
:root {
  --tk-bg: #f5f1ea;
  --tk-card-bg: #faf7f1;
  --tk-card-bg-active: #ffffff;
  --tk-card-bg-hover: #efeae1;
  --tk-card-bg-closed: #ece7dd;
  --tk-stroke: #d8d1c2;
  --tk-stroke-muted: #e6e0d2;
  --tk-accent: #d97a32;
  --tk-accent-soft: rgba(217, 122, 50, 0.45);
  --tk-fg: #2a2622;
  --tk-fg-muted: #6b6358;
  --tk-shadow-active: 0 1px 2px rgba(40, 32, 20, 0.08), 0 2px 6px rgba(40, 32, 20, 0.06);
  --tk-description-bg: #efeae1;

  --tk-radius-card: 5px;
  --tk-stroke-width: 1px;
  --tk-pad-card: 4px;
  --tk-gap-card: 3px;

  --tk-dur-hover: 120ms;
  --tk-dur-active: 150ms;
  --tk-dur-detail: 180ms;
  --tk-ease: ease-out;
}

[data-theme="dark"] {
  --tk-bg: #1a1f26;
  --tk-card-bg: #232a33;
  --tk-card-bg-active: #2c3540;
  --tk-card-bg-hover: #2a323c;
  --tk-card-bg-closed: #1f242b;
  --tk-stroke: #38424f;
  --tk-stroke-muted: #2a323c;
  --tk-accent: #4ec0d8;
  --tk-accent-soft: rgba(78, 192, 216, 0.40);
  --tk-fg: #e6ecf2;
  --tk-fg-muted: #93a1b3;
  --tk-shadow-active: 0 1px 2px rgba(0, 0, 0, 0.40), 0 2px 6px rgba(0, 0, 0, 0.30);
  --tk-description-bg: #1d232b;
}

[data-theme="hc-dark"] {
  --tk-bg: #000000;
  --tk-card-bg: #000000;
  --tk-card-bg-active: #000000;
  --tk-card-bg-hover: #0a0a0a;
  --tk-card-bg-closed: #000000;
  --tk-stroke: var(--vscode-contrastBorder, #ffffff);
  --tk-stroke-muted: var(--vscode-contrastBorder, #ffffff);
  --tk-accent: #00e5ff;
  --tk-accent-soft: #00e5ff;
  --tk-fg: #ffffff;
  --tk-fg-muted: #ffffff;
  --tk-shadow-active: none;
  --tk-description-bg: #000000;
}

[data-theme="hc-light"] {
  --tk-bg: #ffffff;
  --tk-card-bg: #ffffff;
  --tk-card-bg-active: #ffffff;
  --tk-card-bg-hover: #f4f4f4;
  --tk-card-bg-closed: #ffffff;
  --tk-stroke: var(--vscode-contrastBorder, #000000);
  --tk-stroke-muted: var(--vscode-contrastBorder, #000000);
  --tk-accent: #b34700;
  --tk-accent-soft: #b34700;
  --tk-fg: #000000;
  --tk-fg-muted: #000000;
  --tk-shadow-active: none;
  --tk-description-bg: #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --tk-dur-hover: 0ms;
    --tk-dur-active: 0ms;
    --tk-dur-detail: 0ms;
  }
}
`;
