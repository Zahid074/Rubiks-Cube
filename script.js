/* ============================================================================
   THE CUBE — a 3D Rubik's Cube built with Three.js
   ----------------------------------------------------------------------------
   Structure of this file:
     1.  Config & constants
     2.  Scene / camera / renderer / lights / controls setup
     3.  Cube construction (cubie groups + colored "sticker" meshes)
     4.  Pointer interaction (raycasting) -> layer drag vs. camera orbit
     5.  Layer rotation engine (pivot re-parenting + tween)
     6.  Scramble sequence
     7.  Solve detection
     8.  Timer, move counter, best-time persistence (localStorage) & UI wiring
       - incl. Undo and Auto-Solve (move-log reversal) in section 5
     9.  Confetti celebration effect
     10. Render loop / resize handling
   ==========================================================================*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ============================================================================
   1. CONFIG & CONSTANTS
   ==========================================================================*/

const CUBIE_SIZE   = 1;                 // size of a single cubie
const GAP          = 0.06;              // gap between cubies
const OFFSET       = CUBIE_SIZE + GAP;  // distance between cubie centers
const DRAG_THRESHOLD = 8;               // px of movement before a drag "commits" to a layer turn
const SCRAMBLE_MOVE_COUNT = 22;
const SCRAMBLE_DURATION   = 130;        // ms per scramble move
const USER_MOVE_DURATION  = 220;        // ms per user-driven move
const BEST_TIME_KEY = 'cube_best_time_ms';

// Standard Rubik's cube color scheme
const COLORS = {
  right: 0xd6293e, // +X  red
  left:  0xff8a00, // -X  orange
  up:    0xf5f5f5, // +Y  white
  down:  0xffd400, // -Y  yellow
  front: 0x00a651, // +Z  green
  back:  0x1257e0, // -Z  blue
  body:  0x101014, // plastic body
};

/* ============================================================================
   2. SCENE / CAMERA / RENDERER / LIGHTS / CONTROLS
   ==========================================================================*/

const canvas = document.getElementById('cube-canvas');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(4.6, 4.4, 6.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// Orbit controls handle "drag empty space to rotate the view".
// They stay enabled by default; we only disable them while the user
// is actively dragging a cube layer (see pointer handlers below).
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 14;
controls.target.set(0, 0, 0);

// Input scheme:
//  - Mouse:  left-drag on empty space orbits the camera (default).
//  - Touch:  ONE finger is reserved for grabbing & turning a cube layer,
//            so camera orbit + pinch-zoom requires TWO fingers.
controls.touches.ONE = THREE.TOUCH.NONE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.bias = -0.0015;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbcdfff, 0.35);
fillLight.position.set(-6, -2, -5);
scene.add(fillLight);

// Soft shadow-catcher floor (invisible except for the shadow it receives)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -OFFSET * 1.85;
floor.receiveShadow = true;
scene.add(floor);

/* ============================================================================
   3. CUBE CONSTRUCTION
   ==========================================================================*/

const cubies = [];          // array of THREE.Group, one per visible cubie
const raycastTargets = [];  // flat array of meshes (body + stickers) for raycasting

// Shared geometries/materials (cloned per-instance where color must differ)
const bodyGeometry = new RoundedBoxGeometry(
  CUBIE_SIZE * 0.96, CUBIE_SIZE * 0.96, CUBIE_SIZE * 0.96, 4, 0.09
);
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.body,
  roughness: 0.55,
  metalness: 0.15,
});

const stickerGeometry = new THREE.PlaneGeometry(CUBIE_SIZE * 0.80, CUBIE_SIZE * 0.80);

function createSticker(colorHex, localNormal) {
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(stickerGeometry, material);

  // Orient the plane so its local +Z axis points along localNormal,
  // then push it just outside the cubie's surface.
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
  mesh.position.copy(localNormal.clone().multiplyScalar(CUBIE_SIZE / 2 + 0.002));

  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.isSticker = true;
  return mesh;
}

