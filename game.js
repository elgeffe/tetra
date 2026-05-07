'use strict';

// ============================================================================
// CONSTANTS  (game-feel numbers ported verbatim from the prototype)
// ============================================================================
const COLS = 10;
const ROWS = 24;
const VISIBLE_ROWS = 20;
const BUFFER_ROWS = ROWS - VISIBLE_ROWS;

const SIM_HZ = 240;
const SIM_DT = 1000 / SIM_HZ;

const DAS_MS = 130;
const ARR_MS = 12;
const SOFT_DROP_MULT = 20;
const LOCK_DELAY_MS = 500;
const LOCK_RESET_LIMIT = 15;

const I=1, O=2, T=3, S=4, Z=5, J=6, L=7;

const PIECES = {
  [I]: [
    [0,1, 1,1, 2,1, 3,1],
    [2,0, 2,1, 2,2, 2,3],
    [0,2, 1,2, 2,2, 3,2],
    [1,0, 1,1, 1,2, 1,3],
  ],
  [O]: [
    [1,0, 2,0, 1,1, 2,1],
    [1,0, 2,0, 1,1, 2,1],
    [1,0, 2,0, 1,1, 2,1],
    [1,0, 2,0, 1,1, 2,1],
  ],
  [T]: [
    [1,0, 0,1, 1,1, 2,1],
    [1,0, 1,1, 2,1, 1,2],
    [0,1, 1,1, 2,1, 1,2],
    [1,0, 0,1, 1,1, 1,2],
  ],
  [S]: [
    [1,0, 2,0, 0,1, 1,1],
    [1,0, 1,1, 2,1, 2,2],
    [1,1, 2,1, 0,2, 1,2],
    [0,0, 0,1, 1,1, 1,2],
  ],
  [Z]: [
    [0,0, 1,0, 1,1, 2,1],
    [2,0, 1,1, 2,1, 1,2],
    [0,1, 1,1, 1,2, 2,2],
    [1,0, 0,1, 1,1, 0,2],
  ],
  [J]: [
    [0,0, 0,1, 1,1, 2,1],
    [1,0, 2,0, 1,1, 1,2],
    [0,1, 1,1, 2,1, 2,2],
    [1,0, 1,1, 0,2, 1,2],
  ],
  [L]: [
    [2,0, 0,1, 1,1, 2,1],
    [1,0, 1,1, 1,2, 2,2],
    [0,1, 1,1, 2,1, 0,2],
    [0,0, 1,0, 1,1, 1,2],
  ],
};

const KICKS_JLSTZ = [
  [ [0,0, -1,0, -1,-1, 0,2, -1,2],
    [0,0,  1,0,  1,-1, 0,2,  1,2] ],
  [ [0,0,  1,0,  1, 1, 0,-2, 1,-2],
    [0,0,  1,0,  1, 1, 0,-2, 1,-2] ],
  [ [0,0,  1,0,  1,-1, 0,2,  1,2],
    [0,0, -1,0, -1,-1, 0,2, -1,2] ],
  [ [0,0, -1,0, -1, 1, 0,-2, -1,-2],
    [0,0, -1,0, -1, 1, 0,-2, -1,-2] ],
];
const KICKS_I = [
  [ [0,0, -2,0,  1,0, -2, 1,  1,-2],
    [0,0, -1,0,  2,0, -1,-2,  2, 1] ],
  [ [0,0, -1,0,  2,0, -1, 2,  2,-1],
    [0,0,  2,0, -1,0,  2,-1, -1, 2] ],
  [ [0,0,  2,0, -1,0,  2,-1, -1, 2],
    [0,0,  1,0, -2,0,  1, 2, -2,-1] ],
  [ [0,0,  1,0, -2,0,  1,-2, -2, 1],
    [0,0, -2,0,  1,0, -2,-1,  1, 2] ],
];

const COLOR_NAME = ['', 'p-i', 'p-o', 'p-t', 'p-s', 'p-z', 'p-j', 'p-l'];
function readColor(id) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--' + COLOR_NAME[id]).trim();
}
const COLORS = new Array(8);

const LINE_SCORES = [0, 100, 300, 500, 800];

