// Tailwind's `/opacity` class modifier (e.g. `bg-accent/15`) requires the referenced
// color to be a value Tailwind can parse and inject an alpha channel into AT BUILD
// TIME. This project's custom colors (design/tokens.ts, tailwind.config.js) are all
// `var(--token-name)` references pointing at plain hex strings in index.css — verified
// empirically while building this part: `npx vite build` on a probe component using
// `bg-accent/15` silently emits NO rule for that class at all (not a build error, not a
// fallback to full opacity — the utility just doesn't exist in the output CSS). Any
// component in this app using an opacity modifier on a custom color is unstyled there.
// This is a pre-existing property of the token system Part 1 set up, not something
// this part introduced, and worth a future part's attention (a `rgb(var(--x) /
// <alpha-value>)`-style token format is the standard Tailwind fix, but reformatting
// index.css/tailwind.config.js is a shared-file change with its own conflict risk
// while Parts 2-4 build in parallel — see PART5_PROGRESS_REPORT.md).
//
// This screen's fix: do the alpha blending in JS, from the same hex values
// design/tokens.ts already exports (its own comment calls out exactly this use case:
// "the rare case JS needs a token value directly"), and apply via inline `style`
// instead of a className modifier. Stays in sync with tokens.ts automatically — no
// hardcoded/duplicated color values to drift.
const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** '#rrggbb' + alpha in [0,1] → 'rgba(r, g, b, a)'. Throws on a malformed hex input
 * (a typo'd token value should fail loudly, not silently render as invisible/black). */
export function hexToRgba(hex: string, alpha: number): string {
  const match = HEX_PATTERN.exec(hex);
  if (!match) throw new Error(`hexToRgba: expected '#rrggbb', got ${JSON.stringify(hex)}`);
  const int = parseInt(match[1]!, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
