# Tetra

A polished, mobile-first take on falling-blocks, designed as a PWA you install to your home screen.

> Live: **https://elgeffe.github.io/tetra/**  *(after first Pages deploy completes)*

## Status

This is **Phase B** of the architecture in `architecture_tetra.md` — the prototype's tuned mechanics
ported into a small, mobile-optimized HTML/CSS/JS app, plus PWA shell, touch gestures, safe-area
handling, wake lock, and haptics. The worker + SAB + WebGL layers (Phases C/D) come later.

## Touch controls

| Gesture | Action |
|---|---|
| Tap left half of board | Rotate counter-clockwise |
| Tap right half of board | Rotate clockwise |
| Drag horizontally | Move (1 cell per cell of finger travel) |
| Quick swipe down | Hard drop |
| Slow drag down | Soft drop (held while finger moves down) |
| Two-finger tap | Hold piece |
| Pause button | Pause / resume |

Direct horizontal drag (rather than DAS) is used for touch — it's the modern mobile-Tetris idiom
and feels more precise than trying to time a held press.

## Keyboard (desktop)

`←` `→` move · `↓` soft drop · `Space` hard drop · `↑`/`X` rotate CW · `Z` rotate CCW
`Shift`/`C` hold · `P` pause · `R` reset

## Local preview

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy

`.github/workflows/pages.yml` deploys to GitHub Pages on push to `main` or
`claude/github-pages-mobile-ux-IKNS7`.

**One-time setup (required):** GitHub doesn't let `GITHUB_TOKEN` enable Pages
on a repo where it's never been turned on, so before the first deploy can
succeed:

1. Go to **Settings → Pages** on the repo.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Re-run the failing workflow (Actions tab → latest run → "Re-run all jobs"),
   or push another commit.

## Files

- `index.html` — app shell (~2 KB)
- `style.css` — design tokens + responsive layout (mobile-first, landscape, tablet/desktop)
- `game.js` — simulation, renderer, touch + keyboard input
- `manifest.webmanifest` — PWA manifest, fullscreen display
- `sw.js` — service worker (cache-first for app shell, SWR for fonts)
- `icons/` — PNG icons (192, 512, 512-maskable, apple-touch)
- `build-icons.py` — regenerates icons from a Pillow drawing
