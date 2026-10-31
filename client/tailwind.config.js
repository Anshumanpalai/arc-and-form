/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        ivory: '#FAF9F6',
        cream: '#FAF9F6',
        charcoal: '#171717',
        ink: {
          DEFAULT: '#171717',
          50: '#FAF9F6',
          100: '#F5F4F0',
          200: '#EAE7E0',
          300: '#DCD8CF',
          400: '#C5BFB6',
          500: '#9F988D',
          600: '#77746F',
          700: '#4F4D49',
          800: '#2E2D2B',
          900: '#171717',
        },
        muted: {
          DEFAULT: '#77746F',
          light: '#A6A29B',
          dark: '#4F4D49',
        },
        stone: {
          50: '#FAF9F6',
          100: '#F5F4F0',
          200: '#EAE7E0',
          300: '#DCD8CF',
          400: '#C5BFB6',
          500: '#9F988D',
          600: '#77746F',
          700: '#4F4D49',
          800: '#2E2D2B',
          900: '#171717',
        },
      },
    },
  },
  plugins: [],
};