function buildCube() {
  const coords = [-1, 0, 1];

  for (const x of coords) {
    for (const y of coords) {
      for (const z of coords) {
        if (x === 0 && y === 0 && z === 0) continue; // hidden core piece, skip

        const cubie = new THREE.Group();
        cubie.position.set(x * OFFSET, y * OFFSET, z * OFFSET);
        cubie.userData.pos = { x, y, z }; // logical grid position (updates on turns)

        const body = new THREE.Mesh(bodyGeometry, bodyMaterial.clone());
        body.castShadow = true;
        body.receiveShadow = true;
        cubie.add(body);
        raycastTargets.push(body);

        const faceDefs = [
          { cond: x === 1,  normal: new THREE.Vector3(1, 0, 0),  color: COLORS.right },
          { cond: x === -1, normal: new THREE.Vector3(-1, 0, 0), color: COLORS.left  },
          { cond: y === 1,  normal: new THREE.Vector3(0, 1, 0),  color: COLORS.up    },
          { cond: y === -1, normal: new THREE.Vector3(0, -1, 0), color: COLORS.down  },
          { cond: z === 1,  normal: new THREE.Vector3(0, 0, 1),  color: COLORS.front },
          { cond: z === -1, normal: new THREE.Vector3(0, 0, -1), color: COLORS.back  },
        ];

        for (const def of faceDefs) {
          if (!def.cond) continue;
          const sticker = createSticker(def.color, def.normal);
          cubie.add(sticker);
          raycastTargets.push(sticker);
        }

        scene.add(cubie);
        cubies.push(cubie);
      }
    }
  }
}

function destroyCube() {
  for (const cubie of cubies) {
    scene.remove(cubie);
    cubie.traverse((obj) => {
      if (obj.isMesh) {
        obj.material.dispose();
      }
    });
  }
  cubies.length = 0;
  raycastTargets.length = 0;
}

buildCube();

/* ============================================================================
   4. POINTER INTERACTION (raycasting)
   ----------------------------------------------------------------------------
   - Pointer down on a cubie  -> prepare a potential layer drag, disable orbit.
   - Pointer down on empty space -> do nothing special, OrbitControls handles it.
   - Pointer move (once past DRAG_THRESHOLD) -> decide rotation axis + direction
     by comparing the drag vector (screen space) against the two candidate
     in-plane tangent directions of the clicked face, then commit the move.
   ==========================================================================*/

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let dragState = null; // { cubie, normal, startX, startY, active }

function toAxisNormal(vec) {
  // Snap an arbitrary (possibly slightly-off-axis, e.g. from a rounded edge)
  // normal to the nearest pure world axis direction.
  const ax = Math.abs(vec.x), ay = Math.abs(vec.y), az = Math.abs(vec.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(vec.x) || 1, 0, 0);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(vec.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(vec.z) || 1);
}

function worldToScreen(vector3) {
  const v = vector3.clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function findCubieAncestor(object) {
  let obj = object;
  while (obj && !obj.userData.pos) obj = obj.parent;
  return obj;
}

function onPointerDown(event) {
  if (isAnimating || gameState !== 'playing') return;

  pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  const hits = raycaster.intersectObjects(raycastTargets, false);

  if (hits.length > 0) {
    const hit = hits[0];
    const worldNormal = hit.face.normal.clone()
      .transformDirection(hit.object.matrixWorld);

    dragState = {
      cubie: findCubieAncestor(hit.object),
      normal: toAxisNormal(worldNormal),
      startX: event.clientX,
      startY: event.clientY,
      active: true,
    };
    controls.enabled = false; // suppress camera orbit while we might turn a layer
  } else {
    dragState = null; // let OrbitControls rotate the camera
  }
}

function onPointerMove(event) {
  if (!dragState || !dragState.active || isAnimating) return;

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const dist = Math.hypot(dx, dy);
  if (dist < DRAG_THRESHOLD) return;

  const axes = ['x', 'y', 'z'];
  const normalAxis = axes.find((a) => Math.abs(dragState.normal[a]) > 0.5);
  const candidateAxes = axes.filter((a) => a !== normalAxis);

  const cubieWorldPos = new THREE.Vector3();
  dragState.cubie.getWorldPosition(cubieWorldPos);
  const originScreen = worldToScreen(cubieWorldPos);

  let best = null;
  for (const axis of candidateAxes) {
    const axisVec = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0
    );
    // Tangent direction on the clicked face for a +90 deg rotation about `axis`.
    const tangent = axisVec.clone().cross(dragState.normal).normalize();
    const tangentWorldPoint = cubieWorldPos.clone().add(tangent.multiplyScalar(0.5));
    const tangentScreen = worldToScreen(tangentWorldPoint);

    const screenVec = { x: tangentScreen.x - originScreen.x, y: tangentScreen.y - originScreen.y };
    const len = Math.hypot(screenVec.x, screenVec.y) || 1;
    const dot = (screenVec.x * dx + screenVec.y * dy) / len;

    if (!best || Math.abs(dot) > Math.abs(best.dot)) {
      best = { axis, dot };
    }
  }

  const axis = best.axis;
  const direction = best.dot > 0 ? 1 : -1;
  const layerValue = dragState.cubie.userData.pos[axis];

  dragState.active = false; // commit: ignore further move events for this gesture
  performMove(axis, layerValue, direction);
}

