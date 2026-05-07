# Refactor Plan — TypeScript + Tests + Module Split

**Date:** 2026-05-07
**Author:** Claude (paired with @elgeffe)
**Status:** Proposed
**Tracks against:** `architecture_tetra.md` Phase B (logic port) and the
groundwork for Phases C–D (worker, SAB, WebGL).

---

## 1. Why now

Two recent regressions made the case for stronger guardrails on this codebase:

1. **`statusEl.textContent` on `null`** — I removed the `<span id="status">`
   element when adding HOLD/DROP buttons but forgot the only consumer in
   `updateHud()`. The first frame threw, the rAF loop died, and the game
   appeared frozen on mobile. A strict TypeScript compiler with
   `noUncheckedIndexedAccess` types `getElementById('status')` as
   `HTMLElement | null` and would have rejected `statusEl.textContent = …`
   at compile time.
2. **Stale-DOM-ref class of bug in general** — every `getElementById` in the
   current `game.js` is an implicit assumption about the HTML. Today there
   are ~15 of them; the next UI tweak will plant the same trap again.

There is no test suite. The only thing standing between a typo and a broken
production deploy is "Claude reads carefully."

The architecture doc explicitly specifies TypeScript strict, Vitest, and
Playwright. We deferred them for the "ship something testable on the iPhone
today" goal. That goal is met. The next layer of investment is overdue.

---

## 2. Scope

In scope:

- TypeScript with `strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`.
- Vite as dev server / production bundler. No framework yet — we're not at
  the Preact bailout from the architecture doc's §11 "Risks".
- Vitest for unit tests on pure logic (pieces, kicks, bag, scoring, sim).
- Playwright for one smoke test that covers the regression we just hit
  (load page → tap to start → assert `y` advanced after ~1 s).
- Module split per the architecture's `src/` map, but only the pieces we
  actually have today. No pre-emptive worker/SAB scaffolding.
- A `dist/` build output, with the Pages workflow updated to deploy `dist`
  instead of the repo root.

Out of scope (deferred to subsequent phases):

- Web Worker, OffscreenCanvas, WebGL2 renderer (architecture Phases C/D).
- SharedArrayBuffer + COOP/COEP headers — GitHub Pages cannot set those, so
  Phase C will need a different host or a workaround.
- Preact UI chrome — current chrome is small enough that DOM is fine.
- Audio, gamepad, settings dialog.

---

## 3. Target file tree (post-refactor)

```
tetra/
├── index.html                    ← shell, references built bundle
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/
├── src/
│   ├── main.ts                   ← bootstraps + wires UI
│   ├── sim/
│   │   ├── pieces.ts             ← PIECES, KICKS_*, gravityMs (pure)
│   │   ├── bag.ts                ← 7-bag (pure, seeded)
│   │   ├── rng.ts                ← xorshift32 (pure, seeded)
│   │   ├── board.ts              ← collide, lock, line clear (pure)
│   │   ├── sim.ts                ← tick(state, input, dt) (pure)
│   │   └── types.ts              ← shared interfaces
│   ├── input/
│   │   ├── keyboard.ts
│   │   ├── pointer.ts            ← gesture recognizer
│   │   └── codes.ts              ← Action enum
│   ├── render/
│   │   └── canvas2d.ts           ← Canvas2D renderer (worker swap later)
│   ├── ui/
│   │   ├── hud.ts                ← typed DOM handles, asserted at boot
│   │   └── styles.css
│   └── platform/
│       ├── wake-lock.ts
│       ├── haptics.ts
│       └── visibility.ts
├── test/
│   ├── unit/
│   │   ├── pieces.test.ts
│   │   ├── bag.test.ts
│   │   ├── rng.test.ts
│   │   ├── board.test.ts
│   │   └── sim.test.ts
│   └── e2e/
│       └── smoke.spec.ts         ← Playwright
├── build-icons.py
├── docs/
│   └── 2026-05-07-refactor-plan.md  ← this file
├── .github/workflows/
│   └── pages.yml                 ← updated to test then build then deploy
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Key contracts

### 4.1 Pure simulation core

The current `tick()` in `game.js` mutates module-level state. The refactor
makes it pure-ish: a single `SimState` object passed in, mutated in place,
returned. This is what lets the unit tests run without a DOM.

```ts
// src/sim/types.ts
export interface SimState {
  board: Uint8Array;     // COLS * ROWS
  active: { type: PieceId; rot: 0 | 1 | 2 | 3; x: number; y: number; displayY: number };
  hold: PieceId | 0;
  canHold: boolean;
  bag: Uint8Array;       // 14
  bagHead: number;
  bagTail: number;
  gravityAcc: number;
  lockAcc: number;
  lockResets: number;
  onGround: boolean;
  dasDir: -1 | 0 | 1;
  dasAcc: number;
  dasCharged: boolean;
  arrAcc: number;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  combo: number;
  mode: 'ready' | 'playing' | 'paused' | 'over';
  flashAcc: number;
  flashRows: Uint8Array;
  flashCount: number;
  rngState: number;
}

