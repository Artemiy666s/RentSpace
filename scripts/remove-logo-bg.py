"""Remove checkerboard / flat background from logo-mark source PNG."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def is_background(r: int, g: int, b: int) -> bool:
    mx, mn = max(r, g, b), min(r, g, b)
    # Desaturated light pixels (checkerboard white / gray)
    if mx - mn <= 28 and mn >= 165:
        return True
    # Common checkerboard tones
    if (r, g, b) in {
        (255, 255, 255),
        (254, 254, 254),
        (253, 253, 253),
        (204, 204, 204),
        (192, 192, 192),
        (191, 191, 191),
        (190, 190, 190),
        (220, 220, 220),
        (238, 238, 238),
        (240, 240, 240),
        (245, 245, 245),
        (250, 250, 250),
    }:
        return True
    return False


def process(src: Path, dest: Path) -> None:
    img = Image.open(src).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b):
                px[x, y] = (r, g, b, 0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, format='PNG', optimize=True)
    print(f'Saved transparent logo: {dest} ({w}x{h})')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'client/public/images/logo-mark-source.png'
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'client/public/images/logo-mark.png'
    process(src, dest)
