# CSS3 Language Integration

## Overview
CSS3 is the cascading stylesheet language used to configure the custom scrollbars, typography declarations, and core animation keyframes that complement the Tailwind CSS framework.

## Role in Mind Square
* **Font Imports**: Pulls premium typography packages (*Manrope* for reading and *Source Serif 4* for titles) from Google Fonts API.
* **Scrollbar Styling**: Styles customized webkit scrollbars.
* **Keyframe Declarations**: Custom animations for toast popups (`slideUp`), checks, errors, and shake patterns.

## Key Files
* [index.css](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/index.css)

## Example Code Snippet
```css
/* index.css — Keyframe declarations and scrollbar overrides */
@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 99px;
}
```
