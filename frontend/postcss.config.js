import { fileURLToPath } from 'node:url';

// Absolute path so the build works no matter which directory Vite is started from.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
