import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
function palette(name: string) {
  const marker = `:root[data-theme='${name}']`;
  const block = css.slice(css.indexOf(marker)).split('{')[1]!.split('}')[0]!;
  return (token: string) => {
    const match = block.match(new RegExp(`--${token}:\\s*([0-9 ]+);`));
    if (!match) throw new Error(`Missing ${name} theme token: ${token}`);
    return match[1]!.trim().split(/\s+/).map(Number);
  };
}
function luminance(rgb: number[]) {
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(a: number[], b: number[]) {
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('shared themes', () => {
  it('uses an explicit valid preference ahead of the system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('falls back to the system for missing or invalid preferences', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('invalid', false)).toBe('light');
  });
  for (const name of ['dark', 'light']) {
    it(`${name} theme keeps primary and secondary text at WCAG AA normal-text contrast`, () => {
      const color = palette(name);
      for (const surface of ['bg', 'surface', 'surface-2']) {
        expect(contrast(color('text'), color(surface))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color('text-muted'), color(surface))).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(color('primary-fg'), color('primary'))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
