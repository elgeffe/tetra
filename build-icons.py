#!/usr/bin/env python3
"""Generate PWA icons for Tetra.

Outputs:
  icons/icon-192.png
  icons/icon-512.png
  icons/icon-512-maskable.png  (with safe-area padding)
  icons/apple-touch-icon.png   (180x180, no transparency)
"""
from PIL import Image, ImageDraw

BG       = (10, 10, 14, 255)         # --bg
ACCENT   = (245, 200, 66, 255)       # --accent
P_T      = (178, 102, 224, 255)      # --p-t
P_I      = (76, 201, 214, 255)       # --p-i
P_O      = (230, 200, 74, 255)       # --p-o
P_S      = (95, 207, 122, 255)       # --p-s
INK_DIM  = (107, 109, 122, 255)


def render_icon(size: int, maskable: bool = False, opaque: bool = False) -> Image.Image:
    img = Image.new('RGBA', (size, size), BG if opaque else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Maskable icons need a "safe zone" of ~80% diameter.
    safe = size if not maskable else int(size * 0.78)
    inset = (size - safe) // 2

    # Background plate (rounded-square for non-maskable, full square for maskable
    # — the platform crops the maskable one).
    if maskable:
        d.rectangle([0, 0, size, size], fill=BG)
    else:
        radius = int(size * 0.18)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    # Build a 4x4 grid representing a T-tetromino on top of an I-piece slab —
    # reads as the brand mark at small sizes.
    grid = [
        # row of 4 cells, value: 0 empty, 1 T, 2 I-bar, 3 accent dot
        [0, 1, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [2, 2, 2, 2],
    ]
    cell = safe // 4
    pad  = max(2, cell // 12)
    ox = inset + (safe - cell * 4) // 2
    oy = inset + (safe - cell * 4) // 2

    color_map = {1: P_T, 2: P_I}
    for ry, row in enumerate(grid):
        for rx, v in enumerate(row):
            if v == 0:
                continue
            x0 = ox + rx * cell + pad
            y0 = oy + ry * cell + pad
            x1 = ox + (rx + 1) * cell - pad
            y1 = oy + (ry + 1) * cell - pad
            color = color_map[v]
            d.rectangle([x0, y0, x1, y1], fill=color)
            # subtle highlight bar
            hl = max(1, cell // 10)
            d.rectangle(
                [x0, y0, x1, y0 + hl],
                fill=(255, 255, 255, 70),
            )
            # subtle shadow bar
            d.rectangle(
                [x0, y1 - hl, x1, y1],
                fill=(0, 0, 0, 90),
            )

    # Accent dot — the brand "TETRA." period
    dot_r = max(2, safe // 28)
    cx = ox + 4 * cell - cell // 4
    cy = oy + 2 * cell - cell // 4
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=ACCENT)

    return img


def main():
    import os
    os.makedirs('icons', exist_ok=True)
    render_icon(192).save('icons/icon-192.png', optimize=True)
    render_icon(512).save('icons/icon-512.png', optimize=True)
    render_icon(512, maskable=True).save('icons/icon-512-maskable.png', optimize=True)
    # Apple touch icon: opaque, 180x180 is the canonical size
    render_icon(180, opaque=True).convert('RGB').save(
        'icons/apple-touch-icon.png', optimize=True
    )
    # 16x16 / 32x32 favicons
    fav = render_icon(64).resize((32, 32), Image.LANCZOS)
    fav.save('icons/favicon-32.png', optimize=True)
    fav.resize((16, 16), Image.LANCZOS).save('icons/favicon-16.png', optimize=True)
    print('icons written')


if __name__ == '__main__':
    main()
