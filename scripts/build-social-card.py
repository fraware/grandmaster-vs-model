#!/usr/bin/env python3
"""Render the editorial website's 1200×630 social-preview image.

This artwork is a typographic invitation, not a purported championship
position or a claim about prospective model accuracy. Requires Pillow >= 10.
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
    """Load common OS fonts without distributing licensed font binaries."""
    if not Path(path).is_file():
        raise FileNotFoundError(f'Missing system font: {path}')
    return ImageFont.truetype(path, size)


def main() -> None:
    paper, ink, oxblood, muted, rule = '#F6F1E8', '#191715', '#6B2F2A', '#6F675D', '#D5CAB9'
    image = Image.new('RGB', (1200, 630), paper)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 11, 630), fill=oxblood)
    draw.text((75, 54), 'GRANDMASTER   /   MODEL', font=font(SANS_BOLD, 18), fill=ink)
    draw.line((75, 103, 1120, 103), fill=rule, width=2)

    draw.text((71, 157), 'Could you match', font=font(SERIF, 58), fill=ink)
    draw.text((71, 242), 'a world champion?', font=font(ITALIC, 60), fill=oxblood)
    draw.text((77, 362), 'Three positions from a real World Championship final.', font=font(SANS, 21), fill=muted)
    draw.text((77, 400), 'Predict the move. Reveal the answer. Share your score.', font=font(SANS, 21), fill=muted)

    # A single knight serves as an editorial symbol, never as a game-position diagram.
    draw.text((874, 132), '♞', font=font(SANS, 236), fill=oxblood)
    draw.line((75, 493, 1120, 493), fill=rule, width=2)
    draw.text((76, 518), 'Play free. No account.', font=font(SANS_BOLD, 19), fill=ink)
    draw.text((76, 565), 'fraware.github.io/grandmaster-vs-model', font=font(SANS, 18), fill=oxblood)
    draw.text((840, 581), '2024 game · 2026 retrospective test', font=font(SANS, 13), fill=muted)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(f'Wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