function onPointerUp() {
  dragState = null;
  controls.enabled = true;
}

// Use capture:true on pointerdown so our handler runs BEFORE OrbitControls'
// own listener, letting us disable it in time when a cubie is grabbed.
renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

/* ============================================================================
   5. LAYER ROTATION ENGINE
   ==========================================================================*/

const pivot = new THREE.Group();
scene.add(pivot);

let isAnimating = false;

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Rotate an integer logical position by +/-90 degrees about a world axis.
function rotatePos(pos, axis, direction) {
  const { x, y, z } = pos;
  if (axis === 'x') return direction === 1 ? { x, y: -z, z: y } : { x, y: z, z: -y };
  if (axis === 'y') return direction === 1 ? { x: z, y, z: -x } : { x: -z, y, z: x };
  return direction === 1 ? { x: -y, y: x, z } : { x: y, y: -x, z };
}

/**
 * Animate a 90-degree turn of the layer at `layerValue` along `axis`.
 * direction: +1 or -1 (right-hand rule around the world axis).
 */
function rotateLayer(axis, layerValue, direction, duration, onComplete) {
  isAnimating = true;

  const layerCubies = cubies.filter((c) => c.userData.pos[axis] === layerValue);

  pivot.rotation.set(0, 0, 0);
  for (const c of layerCubies) pivot.attach(c); // preserves world transform

  const axisVector = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const targetAngle = direction * (Math.PI / 2);
  const startTime = performance.now();

  function step() {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    const eased = easeInOutQuad(t);
    pivot.quaternion.setFromAxisAngle(axisVector, eased * targetAngle);

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    // Finalize: reparent cubies back to the scene, snap transforms to
    // eliminate any floating point drift, and update logical positions.
    for (const c of layerCubies) {
      scene.attach(c);

      c.position.set(
        Math.round(c.position.x / OFFSET) * OFFSET,
        Math.round(c.position.y / OFFSET) * OFFSET,
        Math.round(c.position.z / OFFSET) * OFFSET
      );

      const euler = new THREE.Euler().setFromQuaternion(c.quaternion, 'XYZ');
      const snap = (v) => Math.round(v / (Math.PI / 2)) * (Math.PI / 2);
      euler.set(snap(euler.x), snap(euler.y), snap(euler.z));
      c.quaternion.setFromEuler(euler);

      c.userData.pos = rotatePos(c.userData.pos, axis, direction);
    }

    pivot.quaternion.identity();
    isAnimating = false;
    if (onComplete) onComplete();
  }

  step();
}

// Full chronological log of every move made since the last scramble
// (scramble moves + user moves). Reversing this in order is always
// guaranteed to bring the cube back to solved -- this is what powers
// both single-step Undo and the Auto-Solve feature.
const moveLog = [];
let moveCounter = 0; // counts USER moves only (shown in the HUD)

function updateMoveCounterDisplay() {
  moveCountEl.textContent = String(moveCounter);
}

function performMove(axis, layerValue, direction) {
  if (gameState !== 'playing') return;
  moveLog.push({ axis, layer: layerValue, direction });
  moveCounter++;
  updateMoveCounterDisplay();

  rotateLayer(axis, layerValue, direction, USER_MOVE_DURATION, () => {
    if (gameState === 'playing' && isSolved()) {
      finishGame();
    }
  });
}

