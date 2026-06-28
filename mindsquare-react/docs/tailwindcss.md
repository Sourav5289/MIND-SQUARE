# Tailwind CSS Framework Integration

## Overview
Tailwind CSS is the utility-first CSS framework used to build our styling, custom dark-cyber theme templates, flex/grid alignments, responsive layouts, and interactive component visuals.

## Role in Mind Square
* **Custom Dark Theme**: Extends default themes with cyber-obsidian tokens (`background`, `surface`, `primary`, `secondary`, `outline-variant`).
* **Glassmorphism Templates**: Styles overlay components using backdrop filters, translucent borders, and depth shadows.
* **Responsive Layouts**: Collapses the 80-width sidebar into a hamburger menu on small devices.

## Key Files
* [tailwind.config.js](file:///Users/souravhm/Desktop/squares/mindsquare-react/tailwind.config.js)
* [index.css](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/index.css)

## Example Code Snippet
```javascript
// tailwind.config.js — Cyber theme configuration
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0c0f10',
        surface: '#15191c',
        primary: '#3b82f6',
        secondary: '#e9c176',
        'on-surface': '#f8fafc',
        'on-surface-variant': '#94a3b8',
        'outline-variant': 'rgba(255,255,255,0.08)'
      }
    }
  }
}
```
