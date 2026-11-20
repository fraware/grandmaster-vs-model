#!/usr/bin/env python3
"""Render the site's 1200x630 scorecard-style social preview.

An abstract chessboard is decorative, not a purported game position. The image
contains no claim about prospective model accuracy. Pillow >= 10 and standard
DejaVu system fonts are sufficient; no binary font assets are distributed.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/share-cover.png"
FONT_ROOT = Path("/usr/share/fonts/truetype/dejavu")
DISPLAY = FONT_ROOT / "DejaVuSansCondensed-Bold.ttf"
BODY = FONT_ROOT / "DejaVuSans.ttf"
MONO = FONT_ROOT / "DejaVuSansMono.ttf"

BACKGROUND = "#101b1d"
PANEL = "#172629"
INK = "#f0f5ec"
MUTED = "#afc5bc"
SIGNAL = "#d7ed75"
RULE = "#35514e"
LIGHT = "#dbe6d6"
DARK = "#658c7b"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    """Load a system font that mirrors the website's local font hierarchy."""
    if not path.is_file():
        raise FileNotFoundError(f"Required system font not found: {path.name}")
    return ImageFont.truetype(str(path), size)


def main() -> None:
    """Generate a reproducible, flat-color chess scorecard invitation."""
    im = Image.new("RGB", (1200, 630), BACKGROUND)
    draw = ImageDraw.Draw(im)
    draw.rectangle((0, 0, 1200, 9), fill=SIGNAL)

    draw.text((64, 41), "GRANDMASTER  /  MODEL",
              font=font(DISPLAY, 24), fill=INK)
    draw.text((64, 82), "WORLD CHAMPIONSHIP CHESS CHALLENGE",
              font=font(MONO, 13), fill=SIGNAL)
    draw.line((64, 114, 1140, 114), fill=RULE, width=2)

    draw.text((61, 164), "WHAT WOULD",
              font=font(DISPLAY, 83), fill=INK, stroke_width=0)
    draw.text((61, 264), "YOU PLAY?",
              font=font(DISPLAY, 101), fill=SIGNAL)
    draw.text((67, 408), "Play a real position. Choose your move.",
              font=font(BODY, 20), fill=INK)
    draw.text((67, 443), "Reveal the grandmaster's answer.",
              font=font(BODY, 20), fill=MUTED)

    # Pattern only; without game pieces, clocks or score, this is never a
    # representation of a real or reconstructed championship board position.
    size, square, left, top = 336, 42, 804, 155
    draw.rectangle((left - 6, top - 6, left + size + 5, top + size + 5),
                   fill="#334e47")
    for rank in range(8):
        for file in range(8):
            color = LIGHT if (rank + file) % 2 == 0 else DARK
            x, y = left + file * square, top + rank * square
            draw.rectangle((x, y, x + square - 1, y + square - 1), fill=color)

    draw.line((64, 523, 1140, 523), fill=RULE, width=2)
    draw.text((65, 544), "2024 CHALLENGE  /  2026 LIVE BOARD",
              font=font(MONO, 17), fill=SIGNAL)
    draw.text((65, 584), "fraware.github.io/grandmaster-vs-model",
              font=font(MONO, 14), fill=MUTED)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
