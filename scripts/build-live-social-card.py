#!/usr/bin/env python3
"""Generate the 2026 championship or 2024 historical social card.

The board is an abstract checker pattern, not a reported match position.
The image makes no prediction, model-performance or physical-timing claim.
Pillow 12.0.0 and DejaVu system fonts are pinned by the Pages workflow.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets/live-share-cover.png"
FONTS = Path("/usr/share/fonts/truetype/dejavu")
DISPLAY = FONTS / "DejaVuSans-Bold.ttf"
BODY = FONTS / "DejaVuSans.ttf"

INK = "#f4f4f4"
MUTED = "#c4c4c4"
ACCENT = "#f1f1f1"
BACKGROUND = "#181818"
BORDER = "#454545"
LIGHT = "#e8e8e8"
DARK = "#969696"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    """Use installed system fonts; never vendor proprietary font files."""
    if not path.is_file():
        raise FileNotFoundError(f"Missing system font: {path.name}")
    return ImageFont.truetype(str(path), size)


def draw_card(output: Path, *, historical: bool = False) -> None:
    """Render a 1200 × 630 flat-color invitation and atomically replace output."""
    image = Image.new("RGB", (1200, 630), BACKGROUND)
    canvas = ImageDraw.Draw(image)
    canvas.rectangle((0, 0, 1199, 8), fill=ACCENT)

    canvas.text((63, 43), "GRANDMASTER  /  MODEL", font=font(DISPLAY, 24), fill=INK)
    players = "DING LIREN  /  GUKESH D" if historical else "GUKESH D  /  JAVOKHIR SINDAROV"
    canvas.text((64, 91), players,
                font=font(BODY, 18), fill=ACCENT)
    canvas.line((64, 140, 1139, 140), fill=BORDER, width=2)

    canvas.text((56, 168), "WHAT'S", font=font(DISPLAY, 102), fill=INK)
    canvas.text((56, 291), "YOUR MOVE?", font=font(DISPLAY, 82), fill=ACCENT)
    invitation = "Play three positions from the 2024 world-title match." if historical else "Play a move on the 2026 world-title board."
    canvas.text((63, 435), invitation,
                font=font(BODY, 20), fill=INK)
    answer = "Compare your moves with the recorded game." if historical else "See the official broadcast's answer."
    canvas.text((63, 469), answer,
                font=font(BODY, 20), fill=MUTED)

    # Deliberately schematic board: no claimed position, model score or move.
    left, top, square = 803, 171, 42
    canvas.rectangle((left-6, top-6, left+341, top+341), fill="#414141")
    for rank in range(8):
        for file in range(8):
            x, y = left+file*square, top+rank*square
            canvas.rectangle((x, y, x+square-1, y+square-1),
                             fill=LIGHT if (rank+file) % 2 == 0 else DARK)
    canvas.rectangle((885, 253, 1056, 428), fill=BACKGROUND)
    canvas.rectangle((894, 262, 1047, 419), outline=ACCENT, width=4)
    canvas.text((936, 263), "?", font=font(DISPLAY, 126), fill=ACCENT)

    canvas.line((64, 535, 1139, 535), fill=BORDER, width=2)
    year = 2024 if historical else 2026
    canvas.text((64, 553), f"WORLD CHESS CHAMPIONSHIP {year}  /  FREE TO PLAY",
                font=font(BODY, 16), fill=ACCENT)
    canvas.text((64, 594), "fraware.github.io/grandmaster-vs-model",
                font=font(BODY, 14), fill=MUTED)

    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_name(output.name + ".tmp")
    try:
        image.save(tmp, format="PNG", optimize=True)
        tmp.replace(output)
    finally:
        tmp.unlink(missing_ok=True)
    print(f"Created {output} ({output.stat().st_size} bytes, 1200x630)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT,
                        help="Destination PNG (default: assets/live-share-cover.png)")
    parser.add_argument("--historical", action="store_true", help="Render the 2024 challenge preview")
    args = parser.parse_args()
    draw_card(args.out, historical=args.historical)


if __name__ == "__main__":
    main()
