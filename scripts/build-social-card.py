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
    canvas = Image.new('RGB', (1200, 630), '#121e19')
    draw = ImageDraw.Draw(canvas)
    ink, accent, sage = '#eaeedf', '#def47c', '#74876c'
    draw.rectangle((0, 0, 1200, 9), fill=accent)
    draw.rectangle((0, 9, 1200, 10), fill='#334b39')
    draw.text((78, 65), 'G R A N D M A S T E R   v s   M O D E L', font=font(SANS_BOLD, 16), fill=ink)
    draw.line((78, 126, 123, 126), fill=accent, width=4)
    draw.text((78, 161), 'GPT scored 3/3.', font=font(SERIF, 59), fill=ink)
    draw.text((78, 245), 'Can you match it?', font=font(ITALIC, 57), fill=accent)
    draw.text((80, 380), 'Three real World Championship moves.', font=font(SANS, 21), fill='#c2cfbf')
    draw.text((80, 417), 'One-minute challenge. No signup.', font=font(SANS, 21), fill='#c2cfbf')
    draw.rectangle((78, 502, 488, 559), fill=accent)
    draw.text((100, 519), 'PLAY THE THREE-MOVE CHALLENGE', font=font(SANS_BOLD, 17), fill='#121e19')
    draw.text((80, 585), 'RETROSPECTIVE 2024 GAME · TESTED IN 2026  /  OPEN SOURCE', font=font(SANS_BOLD, 12), fill='#abc19b')
    # The illustration is a chess motif, not a claim of a particular position.
    bx, by, tile = 798, 109, 42
    draw.rectangle((bx-12, by-12, bx+tile*8+12, by+tile*8+12), fill='#304634')
    for rank in range(8):
        for file in range(8):
            fill = '#e2e5d6' if (rank+file)%2==0 else sage
            draw.rectangle((bx+file*tile, by+rank*tile, bx+(file+1)*tile-1, by+(rank+1)*tile-1), fill=fill)
    # A single symbolic knight silhouette keeps the graphic illustrative.
    draw.text((864, 185), '♞', font=font(SANS, 176), fill='#18271d')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print(f'Wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