function gravityMs(level) {
  if (level >= 20) return 4;
  const sec = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(4, sec * 1000);
}

// ============================================================================
// STATE
// ============================================================================
const board = new Uint8Array(COLS * ROWS);

const active = { type: 0, rot: 0, x: 0, y: 0, displayY: 0 };

const bag = new Uint8Array(14);
let bagHead = 0;
let bagTail = 0;

let holdType = 0;
let canHold = true;

let gravityAcc = 0;
let lockAcc = 0;
let lockResets = 0;
let onGround = false;

let dasDir = 0;
let dasAcc = 0;
let dasCharged = false;
let arrAcc = 0;
let softDropping = false;

let score = 0;
let lines = 0;
let level = 1;
let pieces = 0;
let combo = -1;

let mode = 'ready';

let flashAcc = 0;
let flashRows = new Uint8Array(4);
let flashCount = 0;

let rngState = (Math.random() * 0xffffffff) >>> 0 || 1;
function rng() {
  let x = rngState;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  rngState = x;
  return x;
}

// ============================================================================
// BAG
// ============================================================================
function refillBag() {
  const start = bagTail % 14;
  for (let i = 0; i < 7; i++) bag[(start + i) % 14] = i + 1;
  for (let i = 6; i > 0; i--) {
    const j = rng() % (i + 1);
    const a = (start + i) % 14;
    const b = (start + j) % 14;
    const t = bag[a]; bag[a] = bag[b]; bag[b] = t;
  }
  bagTail += 7;
}
function peekBag(offset) {
  while (bagTail - bagHead <= offset) refillBag();
  return bag[(bagHead + offset) % 14];
}
function drawBag() {
  while (bagTail - bagHead <= 0) refillBag();
  const t = bag[bagHead % 14];
  bagHead++;
  return t;
}

// ============================================================================
// PIECE / BOARD OPS
// ============================================================================
function pieceCells(type, rot) { return PIECES[type][rot]; }

function collides(type, rot, x, y) {
  const c = pieceCells(type, rot);
  for (let i = 0; i < 8; i += 2) {
    const cx = x + c[i];
    const cy = y + c[i + 1];
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy >= 0 && board[cy * COLS + cx] !== 0) return true;
  }
  return false;
}

function spawn(type) {
  active.type = type;
  active.rot = 0;
  active.x = 3;
  active.y = BUFFER_ROWS - 2;
  active.displayY = active.y;
  gravityAcc = 0;
  lockAcc = 0;
  lockResets = 0;
  onGround = false;
  if (collides(active.type, active.rot, active.x, active.y)) {
    mode = 'over';
    haptic([50, 50, 100]);
    showOverlay('GAME OVER', `SCORE <span class="accent">${score.toLocaleString()}</span><br>TAP TO RESTART`, true);
  }
}

function lockPiece() {
  const c = pieceCells(active.type, active.rot);
  for (let i = 0; i < 8; i += 2) {
    const cx = active.x + c[i];
    const cy = active.y + c[i + 1];
    if (cy < 0) {
      mode = 'over';
      haptic([50, 50, 100]);
      showOverlay('GAME OVER', `SCORE <span class="accent">${score.toLocaleString()}</span><br>TAP TO RESTART`, true);
      return;
    }
    board[cy * COLS + cx] = active.type;
  }
  flashCount = 0;
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (board[y * COLS + x] === 0) { full = false; break; }
    }
    if (full) {
      flashRows[flashCount++] = y;
      if (flashCount >= 4) break;
    }
  }
  if (flashCount > 0) {
    flashAcc = 120;
    for (let i = 0; i < flashCount; i++) {
      const y = flashRows[i];
      for (let yy = y; yy > 0; yy--) {
        for (let x = 0; x < COLS; x++) {
          board[yy * COLS + x] = board[(yy - 1) * COLS + x];
        }
      }
      for (let x = 0; x < COLS; x++) board[x] = 0;
    }
    lines += flashCount;
    score += LINE_SCORES[flashCount] * level;
    combo++;
    if (combo > 0) score += 50 * combo * level;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel !== level) level = newLevel;
    haptic(flashCount === 4 ? [10, 30, 30] : 15);
  } else {
    combo = -1;
    haptic(4);
  }
  pieces++;
  canHold = true;
  spawn(drawBag());
}

