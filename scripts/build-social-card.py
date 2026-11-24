#!/usr/bin/env python3
"""Regenerate the historical README/link-preview asset with the shared renderer."""
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    renderer = runpy.run_path(str(ROOT / "scripts/build-live-social-card.py"))
    renderer["draw_card"](ROOT / "assets/share-cover.png", historical=True)


if __name__ == "__main__":
    main()
