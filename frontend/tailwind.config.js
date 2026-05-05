/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        // Matrix terminal palette
        void:    '#050505',
        matrix:  '#00FF41',
        'matrix-dim': '#00CC33',
        'terminal-green': '#0D7377',
        'alert-red':  '#FF2A2A',
        amber:   '#FFAA00',
        grid:    '#1A1A1A',

        // Semantic tokens → matrix green / alert red
        primary:   '#00FF41',
        secondary: '#0D7377',
        accent:    '#00FF41',
        danger:    '#FF2A2A',
        warning:   '#FFAA00',

        // Text tokens
        'text-primary': '#E0E0E0',
        'text-muted':   '#4A4A4A',
        'text-data':    '#00FF41',
        'text-success': '#00FF41',
        'text-danger':  '#FF2A2A',
        'text-warning': '#FFAA00',
      },
      fontFamily: {
        vt323:      ['VT323', 'monospace'],
        jetbrains:  ['JetBrains Mono', 'monospace'],
        plex:       ['IBM Plex Mono', 'monospace'],
        data:       ['Share Tech Mono', 'monospace'],
        // compat shims
        orbitron:   ['JetBrains Mono', 'monospace'],
        inter:      ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        glow:           '0 0 6px rgba(0,255,65,0.7), 0 0 20px rgba(0,255,65,0.3)',
        'glow-danger':  '0 0 6px rgba(255,42,42,0.8), 0 0 20px rgba(255,42,42,0.4)',
        'glow-amber':   '0 0 6px rgba(255,170,0,0.7), 0 0 18px rgba(255,170,0,0.3)',
        'glow-accent':  '0 0 6px rgba(0,255,65,0.7), 0 0 20px rgba(0,255,65,0.3)',
      },
    },
  },
  plugins: [],
}