function tryMove(dx, dy) {
  if (!collides(active.type, active.rot, active.x + dx, active.y + dy)) {
    active.x += dx;
    active.y += dy;
    if (dy === 0 && onGround) {
      if (lockResets < LOCK_RESET_LIMIT) { lockAcc = 0; lockResets++; }
    }
    return true;
  }
  return false;
}

function tryRotate(dir) {
  if (active.type === O) return false;
  const fromRot = active.rot;
  const toRot = (fromRot + (dir > 0 ? 1 : 3)) & 3;
  const table = (active.type === I) ? KICKS_I : KICKS_JLSTZ;
  const tests = table[fromRot][dir > 0 ? 0 : 1];
  for (let i = 0; i < 10; i += 2) {
    const dx = tests[i], dy = tests[i + 1];
    if (!collides(active.type, toRot, active.x + dx, active.y + dy)) {
      active.rot = toRot;
      active.x += dx;
      active.y += dy;
      if (onGround && lockResets < LOCK_RESET_LIMIT) { lockAcc = 0; lockResets++; }
      return true;
    }
  }
  return false;
}

function hardDrop() {
  let dropped = 0;
  while (!collides(active.type, active.rot, active.x, active.y + 1)) {
    active.y++;
    dropped++;
  }
  score += dropped * 2;
  active.displayY = active.y;
  haptic(8);
  lockPiece();
}

function holdSwap() {
  if (!canHold) return;
  const cur = active.type;
  if (holdType === 0) {
    holdType = cur;
    spawn(drawBag());
  } else {
    const tmp = holdType;
    holdType = cur;
    spawn(tmp);
  }
  canHold = false;
}

function ghostY() {
  let y = active.y;
  while (!collides(active.type, active.rot, active.x, y + 1)) y++;
  return y;
}

// ============================================================================
// INPUT — unified action dispatch
// Keyboard, pointer gestures, and on-screen buttons all funnel here.
// ============================================================================
const keys = Object.create(null);
const pressedThisTick = Object.create(null);

function actionDown(act)  { if (!keys[act]) pressedThisTick[act] = true; keys[act] = true; }
function actionUp(act)    { keys[act] = false; }
function actionTap(act)   { pressedThisTick[act] = true; }

// --- keyboard ---
const KEY_MAP = {
  'arrowleft': 'left', 'a': 'left',
  'arrowright': 'right', 'd': 'right',
  'arrowdown': 'soft', 's': 'soft',
  'arrowup': 'rotcw', 'x': 'rotcw',
  'z': 'rotccw',
  ' ': 'hard',
  'shift': 'hold', 'c': 'hold',
  'p': 'pause',
  'r': 'reset',
};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  const act = KEY_MAP[k];
  if (!act) return;
  e.preventDefault();
  actionDown(act);
}, { passive: false });
window.addEventListener('keyup', (e) => {
  const act = KEY_MAP[e.key.toLowerCase()];
  if (act) actionUp(act);
});

// --- pointer / touch gesture recognizer ---
//
// Per architecture §6: tap halves rotate, horizontal drag = direct move
// (1 cell per CELL px of finger travel, DAS bypassed), down-swipe = hard drop,
// slow down-drag = soft drop held, two-finger tap = hold.
const TAP_TIME_MS = 220;
const TAP_THRESH_PX = 10;
const HARD_DROP_VELOCITY = 1.2;     // cells per ms
const SOFT_DROP_THRESH_CELLS = 0.8;

const pointers = new Map();   // pointerId -> tracker