/**
 * Undo the single most recent move (whether it was a user turn or, once
 * user moves run out, a scramble turn), restoring the exact prior state.
 */
function undoLastMove() {
  if (isAnimating || gameState !== 'playing' || moveLog.length === 0) return;
  const last = moveLog.pop();
  if (moveCounter > 0) {
    moveCounter--;
    updateMoveCounterDisplay();
  }
  rotateLayer(last.axis, last.layer, -last.direction, USER_MOVE_DURATION, () => {
    if (gameState === 'playing' && isSolved()) finishGame();
  });
}

/**
 * Auto-Solver: since every move ever applied to this cube instance is
 * recorded in `moveLog`, replaying that log in reverse (inverting each
 * turn) is a mathematically guaranteed way back to a fully solved cube
 * from ANY current state -- no cube-solving algorithm required.
 * This does not count towards the timer / best-time, since it's a helper.
 */
function autoSolve() {
  if (isAnimating || gameState === 'solving' || moveLog.length === 0) return;

  gameState = 'solving';
  timerRunning = false;
  toolbar.classList.add('hidden');
  solvingBanner.classList.remove('hidden');

  function undoNext() {
    if (moveLog.length === 0) {
      solvingBanner.classList.add('hidden');
      gameState = 'idle';
      moveCounter = 0;
      updateMoveCounterDisplay();
      hudTimer.textContent = '00:00.0';
      startOverlay.classList.remove('hidden');
      return;
    }
    const move = moveLog.pop();
    rotateLayer(move.axis, move.layer, -move.direction, 90, undoNext);
  }

  undoNext();
}

/* ============================================================================
   6. SCRAMBLE SEQUENCE
   ==========================================================================*/

function scrambleCube() {
  gameState = 'scrambling';
  startOverlay.classList.add('hidden');
  solvedBanner.classList.add('hidden');
  toolbar.classList.add('hidden');

  moveLog.length = 0;
  moveCounter = 0;
  updateMoveCounterDisplay();

  const axes = ['x', 'y', 'z'];
  const layers = [-1, 0, 1];
  const dirs = [1, -1];
  let remaining = SCRAMBLE_MOVE_COUNT;
  let lastAxis = null, lastLayer = null;

  function nextMove() {
    if (remaining <= 0) {
      beginTimedPlay();
      return;
    }
    // Avoid immediately repeating the exact same slice turn twice in a row.
    let axis, layer;
    do {
      axis = axes[Math.floor(Math.random() * 3)];
      layer = layers[Math.floor(Math.random() * 3)];
    } while (axis === lastAxis && layer === lastLayer);
    lastAxis = axis; lastLayer = layer;

    const dir = dirs[Math.floor(Math.random() * 2)];
    remaining--;
    moveLog.push({ axis, layer, direction: dir }); // logged so Auto-Solve can unwind it too
    rotateLayer(axis, layer, dir, SCRAMBLE_DURATION, nextMove);
  }

  nextMove();
}

/* ============================================================================
   7. SOLVE DETECTION
   ----------------------------------------------------------------------------
   Every sticker's local +Z axis was aligned with its outward face normal at
   construction time. Since all turns are exact 90-degree increments, each
   sticker's *current* world-facing normal is always exactly axis-aligned.
   The cube is solved when every group of stickers sharing a world-facing
   direction shows a single uniform color.
   ==========================================================================*/

function isSolved() {
  const buckets = new Map();
  const q = new THREE.Quaternion();
  const localZ = new THREE.Vector3(0, 0, 1);

  for (const target of raycastTargets) {
    if (!target.userData.isSticker) continue;
    target.getWorldQuaternion(q);
    const n = localZ.clone().applyQuaternion(q);
    const key = `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`;
    const color = target.material.color.getHex();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(color);
  }

  for (const colors of buckets.values()) {
    if (colors.some((c) => c !== colors[0])) return false;
  }
  return true;
}

/* ============================================================================
   8. TIMER, PERSISTENCE & UI WIRING
   ==========================================================================*/

