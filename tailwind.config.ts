// tailwind.config.ts — Tailwind без shadcn (ТЗ §2). Цвета из §30.
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        secondary: '#f5f5f5',
        text: '#1a1a1a',
        muted: '#666666',
        border: '#e5e5e5',
        danger: '#dc2626',
        success: '#16a34a',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