function trackerFor(boardCanvas) {
  const onDown = (e) => {
    if (mode === 'ready' || mode === 'over') {
      // any tap starts/restarts
      if (mode === 'over') resetGame();
      else { mode = 'playing'; hideOverlay(); }
      // don't consume — also let it count as a normal touch for first piece
    }
    if (mode === 'paused') {
      mode = 'playing';
      hideOverlay();
      return;
    }
    boardCanvas.setPointerCapture && boardCanvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY,
      dxAccumCells: 0, dyAccumCells: 0,
      startT: performance.now(),
      lastT: performance.now(),
      moved: false,
      softDropActive: false,
      hardDropFired: false,
    });
    // two-finger: hold
    if (pointers.size === 2) {
      actionTap('hold');
    }
    e.preventDefault();
  };

  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    const dxScreen = e.clientX - p.lastX;
    const dyScreen = e.clientY - p.lastY;
    const dt = Math.max(1, now - p.lastT);
    p.lastX = e.clientX; p.lastY = e.clientY; p.lastT = now;

    const totalDx = e.clientX - p.startX;
    const totalDy = e.clientY - p.startY;
    if (Math.hypot(totalDx, totalDy) > TAP_THRESH_PX) p.moved = true;

    if (mode !== 'playing') return;

    const cellPx = currentCellPx();
    if (cellPx <= 0) return;

    // --- horizontal drag: direct move, 1 cell per cellPx ---
    p.dxAccumCells += dxScreen / cellPx;
    while (p.dxAccumCells >= 1) {
      tryMove(+1, 0);
      p.dxAccumCells -= 1;
    }
    while (p.dxAccumCells <= -1) {
      tryMove(-1, 0);
      p.dxAccumCells += 1;
    }

    // --- vertical: hard drop on fast down-swipe; soft drop on slow down-drag ---
    if (dyScreen > 0) {
      const velCellsPerMs = (dyScreen / cellPx) / dt;
      if (!p.hardDropFired && velCellsPerMs > HARD_DROP_VELOCITY && totalDy / cellPx > 2) {
        hardDrop();
        p.hardDropFired = true;
        return;
      }
      p.dyAccumCells += dyScreen / cellPx;
      if (!p.softDropActive && p.dyAccumCells > SOFT_DROP_THRESH_CELLS) {
        actionDown('soft');
        p.softDropActive = true;
      }
    } else if (dyScreen < 0) {
      // user reversed direction — release soft drop
      if (p.softDropActive) {
        actionUp('soft');
        p.softDropActive = false;
      }
    }

    e.preventDefault();
  };

  const onUp = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.softDropActive) actionUp('soft');

    const totalDx = e.clientX - p.startX;
    const totalDy = e.clientY - p.startY;
    const dt = performance.now() - p.startT;

    if (mode !== 'playing') return;

    // --- tap: rotate ---
    if (!p.moved && dt < TAP_TIME_MS) {
      const rect = boardCanvas.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      if (localX < rect.width / 2) {
        actionTap('rotccw');
      } else {
        actionTap('rotcw');
      }
    }
  };

  const onCancel = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.softDropActive) actionUp('soft');
    pointers.delete(e.pointerId);
  };

  boardCanvas.addEventListener('pointerdown', onDown, { passive: false });
  boardCanvas.addEventListener('pointermove', onMove, { passive: false });
  boardCanvas.addEventListener('pointerup', onUp);
  boardCanvas.addEventListener('pointercancel', onCancel);
  boardCanvas.addEventListener('lostpointercapture', onCancel);
}

// --- on-screen control buttons ---
function bindButtons() {
  const pause = document.getElementById('btn-pause');
  const reset = document.getElementById('btn-reset');
  pause.addEventListener('click', () => actionTap('pause'));
  reset.addEventListener('click', () => {
    if (confirm('Reset game?')) actionTap('reset');
  });
}

