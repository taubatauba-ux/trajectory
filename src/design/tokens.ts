// Design tokens — source of truth: trajectory-app-technical-specification.md §10.
// The actual CSS custom properties live in src/index.css (Tailwind reads them via
// tailwind.config.js). This file exports the same values as plain TS constants for the
// rare case JS needs a token value directly (e.g., an SVG chart fill in History &
// Trends, §9.8) rather than a Tailwind class.

export const colors = {
  bg: '#14171A',
  surface: '#1D2124',
  surfaceRaised: '#262B30',
  ink: '#ECEAE4',
  inkMuted: '#8B9198',
  // A translucent white overlay, not a solid color — §10's own table gives this one as
  // rgba(255,255,255,0.08), not a hex, and unlike the other tokens here it's never used
  // with a Tailwind opacity modifier anywhere in the app (checked directly), so there's
  // no need for the rgb(var(--x-rgb) / <alpha-value>) treatment tailwind.config.js uses
  // for the rest — this is already a complete, fixed value.
  hairline: 'rgba(255, 255, 255, 0.08)',
  accent: '#4E9C89', // on-track / primary
  accentWarn: '#C97B3D', // over target / attention
  // Fixed a color-assignment bug (were cyclically swapped vs spec §10's table) —
  // see the matching comment in index.css for why this isn't just cosmetic.
  tagIcmr: '#C9A24E', // source tag: ICMR/IFCT
  tagOff: '#6B84A6', // source tag: Open Food Facts
  tagCustom: '#8B7EC8', // source tag: custom/recipe
} as const;

export const fonts = {
  sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', SFMono-Regular, Menlo, monospace",
} as const;

// §10: "every quantity in the app" uses tabular-figure monospace — kcal, grams, macro
// counts, weights, dates-as-numbers. Labels/navigation/body copy use the sans stack.
// This isn't enforced by the type system; it's a rule for whoever writes screens (§9) —
// noted here since tokens.ts is the natural place someone looks for "which font do I use".
