#!/usr/bin/env python3
"""Capture the actual spectator website with a deterministic pregame PGN fixture.

The resulting images display an illustrative, not yet played 2026 position.
No external APIs or provider credentials are used. Requires Playwright 1.57
and Pillow 12 with Chromium.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import runpy

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
harness = runpy.run_path(str(ROOT / "tests" / "browser-smoke.py"))
page_sources = harness["page_sources"]
populate = harness["populate"]
PGN = harness["PGN"]


def main() -> None:
    pregame = PGN.replace("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", "*")
    if pregame == PGN:
        raise AssertionError("Expected pregame fixture has played moves")
    source = page_sources("lab")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            for name, viewport in (
                ("live-preview.webp", {"width": 1440, "height": 900}),
                ("live-preview-mobile.webp", {"width": 390, "height": 844}),
            ):
                page = browser.new_page(viewport=viewport, device_scale_factor=1,
                                        reduced_motion="reduce")
                try:
                    errors: list[str] = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    populate(page, source, pgn=pregame,
                             now_iso="2026-11-20T12:00:00Z")
                    page.locator("#tab-live").click()
                    page.get_by_text("How will White open?", exact=False).first.wait_for()
                    if errors:
                        raise AssertionError(f"JavaScript errors: {errors}")
                    if page.evaluate("document.documentElement.scrollWidth > window.innerWidth"):
                        raise AssertionError(f"Horizontal overflow at {viewport}")
                    data = page.screenshot(full_page=False, animations="disabled")
                    output = ROOT / "assets" / name
                    output.parent.mkdir(parents=True, exist_ok=True)
                    with Image.open(BytesIO(data)) as image:
                        image.convert("RGB").save(output, "WEBP", quality=87, method=6)
                    board = page.locator("#board").bounding_box()
                    print(f"Captured {output.name} at {viewport}: board={board}")
                finally:
                    page.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
