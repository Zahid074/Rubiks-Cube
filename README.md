# THE CUBE — 3D Rubik's Cube (Three.js)

A fully interactive, browser-based 3D Rubik's Cube built with **vanilla HTML, CSS, and JavaScript (Three.js)** — no build tools, no npm install, no frameworks.

![Tech](https://img.shields.io/badge/Three.js-r160-black) ![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-yellow) ![No Build Step](https://img.shields.io/badge/Build%20Step-None-green)


## ✨ Features

- **Realistic 3D cube** — rounded plastic-look cubies, correct sticker colors, soft shadows and studio-style lighting.
- **Drag-to-turn controls** — click/tap directly on a cube face and drag to twist that layer. Drag empty space (mouse) or use **two fingers** (touch) to orbit the camera / pinch-zoom.
- **Scramble animation** — a smooth, randomized scramble plays before the timer starts.
- **Live timer** — starts automatically right after the scramble finishes.
- **Move counter** — counts every turn you make.
- **Undo** — step back through your last move.
- **Auto-Solve** — instantly unwinds the cube back to solved by reversing the full move history (not a cheat-detector bypass — it just doesn't count toward your time/best score).
- **Solve detection** — automatically detects a solved cube, stops the timer, and shows a "Solved!" screen with a confetti burst.
- **Best time tracking** — saved locally in your browser via `localStorage`, persists across sessions.
- **Fully responsive** — works on desktop (mouse) and mobile (touch), scales to any screen size.


## 📁 Project structure

rubiks-cube/
├── index.html   # Page structure + UI overlay + Three.js CDN import map
├── style.css    # All styling, layout, responsiveness, animations
└── script.js    # All game logic (Three.js scene, controls, solver, timer)



## 🚀 How to run

This project needs to be served over **http://**, not opened directly as a `file://` path — modern browsers block ES Modules and CDN imports on `file://`.

### Option A — VS Code + Live Server (recommended)
1. Open the project folder in VS Code.
2. Install the **Live Server** extension (if you don't have it).
3. Right-click `index.html` → **"Open with Live Server"**.
4. It opens at something like `http://127.0.0.1:5500/index.html`.

### Option B — Any local server
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .
Then visit `http://localhost:8000` (or whatever port it prints).

> An internet connection is required the first time you load the page, since Three.js and OrbitControls are loaded from a CDN (unpkg.com).


## 🎮 Controls

| Action | Input |
|---|---|
| Turn a layer | Click/tap a cube face and drag |
| Rotate camera view | Mouse: drag empty space · Touch: drag with **2 fingers** |
| Zoom | Mouse: scroll wheel · Touch: pinch with 2 fingers |
| Start game | Double-tap/click the "THE CUBE" screen |
| Undo | ↺ button (bottom toolbar) |
| Re-scramble | 🔀 button (bottom toolbar) |
| Auto-solve | ⚡ button (bottom toolbar) |
| Play again | Double-tap/click the "SOLVED!" screen |


## 🛠️ Tech notes

- **Three.js** (r160) loaded via an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) — no bundler needed.
- **RoundedBoxGeometry** (Three.js addon) for the cubie bodies; colored stickers are separate thin planes parented to each cubie.
- Layer turns are animated by temporarily re-parenting the affected cubies into a pivot `Group`, rotating it, then re-attaching them to the scene with snapped transforms (avoids floating-point drift after many turns).
- Solve detection checks the world-facing normal + color of every sticker — no internal "cube state" array needed.
- Auto-Solve and Undo both work by replaying a full move log in reverse — this is always guaranteed correct since every move the cube has ever made is recorded.


## 📌 Known limitations

- Auto-Solve reverses this session's own move history rather than running a general cube-solving algorithm (like Kociemba's) — it will always work correctly for this app, but couldn't solve a cube state it didn't create itself (e.g. an imported scramble string).
- Best time is stored per-browser (`localStorage`), not synced across devices.
