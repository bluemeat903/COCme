import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          950: '#0a0908',
          900: '#141211',
          800: '#1c1a18',
          700: '#2a2622',
          600: '#3a342f',
          500: '#5b534c',
          400: '#8a7f75',
          300: '#b8ac9e',
          200: '#d9cdbf',
          100: '#eee4d8',
          50:  '#f7f0e4',
        },
        rust: {
          700: '#6b2e1c',
          600: '#8b3a23',
          500: '#a84a2d',
        },
      },
    },
  },
  plugins: [],
};
export default config;
