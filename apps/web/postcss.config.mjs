import { fileURLToPath } from 'node:url';

// Explicit path: `npm run dev:web` starts Next from the repository root, where Tailwind would
// otherwise look for its config and find none.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
};
