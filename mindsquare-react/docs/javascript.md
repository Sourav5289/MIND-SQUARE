# JavaScript (ES6+) Language Integration

## Overview
JavaScript (ES6+) is the primary programming language of this application. It runs the underlying chess logic, minimax evaluations, local database session stores, sound generators, and Web Speech API annotations.

## Role in Mind Square
* **Minimax Game Engine**: Runs depth-2 alpha-beta pruning trees to find optimal moves for the computer opponent.
* **Chess State Rules**: Integrates the `chess.js` validation rules to checkmate, draw, stalemate, or list legal moves.
* **Synthesized Audio Packs**: Generates sounds dynamically (wood, cyber, retro, ASMR) via the browser's Web Audio API oscillators.
* **Local Persistence**: Seeding and caching student profile ELO records inside standard Web LocalStorage.

## Key Files
* [db.js](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/utils/db.js)
* [audio.js](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/utils/audio.js)
* All `.jsx` components (logic handles)

## Example Code Snippet
```javascript
// audio.js — Procedural synthesiser oscillator sound generator
export function playMoveSound(soundPack = 'wood') {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (soundPack === 'wood') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start();
        osc.stop(now + 0.1);
    }
    ...
}
```