const hudTimer       = document.getElementById('timer');
const hudBest        = document.getElementById('best-time');
const moveCountEl    = document.getElementById('move-count');
const startOverlay   = document.getElementById('start-overlay');
const solvedBanner   = document.getElementById('solved-banner');
const solvingBanner  = document.getElementById('solving-banner');
const solvedTimeEl   = document.getElementById('solved-time');
const solvedMovesEl  = document.getElementById('solved-moves');
const newBestTag     = document.getElementById('new-best-tag');
const toolbar        = document.getElementById('toolbar');
const btnUndo        = document.getElementById('btn-undo');
const btnScramble    = document.getElementById('btn-scramble');
const btnSolve       = document.getElementById('btn-solve');

let gameState = 'idle'; // 'idle' | 'scrambling' | 'playing' | 'solved'
let timerRunning = false;
let startTime = 0;

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

function loadBestTime() {
  const raw = localStorage.getItem(BEST_TIME_KEY);
  return raw ? parseFloat(raw) : null;
}

function refreshBestTimeDisplay() {
  const best = loadBestTime();
  hudBest.textContent = best ? formatTime(best) : '--:--.-';
}

function beginTimedPlay() {
  gameState = 'playing';
  startTime = performance.now();
  timerRunning = true;
  toolbar.classList.remove('hidden');
}

function finishGame() {
  timerRunning = false;
  gameState = 'solved';
  toolbar.classList.add('hidden');
  const finalTime = performance.now() - startTime;
  hudTimer.textContent = formatTime(finalTime);

  const best = loadBestTime();
  const isNewBest = best === null || finalTime < best;
  if (isNewBest) localStorage.setItem(BEST_TIME_KEY, String(finalTime));
  refreshBestTimeDisplay();

  solvedTimeEl.textContent = formatTime(finalTime);
  solvedMovesEl.textContent = `in ${moveCounter} move${moveCounter === 1 ? '' : 's'}`;
  newBestTag.classList.toggle('hidden', !isNewBest);
  solvedBanner.classList.remove('hidden');

  if (navigator.vibrate) navigator.vibrate([35, 50, 35]);
  launchConfetti();
}

function resetAndScramble() {
  if (isAnimating) return;
  solvedBanner.classList.add('hidden');
  destroyCube();
  buildCube();
  scrambleCube();
}

refreshBestTimeDisplay();

/* ---- Bottom toolbar wiring ---- */
btnUndo.addEventListener('click', undoLastMove);
btnScramble.addEventListener('click', resetAndScramble);
btnSolve.addEventListener('click', autoSolve);

/* ---- Double-tap to start / restart ---- */
let lastTapTime = 0;
const DOUBLE_TAP_MS = 350;

function handleDoubleTap(onDoubleTap) {
  return (event) => {
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      onDoubleTap(event);
    }
    lastTapTime = now;
  };
}

startOverlay.addEventListener('pointerdown', handleDoubleTap(() => {
  if (gameState === 'idle') scrambleCube();
}));

solvedBanner.addEventListener('pointerdown', handleDoubleTap(() => {
  if (gameState === 'solved') resetAndScramble();
}));

/* ============================================================================
   9. CONFETTI (celebration effect on a genuine solve)
   ==========================================================================*/

const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
const CONFETTI_COLORS = ['#d6293e', '#ff8a00', '#f5f5f5', '#ffd400', '#00a651', '#1257e0'];

function resizeConfettiCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
resizeConfettiCanvas();
window.addEventListener('resize', resizeConfettiCanvas);

function launchConfetti() {
  const particles = [];
  const count = 140;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: confettiCanvas.width / 2,
      y: confettiCanvas.height * 0.32,
      vx: (Math.random() - 0.5) * 15,
      vy: Math.random() * -11 - 4,
      size: 4 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
    });
  }

  const gravity = 0.3;
  const duration = 2200;
  const start = performance.now();

  function frame() {
    const elapsed = performance.now() - start;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    let anyOnscreen = false;
    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      if (p.y < confettiCanvas.height + 20) anyOnscreen = true;

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      confettiCtx.restore();
    }

    if (elapsed < duration && anyOnscreen) {
      requestAnimationFrame(frame);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  frame();
}

/* ============================================================================
   10. RENDER LOOP / RESIZE
   ==========================================================================*/

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (timerRunning) {
    hudTimer.textContent = formatTime(performance.now() - startTime);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
