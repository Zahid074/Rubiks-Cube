# THE CUBE — 3D Rubik's Cube (Three.js)

A fully interactive 3D Rubik's Cube built with **vanilla HTML, CSS, and JavaScript (Three.js)** — no build tools, no frameworks.

🔗 **Live Demo:** [zahid074.github.io/Rubiks-Cube](https://zahid074.github.io/Rubiks-Cube/)

---

## Features

- Drag any face to turn a layer; drag empty space (mouse) or 2 fingers (touch) to orbit/zoom
- Scramble animation → live timer → auto solve-detection with confetti
- Move counter, Undo, and Auto-Solve buttons
- Best time saved locally (`localStorage`)
- Fully responsive — desktop & mobile

---

## Files

```
index.html   → structure + UI overlay
style.css    → styling & animations
script.js    → Three.js scene, controls, timer, solver logic
```

---

## Run locally

Must be served over `http://`, not opened as `file://` (ES Modules + CDN imports get blocked otherwise).

```bash
python3 -m http.server 8000
# or use VS Code's "Live Server" extension
```

---

## Controls

| Action | Input |
|---|---|
| Turn a layer | Drag a cube face |
| Rotate view | Mouse-drag empty space / 2-finger drag (touch) |
| Zoom | Scroll wheel / pinch |
| Start / Play again | Double-tap the overlay screen |

## Note

Auto-Solve reverses this session's own move history (not a general solving algorithm), so it always works correctly here but doesn't count toward best time.