// ============================================================================
// SIMULATION TICK
// ============================================================================
function tick(dt) {
  if (pressedThisTick['pause']) {
    if (mode === 'playing') {
      mode = 'paused';
      showOverlay('PAUSED', 'TAP TO RESUME', false);
    } else if (mode === 'paused') {
      mode = 'playing';
      hideOverlay();
    }
  }
  if (pressedThisTick['reset']) {
    resetGame();
    pressedThisTick['reset'] = false;
    return;
  }

  if (mode !== 'playing') {
    for (const k in pressedThisTick) pressedThisTick[k] = false;
    return;
  }

  if (pressedThisTick['rotcw']) tryRotate(+1);
  if (pressedThisTick['rotccw']) tryRotate(-1);

  if (pressedThisTick['hold']) holdSwap();

  if (pressedThisTick['hard']) {
    hardDrop();
    for (const k in pressedThisTick) pressedThisTick[k] = false;
    return;
  }

  // DAS / ARR for keyboard arrow holds (touch uses direct-drag instead)
  const wantLeft = !!keys['left'];
  const wantRight = !!keys['right'];
  let dir = 0;
  if (wantLeft && !wantRight) dir = -1;
  else if (wantRight && !wantLeft) dir = +1;

  if (dir !== dasDir) {
    dasDir = dir;
    dasAcc = 0;
    arrAcc = 0;
    dasCharged = false;
    if (dir !== 0) tryMove(dir, 0);
  } else if (dir !== 0) {
    dasAcc += dt;
    if (!dasCharged && dasAcc >= DAS_MS) {
      dasCharged = true;
      arrAcc = 0;
    }
    if (dasCharged) {
      arrAcc += dt;
      while (arrAcc >= ARR_MS) {
        if (!tryMove(dir, 0)) break;
        arrAcc -= ARR_MS;
      }
    }
  }

  softDropping = !!keys['soft'];
  const baseG = gravityMs(level);
  const g = softDropping ? Math.max(SIM_DT, baseG / SOFT_DROP_MULT) : baseG;
  gravityAcc += dt;
  while (gravityAcc >= g) {
    gravityAcc -= g;
    if (!collides(active.type, active.rot, active.x, active.y + 1)) {
      active.y++;
      if (softDropping) score += 1;
    } else {
      break;
    }
  }

  const grounded = collides(active.type, active.rot, active.x, active.y + 1);
  if (grounded) {
    onGround = true;
    lockAcc += dt;
    if (lockAcc >= LOCK_DELAY_MS) lockPiece();
  } else {
    onGround = false;
    lockAcc = 0;
  }

  const progress = Math.min(1, gravityAcc / g);
  active.displayY = active.y + (grounded ? 0 : progress);

  if (flashAcc > 0) flashAcc -= dt;

  for (const k in pressedThisTick) pressedThisTick[k] = false;
}

// ============================================================================
// RENDERING
// ============================================================================
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d', { alpha: false });
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvases = Array.from(document.querySelectorAll('#next-list canvas'))
  .map(c => ({ canvas: c, ctx: c.getContext('2d') }));

let CELL = 32;            // dynamic — set on resize
let DPR = 1;

function currentCellPx() {
  // CSS pixels per cell
  const cssW = boardCanvas.clientWidth;
  return cssW / COLS;
}

function resizeBoard() {
  const wrap = document.getElementById('board-wrap');
  const frame = document.getElementById('board-frame');
  // available area for the inner canvas, accounting for frame padding
  const padPx = 8; // 4px padding * 2
  const availW = Math.max(0, wrap.clientWidth - padPx);
  const availH = Math.max(0, wrap.clientHeight - padPx);

  // 10:20 = 1:2 aspect
  let cssCell = Math.floor(Math.min(availW / COLS, availH / VISIBLE_ROWS));
  cssCell = Math.max(12, Math.min(cssCell, 64));

  const cssW = cssCell * COLS;
  const cssH = cssCell * VISIBLE_ROWS;

  DPR = Math.min(window.devicePixelRatio || 1, 3);
  CELL = cssCell * DPR;

  boardCanvas.style.width = cssW + 'px';
  boardCanvas.style.height = cssH + 'px';
  boardCanvas.width = cssW * DPR;
  boardCanvas.height = cssH * DPR;

  frame.style.width = (cssW + padPx) + 'px';
  frame.style.height = (cssH + padPx) + 'px';

  // resize previews
  resizePreviewCanvas(holdCanvas);
  for (const n of nextCanvases) resizePreviewCanvas(n.canvas);

  invalidatePreviewCache();
}

function resizePreviewCanvas(c) {
  const cssW = c.clientWidth;
  const cssH = c.clientHeight;
  c.width = cssW * DPR;
  c.height = cssH * DPR;
}

function drawCell(c, x, y, size, type, alpha = 1) {
  if (type === 0) return;
  c.globalAlpha = alpha;
  c.fillStyle = COLORS[type];
  c.fillRect(x + 1, y + 1, size - 2, size - 2);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(x + 1, y + 1, size - 2, Math.max(1, size * 0.08));
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(x + 1, y + size - 3, size - 2, Math.max(1, size * 0.08));
  c.globalAlpha = 1;
}

