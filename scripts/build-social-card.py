#!/usr/bin/env python3
"""Build the static 1200x630 social preview image.

Optional dependency: Pillow >= 10. No external services or fonts are bundled.
The original vector composition uses only chess symbols and project typography.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'share-cover.png'
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
ITALIC = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
SANS_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load commonly available system fonts without distributing font files."""
    if not Path(path).exists():
        raise FileNotFoundError(f'Missing system font: {path}')
    return ImageFont.truetype(path, size)


def main() -> None:
    canvas = Image.new('RGB', (1200, 630), '#f5f2eb')
    draw = ImageDraw.Draw(canvas)
    ink, accent, sage = '#292c26', '#98432e', '#7e896e'
    draw.rectangle((0, 0, 1200, 9), fill=ink)
    draw.rectangle((0, 9, 1200, 10), fill='#d9d9ce')
    draw.text((78, 65), 'G R A N D M A S T E R   v s   M O D E L', font=font(SANS_BOLD, 16), fill=ink)
    draw.line((78, 126, 123, 126), fill=accent, width=4)
    draw.text((78, 161), 'Can you think', font=font(SERIF, 61), fill=ink)
    draw.text((78, 245), 'like a grandmaster?', font=font(ITALIC, 58), fill=accent)
    draw.text((80, 380), 'Three real positions. Three predictions.', font=font(SANS, 23), fill='#5e625b')
    draw.text((80, 417), 'One score. Your move.', font=font(SANS, 23), fill='#5e625b')
    draw.rectangle((78, 502, 488, 559), fill=ink)
    draw.text((100, 519), 'PLAY THE THREE-MOVE CHALLENGE', font=font(SANS_BOLD, 17), fill='#f5f2eb')
    draw.text((80, 585), '2024 WORLD CHESS CHAMPIONSHIP FINAL  /  OPEN SOURCE', font=font(SANS_BOLD, 12), fill=accent)
    # The illustration is a chess motif, not a claim of a particular position.
    bx, by, tile = 798, 109, 42
    draw.rectangle((bx-12, by-12, bx+tile*8+12, by+tile*8+12), fill=ink)
    for rank in range(8):
        for file in range(8):
            fill = '#dcded2' if (rank+file)%2==0 else sage
            draw.rectangle((bx+file*tile, by+rank*tile, bx+(file+1)*tile-1, by+(rank+1)*tile-1), fill=fill)
    # A single symbolic knight silhouette keeps the graphic illustrative.
    draw.text((864, 185), '♞', font=font(SANS, 176), fill=ink)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print(f'Wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
