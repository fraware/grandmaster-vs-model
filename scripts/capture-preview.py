#!/usr/bin/env python3
"""Generate the repository's actual first-screen Chromium preview.

Dependencies: playwright==1.57.0 and Pillow==12.0.0.
The source is served locally; no network data, user account, or model calls
are involved. This checks the board fits inside the desktop first viewport.
"""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from threading import Thread

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "preview.webp"
VIEWPORT = {"width": 1440, "height": 900}


class QuietHandler(SimpleHTTPRequestHandler):
    """Serve project files without recording each static asset request."""

    def log_message(self, format: str, *args: object) -> None:
        pass


def main() -> None:
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT))
    )
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, args=["--no-sandbox"]
            )
            try:
                page = browser.new_page(
                    viewport=VIEWPORT, device_scale_factor=1,
                    reduced_motion="reduce"
                )
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(
                    f"http://127.0.0.1:{server.server_port}/",
                    wait_until="load", timeout=15000
                )
                page.locator("#challenge-board .challenge-square").first.wait_for(
                    timeout=10000
                )
                page.wait_for_function(
                    "document.querySelectorAll('#challenge-board .challenge-square').length === 64",
                    timeout=10000,
                )
                page.evaluate("document.fonts.ready")
                bounds = page.locator("#challenge-board").bounding_box()
                if bounds is None or bounds["y"] + bounds["height"] > VIEWPORT["height"] - 16:
                    raise AssertionError(
                        f"Playable board exceeds first viewport: {bounds}"
                    )
                if errors:
                    raise AssertionError(f"JavaScript error: {errors[0]}")
                image_bytes = page.screenshot(full_page=False, animations="disabled")
                OUTPUT.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(BytesIO(image_bytes)) as image:
                    image.convert("RGB").save(OUTPUT, "WEBP", quality=87, method=6)
                print(f"Captured {OUTPUT.relative_to(ROOT)} at {VIEWPORT['width']}x{VIEWPORT['height']}")
                print(f"Board bottom: {bounds['y'] + bounds['height']:.1f}px")
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


if __name__ == "__main__":
    main()