function drawCellOutline(c, x, y, size, type) {
  c.strokeStyle = COLORS[type];
  c.globalAlpha = 0.35;
  c.lineWidth = Math.max(1, size * 0.06);
  c.strokeRect(x + 2, y + 2, size - 4, size - 4);
  c.globalAlpha = 1;
}

function drawBoard() {
  const w = boardCanvas.width, h = boardCanvas.height;
  ctx.fillStyle = '#07070a';
  ctx.fillRect(0, 0, w, h);

  // subtle grid
  ctx.strokeStyle = '#13141a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, VISIBLE_ROWS * CELL);
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(COLS * CELL, y * CELL + 0.5);
  }
  ctx.stroke();

  for (let y = BUFFER_ROWS; y < ROWS; y++) {
    const isFlashing = flashAcc > 0 && flashCount > 0 && (
      flashRows[0] === y || flashRows[1] === y ||
      flashRows[2] === y || flashRows[3] === y
    );
    for (let x = 0; x < COLS; x++) {
      const t = board[y * COLS + x];
      if (t !== 0) {
        const py = (y - BUFFER_ROWS) * CELL;
        if (isFlashing) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x * CELL + 1, py + 1, CELL - 2, CELL - 2);
        } else {
          drawCell(ctx, x * CELL, py, CELL, t);
        }
      }
    }
  }

  if (mode === 'over' || mode === 'ready') return;

  const gy = ghostY();
  const gc = pieceCells(active.type, active.rot);
  for (let i = 0; i < 8; i += 2) {
    const px = (active.x + gc[i]) * CELL;
    const py = (gy + gc[i + 1] - BUFFER_ROWS) * CELL;
    if (gy + gc[i + 1] >= BUFFER_ROWS) {
      drawCellOutline(ctx, px, py, CELL, active.type);
    }
  }

  const ay = active.displayY;
  for (let i = 0; i < 8; i += 2) {
    const cx = active.x + gc[i];
    const cy = ay + gc[i + 1];
    if (cy >= BUFFER_ROWS - 0.5) {
      const px = cx * CELL;
      const py = (cy - BUFFER_ROWS) * CELL;
      drawCell(ctx, px, py, CELL, active.type);
    }
  }
}

function drawPreview(c, ctx2, type) {
  ctx2.fillStyle = '#181923';
  ctx2.fillRect(0, 0, c.width, c.height);
  if (!type) return;
  const cells = pieceCells(type, 0);
  let minX = 99, maxX = -99, minY = 99, maxY = -99;
  for (let i = 0; i < 8; i += 2) {
    if (cells[i] < minX) minX = cells[i];
    if (cells[i] > maxX) maxX = cells[i];
    if (cells[i+1] < minY) minY = cells[i+1];
    if (cells[i+1] > maxY) maxY = cells[i+1];
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const pad = 6 * DPR;
  const size = Math.min((c.width - pad) / w, (c.height - pad) / h);
  const ox = (c.width - w * size) / 2 - minX * size;
  const oy = (c.height - h * size) / 2 - minY * size;
  for (let i = 0; i < 8; i += 2) {
    drawCell(ctx2, ox + cells[i] * size, oy + cells[i+1] * size, size, type);
  }
}

// ============================================================================
// HUD
// ============================================================================
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayBodyEl = document.getElementById('overlay-body');
const overlayHintEl = document.getElementById('overlay-hint');
const statusEl = document.getElementById('status');

let lastHudScore = -1, lastHudLines = -1, lastHudLevel = -1;
function updateHud() {
  if (score !== lastHudScore) { scoreEl.textContent = score.toLocaleString(); lastHudScore = score; }
  if (lines !== lastHudLines) { linesEl.textContent = lines; lastHudLines = lines; }
  if (level !== lastHudLevel) { levelEl.textContent = level; lastHudLevel = level; }
  statusEl.textContent = mode.toUpperCase();
}

let lastHoldType = -1;
const lastNextTypes = new Int8Array(nextCanvases.length).fill(-1);
function invalidatePreviewCache() {
  lastHoldType = -1;
  for (let i = 0; i < lastNextTypes.length; i++) lastNextTypes[i] = -1;
}
function updatePreviews() {
  if (holdType !== lastHoldType) {
    drawPreview(holdCanvas, holdCtx, holdType);
    lastHoldType = holdType;
  }
  for (let i = 0; i < nextCanvases.length; i++) {
    const t = peekBag(i);
    if (t !== lastNextTypes[i]) {
      drawPreview(nextCanvases[i].canvas, nextCanvases[i].ctx, t);
      lastNextTypes[i] = t;
    }
  }
}

function showOverlay(title, body, isWarn) {
  overlayEl.classList.remove('hidden');
  overlayTitleEl.innerHTML = title;
  overlayTitleEl.className = isWarn ? 'warn' : '';
  overlayBodyEl.innerHTML = body;
  if (overlayHintEl) overlayHintEl.style.display = (mode === 'ready') ? 'grid' : 'none';
}
function hideOverlay() {
  overlayEl.classList.add('hidden');
}

// ============================================================================
// HAPTICS, WAKE LOCK, VISIBILITY
// ============================================================================
let hapticsEnabled = true;
function haptic(pattern) {
  if (!hapticsEnabled) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) {}
  }
}

