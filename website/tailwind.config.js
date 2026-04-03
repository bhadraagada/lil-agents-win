/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'pixelify': ['"Pixelify Sans"', 'cursive'],
        'silkscreen': ['Silkscreen', 'cursive'],
        'instrument': ['"Instrument Serif"', 'serif'],
        'cormorant': ['"Cormorant Garamond"', 'serif'],
        'dm-serif': ['"DM Serif Display"', 'serif'],
        'rubik-bubbles': ['"Rubik Bubbles"', 'cursive'],
        'londrina': ['"Londrina Solid"', 'cursive'],
        'jetbrains': ['"JetBrains Mono"', 'monospace'],
        'archivo': ['"Archivo Black"', 'sans-serif'],
        'space-mono': ['"Space Mono"', 'monospace'],
        'climate': ['"Climate Crisis"', 'cursive'],
        'syne': ['Syne', 'sans-serif'],
        'bricolage': ['"Bricolage Grotesque"', 'sans-serif'],
        'jakarta': ['"Plus Jakarta Sans"', 'sans-serif'],
        'outfit': ['Outfit', 'sans-serif'],
        'nabla': ['Nabla', 'cursive'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'bounce-slow': 'bounce 2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'flicker': 'flicker 0.15s infinite',
        'orbit': 'orbit 20s linear infinite',
        'twinkle': 'twinkle 3s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.2)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(150px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(150px) rotate(-360deg)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
