# Three.js 3D WebGL Integration

## Overview
Three.js is the WebGL graphics engine used to render the Chess Arena in 3D. It handles lighting, geometries, materials, camera controls, and mouse/raycasted click listeners.

## Role in Mind Square
* **Procedural Piece Geometries**: Builds 3D geometric meshes (cones, cylinders, spheres, boxes) procedurally for pawns, rooks, knights, bishops, queens, and kings without requiring heavy external asset files.
* **Interactive Raycasting**: Translates mouse cursor coordinates to detect click interactions on specific 3D squares.
* **Skin Shader Materials**: Implements 4 distinct configurations:
  * *Classic Walnut*: Organic wood textures.
  * *Cyber Neon*: Cyberpunk glowing emissive materials.
  * *Refractive Glass*: Thick physical glass transmission.
  * *Precious Gold*: Metallic reflections and mirror finishes.

## Key Files
* [Arena.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/Arena.jsx)

## Example Code Snippet
```javascript
// Arena.jsx — Procedural geometric piece constructor
const createPieceGeometry = (type) => {
    let geom;
    switch (type) {
        case 'p': // Pawn: Cylinder base + Sphere top
            geom = new THREE.CylinderGeometry(0.06, 0.12, 0.28, 12);
            const head = new THREE.SphereGeometry(0.09, 12, 12);
            head.translate(0, 0.2, 0);
            geom.merge(head);
            break;
        ...
    }
    return geom;
};
```
