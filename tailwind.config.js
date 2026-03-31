/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E2C070',
          dark: '#A07830',
        },
        dark: {
          base: '#0A0A0A',
          1: '#1C1C1E',
          2: '#2C2C2E',
          3: '#3A3A3C',
        },
        success: '#2A7A2A',
        error: '#E05555',
      },
      fontFamily: {
        bebas: ['Bebas Neue', 'sans-serif'],
        barlow: ['Barlow', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
