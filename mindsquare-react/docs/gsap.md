# GSAP Animation Platform Integration

## Overview
GSAP (GreenSock Animation Platform) is used to power the high-performance layout transitions, telemetry count animations, and Three.js 3D camera sweeps.

## Role in Mind Square
* **3D Camera Sweeps**: Smoothly glides the Three.js PerspectiveCamera position between White and Black sides when board perspective changes.
* **Telemetry Gauges**: Animates the stroke-dashoffset parameters of the dashboard's circular ELO progress and win speedometer gauges.
* **Animated Value Counters**: Increments progress numbers slowly from zero on component mount for an immersive visual dashboard feedback.

## Key Files
* [Dashboard.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/Dashboard.jsx)
* [Arena.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/Arena.jsx)

## Example Code Snippet
```javascript
// Arena.jsx — GSAP camera glide animation
gsap.to(cameraRef.current.position, {
    x: targetX,
    y: targetY,
    z: targetZ,
    duration: 1.2,
    ease: 'power3.out',
    onUpdate: () => {
        if (controlsRef.current) controlsRef.current.target.set(0, 0, 0);
    }
});
```
