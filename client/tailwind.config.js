/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // AMR Club BUK Official Palette (docs/AMR_BRANDING.md)
        'amr-navy': {
          DEFAULT: '#1B3A6B',
          50: '#edf3fa',
          100: '#d4e3f4',
          200: '#acc8ea',
          300: '#79a6dc',
          400: '#4b82ca',
          500: '#2e64b2',
          600: '#1B3A6B', // primary
          700: '#162f57',
          800: '#132646',
          900: '#12213a',
          950: '#0b1424',
        },
        'amr-red': {
          DEFAULT: '#D9402C',
          50: '#fdf3f2',
          100: '#fbe4e1',
          200: '#f8ccc6',
          300: '#f1a9a0',
          400: '#e77c6f',
          500: '#D9402C',
          600: '#c3311f',
          700: '#a32617',
          800: '#872216',
          900: '#702118',
        },
        'amr-teal': {
          DEFAULT: '#4FB3C9',
          50: '#f0f9fa',
          100: '#dbf0f4',
          200: '#bce2ea',
          300: '#8dcddb',
          400: '#4FB3C9',
          500: '#3497ad',
          600: '#2c7b91',
          700: '#296577',
          800: '#285462',
          900: '#254753',
        },
        'amr-pale-blue': '#E3F2FA',
        'amr-white': '#FFFFFF',

        // Alias brand tokens for UI components
        navy: {
          50: '#edf3fa',
          100: '#d4e3f4',
          200: '#acc8ea',
          300: '#79a6dc',
          400: '#4b82ca',
          500: '#2e64b2',
          600: '#1B3A6B',
          700: '#162f57',
          800: '#132646',
          900: '#12213a',
          950: '#0b1424',
        },
        // Charcoal for text + neutral surfaces.
        charcoal: {
          50: '#f5f6f6',
          100: '#e6e8e8',
          200: '#cfd3d3',
          300: '#adb3b3',
          400: '#848c8c',
          500: '#697070',
          600: '#5a6060',
          700: '#4c5151',
          800: '#3f4343',
          900: '#2b2e2e',
          950: '#1a1c1c',
        },
        // Subtle gold accent — retained for badges/winner marks.
        gold: {
          50: '#fbf8ef',
          100: '#f4ecd0',
          200: '#e8d79e',
          300: '#dcbf6b',
          400: '#d2a844',
          500: '#c08f2d', // accent
          600: '#a67424',
          700: '#85581f',
          800: '#6f4820',
          900: '#5e3d1f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(16, 24, 40, 0.06), 0 1px 3px 0 rgba(16, 24, 40, 0.10)',
        elevated: '0 4px 6px -1px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
