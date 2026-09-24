import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  // Relative to this file, not the working directory the dev server was started from.
  content: { relative: true, files: ['./src/**/*.{ts,tsx}'] },
  theme: {
    extend: {
      // Semantic roles from DESIGN.md; values live in globals.css.
      colors: {
        canvas: token('canvas'),
        'surface-1': token('surface-1'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        'border-subtle': token('border-subtle'),
        'text-primary': token('text-primary'),
        'text-secondary': token('text-secondary'),
        'text-muted': token('text-muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        bullish: token('bullish'),
        bearish: token('bearish'),
        warning: token('warning'),
        danger: token('danger'),
        info: token('info'),
      },
      borderRadius: { control: '6px', surface: '8px', overlay: '12px' },
    },
  },
} satisfies Config;
