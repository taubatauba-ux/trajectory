import { describe, it, expect } from 'vitest';
import { hexToRgba } from './color';
import { colors } from '../../design/tokens';

describe('hexToRgba', () => {
  it('converts a hex color and alpha to an rgba() string', () => {
    expect(hexToRgba('#4E9C89', 0.15)).toBe('rgba(78, 156, 137, 0.15)');
  });

  it('handles pure black, white, and lowercase hex', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
  });

  it('throws on a malformed hex string rather than silently producing a bad color', () => {
    expect(() => hexToRgba('4E9C89', 0.15)).toThrow(); // missing '#'
    expect(() => hexToRgba('#4E9C8', 0.15)).toThrow(); // too short
    expect(() => hexToRgba('rgb(1,2,3)', 0.15)).toThrow(); // wrong format entirely
  });

  it('works on every actual token color this app uses, not just a hand-picked example', () => {
    // hairline is deliberately excluded: it's a translucent white overlay per §10's own
    // table (rgba(255,255,255,0.08)), not a hex value — see design/tokens.ts's comment
    // on why. Every real hexToRgba call site in the app uses accent/accentWarn/tagOff
    // (checked directly); nothing calls it with hairline.
    const { hairline: _hairline, ...hexColors } = colors;
    for (const hex of Object.values(hexColors)) {
      expect(() => hexToRgba(hex, 0.5)).not.toThrow();
    }
  });
});