export interface InputFrame {
  keys: Readonly<Record<Action, boolean>>;
  pressed: Readonly<Record<Action, boolean>>;  // one-shots
}

// src/sim/sim.ts
export function tick(state: SimState, input: InputFrame, dt: number): void;
export function newGame(seed: number): SimState;
```

### 4.2 Typed DOM handles

`getElementById` is wrapped once at boot. If a required element is missing,
the app fails fast at startup with a descriptive error, not silently five
frames later.

```ts
// src/ui/hud.ts
function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from DOM`);
  return el as T;
}

export interface HudHandles {
  board: HTMLCanvasElement;
  hold: HTMLCanvasElement;
  next: HTMLCanvasElement[];
  score: HTMLElement;
  level: HTMLElement;
  lines: HTMLElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayBody: HTMLElement;
  overlayHint: HTMLElement;
  btnPause: HTMLButtonElement;
  btnHold: HTMLButtonElement;
  btnDrop: HTMLButtonElement;
  btnReset: HTMLButtonElement;
  boardWrap: HTMLElement;
}

export function bindHud(): HudHandles { /* required(…) per field */ }
```

This is the structural fix for the `statusEl` regression: removing the
HTML element now also removes the field, and the compiler points at every
consumer.

### 4.3 Action codes

```ts
// src/input/codes.ts
export const enum Action {
  Left = 'left',
  Right = 'right',
  SoftDrop = 'soft',
  HardDrop = 'hard',
  RotateCW = 'rotcw',
  RotateCCW = 'rotccw',
  Hold = 'hold',
  Pause = 'pause',
  Reset = 'reset',
}
```

String literals for now (smaller than expected, debuggable, and the union
type still gives exhaustiveness checks). Switch to a numeric enum if the
input ring buffer arrives in Phase C.

---

## 5. Test plan

### 5.1 Unit (Vitest)

- **`pieces.test.ts`** — every piece, every rotation, every SRS kick from
  the standard test sequences. Lock down the kick tables permanently.
- **`bag.test.ts`** — over 10⁵ draws with a seeded RNG: each id appears
  exactly 7× per 49 draws; no duplicate within a 7-window; queue refills
  correctly across the wraparound at `bagTail % 14`.
- **`rng.test.ts`** — xorshift32 reproducibility; seed → known sequence.
- **`board.test.ts`** — collision boundary cases (left wall, right wall,
  floor, buffer rows, single-cell occupied); line-clear over 1/2/3/4 rows;
  T-spin detection (this also unblocks Phase F item 24 from the architecture).
- **`sim.test.ts`** — scripted input sequences against a known seed:
  - Full piece down with no input: lands at correct y.
  - DAS/ARR: holding left for 130 + N×12 ms moves N+1 cells.
  - Lock delay: hovering over floor for 499 ms doesn't lock; 501 ms does.
  - Lock reset cap: 16 lateral inputs while grounded eventually locks.
  - Hard drop: scores `2 × dropped`.

### 5.2 E2E (Playwright)

- **`smoke.spec.ts`** — load `dist/index.html` over a local server, tap to
  start, wait 1.5 s, assert that `window.__sim.active.y > 2` (we expose the
  state on `window` only when `?test=1` is in the URL). This is the test
  that would have caught today's freeze.

CI runs both before the Pages deploy step. Failure fails the deploy.

---

## 6. Migration strategy

The point of this refactor is to **stop shipping behavior changes for a
beat** and re-establish the foundation. We do it as one PR per stage and
keep `main` deployable at every step.

