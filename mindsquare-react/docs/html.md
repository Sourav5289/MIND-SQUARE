# HTML5 Language Integration

## Overview
HTML5 is the structural language that serves as the root entry point for mounting the React virtual DOM tree and setting up initial SEO header titles and metadata.

## Role in Mind Square
* **Root Scaffold**: Provides the main target `<div id="root"></div>` wrapper where Vite compiles and mounts the compiled React bundle.
* **Module Importing**: Registers the React entrypoint script in the body (`src/main.jsx`).
* **SEO Metadata**: Sets descriptive titles, charsets, and responsive viewport sizing values.

## Key Files
* [index.html](file:///Users/souravhm/Desktop/squares/mindsquare-react/index.html)

## Example Code Snippet
```html
<!-- index.html — HTML5 root scaffold entry point -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mind Square Chess Academy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```
