import { describe, it, expect } from 'vitest';
import { kindToDataTheme, THEME_CSS } from '../sidebar/theme';

// VS Code's vscode.ColorThemeKind enum values (from the public API):
//   Light = 1, Dark = 2, HighContrast = 3, HighContrastLight = 4
const VSCODE_KIND = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
} as const;

describe('kindToDataTheme', () => {
  it('maps Light → "light"', () => {
    expect(kindToDataTheme(VSCODE_KIND.Light)).toBe('light');
  });

  it('maps Dark → "dark"', () => {
    expect(kindToDataTheme(VSCODE_KIND.Dark)).toBe('dark');
  });

  it('maps HighContrast → "hc-dark"', () => {
    expect(kindToDataTheme(VSCODE_KIND.HighContrast)).toBe('hc-dark');
  });

  it('maps HighContrastLight → "hc-light"', () => {
    expect(kindToDataTheme(VSCODE_KIND.HighContrastLight)).toBe('hc-light');
  });

  it('falls back to "light" for an unknown kind', () => {
    expect(kindToDataTheme(undefined)).toBe('light');
    expect(kindToDataTheme(999 as unknown as number)).toBe('light');
  });
});

describe('THEME_CSS — structural shape', () => {
  const REQUIRED_TOKENS = [
    '--tk-bg',
    '--tk-card-bg',
    '--tk-card-bg-active',
    '--tk-card-bg-hover',
    '--tk-card-bg-closed',
    '--tk-stroke',
    '--tk-stroke-muted',
    '--tk-accent',
    '--tk-accent-soft',
    '--tk-fg',
    '--tk-fg-muted',
    '--tk-shadow-active',
    '--tk-description-bg',
  ] as const;

  it.each(REQUIRED_TOKENS)('declares %s', (token) => {
    expect(THEME_CSS).toContain(token);
  });

  it('contains a :root selector', () => {
    expect(THEME_CSS).toMatch(/:root\s*\{/);
  });

  it.each(['dark', 'hc-dark', 'hc-light'] as const)(
    'contains a [data-theme="%s"] selector',
    (kind) => {
      expect(THEME_CSS).toContain(`[data-theme="${kind}"]`);
    },
  );

  it('contains a @media (prefers-reduced-motion: reduce) block', () => {
    expect(THEME_CSS).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
  });
});