### Stage 1 — Tooling, no logic changes
- Add `package.json`, `vite.config.ts`, `tsconfig.json`.
- Move `index.html`, `style.css`, `game.js` into `src/` un-renamed.
- `game.js` becomes `src/main.ts` with `// @ts-nocheck` at the top — we
  don't fix types yet, we just want the build pipeline working.
- Build outputs `dist/`. Pages workflow points at `dist/`.
- **Acceptance:** game plays identically in production; bundle size
  documented for tracking.

### Stage 2 — Module split, still loose types
- Extract `src/sim/pieces.ts`, `src/sim/bag.ts`, `src/sim/rng.ts` from
  `main.ts`. These are the easiest — already nearly pure.
- Extract `src/input/keyboard.ts`, `src/input/pointer.ts`.
- Extract `src/render/canvas2d.ts`.
- `main.ts` becomes the thin wiring layer.
- **Acceptance:** game plays identically; module dependency graph matches
  the architecture's §B "module dependency rules".

### Stage 3 — Drop `// @ts-nocheck`, fix types
- Remove `@ts-nocheck`. Compile, fix all errors. Most will be
  `Element | null` and `Object.create(null)` access patterns.
- `bindHud()` lands here.
- **Acceptance:** `tsc --noEmit` is clean; game plays identically.

### Stage 4 — Vitest + first unit tests
- Test the pure modules: `pieces`, `bag`, `rng`. These lock in the
  prototype's tuned values forever.
- Add a `test` job to the Pages workflow that runs before `build`.
- **Acceptance:** at least 80% line coverage on `src/sim/`; green CI.

### Stage 5 — Playwright smoke test
- One test, the regression we just hit.
- **Acceptance:** deliberately reverting the `statusEl` fix on a branch
  fails this test in CI.

### Stage 6 — Sim purity refactor
- `tick()` takes a `SimState` and `InputFrame`, mutates the state. No
  module-level game state.
- Adds the `sim.test.ts` scripted-input cases.
- **Acceptance:** all module-level mutable game state is gone from `main.ts`;
  the only mutable globals are DOM handles and the rAF id.

After Stage 6, the codebase is ready for the architecture's Phase C (worker
+ SAB) without further restructuring.

---

## 7. Risks and tradeoffs

- **Bundle size.** Vite + a tree-shaken Preact-free build of the current
  ~950-line script comes in well under the 35 KB compressed budget from
  architecture §1. TypeScript adds zero runtime weight. The risk is
  `tsconfig.target` — pin to ES2022 so downlevel transforms don't bloat.
- **Source maps in production.** Off by default; expose via `?debug=1` if
  we want them. Privacy: no, source maps are public anyway in a public repo.
- **Pages deploy path change.** Stage 1 changes the deploy artifact from
  the repo root to `dist/`. This is the only stage that's not "drop-in",
  and the workflow change is one line in `pages.yml`. Test on the branch
  before merging.
- **`const enum` vs string-literal-union for `Action`.** Const enums
  inline at compile time but break under `isolatedModules: true`, which
  Vite uses. String-literal union is the safe pick for now.
- **Seeded determinism.** The current RNG seed comes from `Math.random()`
  at module load. For replay support (architecture §16), the seed needs to
  be stored and replayable. Stage 6 surfaces it explicitly in `newGame(seed)`.

---

## 8. Open questions for @elgeffe

1. **Where to host once Phase C lands?** GitHub Pages can't set COOP/COEP
   headers, which `SharedArrayBuffer` requires. Options: Cloudflare Pages
   (`_headers`), Vercel (`vercel.json`), Netlify (`_headers`). All are free
   for this scale. Worth deciding before Stage 1 is finalized so the
   `pages.yml` changes don't have to be redone.
2. **`docs/` scope.** Is this folder for design docs only (this file,
   future architecture revisions), or also for ADRs / runbooks /
   release notes? Recommend the broad version — one folder, dated
   `YYYY-MM-DD-<slug>.md` files, no subfolders until there are >20.
3. **CI cost ceiling.** Playwright pulls a chromium binary on every CI
   run unless cached. Two free options: Playwright's own CI cache action,
   or a custom `actions/cache` step. Either is fine; just want a thumbs-up
   that adding ~30 s of CI time on every push is acceptable.

---

## 9. Estimate

Stages 1–5 are roughly a day of focused work end-to-end. Stage 6 is
another half day. They can ship across multiple PRs without blocking play.
