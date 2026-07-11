/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0d8c80', hover: '#0b7d72', dark: '#0d2235' },
        ink: { 1: '#1c3a4d', 2: '#12303f', 3: '#22384a' },
        body: { 1: '#3f566a', 2: '#5f7689' },
        muted: { 1: '#8094a6', 2: '#9aabbb' },
        line: { 1: '#e7ecf2', 2: '#eef2f6', 3: '#dde5ee' },
        success: { fg: '#0b7d72', bg: '#dff1ef' },
        warning: { fg: '#97600a', bg: '#fbeed6' },
        danger: { fg: '#b42318', bg: '#fbe3e3' },
        info: { fg: '#2257a3', bg: '#e4edfb' },
        progress: { fg: '#5536c9', bg: '#ece8fb' },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", 'system-ui', 'sans-serif'],
        mono: ["'IBM Plex Mono'", 'monospace'],
      },
      borderRadius: { card: '12px', pill: '20px' },
    },
  },
  plugins: [],
};
