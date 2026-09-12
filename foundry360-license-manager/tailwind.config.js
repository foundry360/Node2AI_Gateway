/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        panel: '#ffffff',
        muted: '#64748b',
        line: '#e2e8f0',
        // Text / links / titles (not purple)
        brand: {
          DEFAULT: '#0b3d5c',
          soft: '#e8f1f6',
        },
        // Primary buttons only
        action: {
          DEFAULT: '#8B6FFD',
          accent: '#7458e8',
          soft: 'rgba(139, 111, 253, 0.12)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
