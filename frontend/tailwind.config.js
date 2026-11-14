/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  // relative: resolve content globs from this file, not from the current working directory
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        text: token('text'),
        muted: token('text-muted'),
        primary: token('primary'),
        'primary-fg': token('primary-fg'),
        mint: token('mint'),
        warning: token('warning'),
        danger: token('danger'),
        'q-confirmed': token('q-confirmed'),
        'q-estimated': token('q-estimated'),
        'q-unknown': token('q-unknown'),
        'q-simulated': token('q-simulated'),
      },
      borderRadius: { card: '16px' },
      fontFamily: { sans: ['Inter Variable', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
