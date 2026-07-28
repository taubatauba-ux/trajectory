/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x-rgb) / <alpha-value>) rather than a plain var(--x) reference —
        // required for Tailwind's opacity-modifier syntax (bg-accent/15, text-ink/60,
        // etc.) to work at all. See index.css's --*-rgb variables and the comment there
        // for why. Plain usage (bg-accent, no modifier) is unaffected: Tailwind
        // substitutes <alpha-value> = 1, which renders identically to the old
        // `var(--accent)` form.
        bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted-rgb) / <alpha-value>)',
        // Plain var() reference, not the rgb(var(--x-rgb) / <alpha-value>) pattern the
        // rest of these use — --hairline is already a complete, fixed rgba() value
        // (§10 defines it as rgba(255,255,255,0.08), not a hex), and is never used
        // with a Tailwind opacity modifier anywhere in the app. See index.css.
        hairline: 'var(--hairline)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-warn': 'rgb(var(--accent-warn-rgb) / <alpha-value>)',
        'tag-icmr': 'rgb(var(--tag-icmr-rgb) / <alpha-value>)',
        'tag-off': 'rgb(var(--tag-off-rgb) / <alpha-value>)',
        'tag-custom': 'rgb(var(--tag-custom-rgb) / <alpha-value>)',
      },
      fontFamily: {
        // Humanist sans for labels/navigation (§10) — system stack, no web font fetch
        // required, which matters for a fully offline-capable app.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Monospace w/ tabular figures for every quantity in the app (§10) — the one
        // non-negotiable signature element. `ui-monospace` picks the platform's native
        // tabular mono (SF Mono / Cascadia / Roboto Mono) with zero extra download.
        mono: [
          'ui-monospace',
          'JetBrains Mono',
          'IBM Plex Mono',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderColor: {
        DEFAULT: 'var(--hairline)',
      },
    },
  },
  plugins: [],
};