let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { /* user-gesture / unsupported */ }
}
function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'playing') {
      mode = 'paused';
      showOverlay('PAUSED', 'TAP TO RESUME', false);
    }
    releaseWakeLock();
  } else {
    if (mode === 'playing') requestWakeLock();
  }
});

// ============================================================================
// LIFECYCLE
// ============================================================================
function resetGame() {
  board.fill(0);
  bagHead = 0; bagTail = 0;
  holdType = 0; canHold = true;
  score = 0; lines = 0; level = 1; pieces = 0; combo = -1;
  flashAcc = 0; flashCount = 0;
  dasDir = 0; dasAcc = 0; arrAcc = 0; dasCharged = false;
  gravityAcc = 0; lockAcc = 0; lockResets = 0;
  for (const k in keys) keys[k] = false;
  for (const k in pressedThisTick) pressedThisTick[k] = false;
  lastHudScore = -1; lastHudLines = -1; lastHudLevel = -1;
  invalidatePreviewCache();
  spawn(drawBag());
  mode = 'playing';
  hideOverlay();
  requestWakeLock();
}

function init() {
  for (let i = 1; i <= 7; i++) COLORS[i] = readColor(i);
  resizeBoard();
  bindButtons();
  trackerFor(boardCanvas);
  showOverlay('TETRA<span class="accent">.</span>', 'TAP TO START', false);
  mode = 'ready';
  spawn(drawBag());

  // overlay/global tap to start (for taps outside the canvas region)
  overlayEl.addEventListener('pointerdown', (e) => {
    if (mode === 'ready') {
      mode = 'playing';
      hideOverlay();
      requestWakeLock();
    } else if (mode === 'over') {
      resetGame();
    } else if (mode === 'paused') {
      mode = 'playing';
      hideOverlay();
    }
    e.preventDefault();
  });

  window.addEventListener('resize', resizeBoard);
  // VisualViewport drives layout when the on-screen keyboard or browser UI shows/hides
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeBoard);
  }
}

// ============================================================================
// MAIN LOOP
// ============================================================================
let lastFrameTime = performance.now();
let simAcc = 0;

function frame(now) {
  const elapsed = now - lastFrameTime;
  lastFrameTime = now;

  if (mode === 'ready') {
    for (const k in pressedThisTick) {
      if (pressedThisTick[k] && (k === 'pause' || k === 'reset')) continue;
      if (pressedThisTick[k]) {
        mode = 'playing';
        hideOverlay();
        requestWakeLock();
        break;
      }
    }
  }

  simAcc += elapsed;
  if (simAcc > 250) simAcc = 250;
  while (simAcc >= SIM_DT) {
    tick(SIM_DT);
    simAcc -= SIM_DT;
  }

  drawBoard();
  updateHud();
  updatePreviews();

  requestAnimationFrame(frame);
}

document.fonts.ready.then(() => {
  init();
  lastFrameTime = performance.now();
  requestAnimationFrame(frame);
}).catch(() => {
  init();
  lastFrameTime = performance.now();
  requestAnimationFrame(frame);
});
