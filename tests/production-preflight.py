#!/usr/bin/env python3
"""Credential-free production preflight for the deployed chess spectator page.

Unlike offline browser fixtures, this checks the actual GitHub Pages origin and
the real cross-origin Lichess broadcast endpoint from Chromium. It neither
issues model requests nor asserts that the broadcast precedes physical play.

Install with:
    python -m pip install playwright==1.57.0
    python -m playwright install chromium
    python tests/production-preflight.py
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

from playwright.sync_api import sync_playwright

SITE_URL = (
    "https://fraware.github.io/grandmaster-vs-model/"
    "lab.html?mode=live&game=1#experiment"
)
BROADCAST_URL = "https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn"
ARTIFACT_DIR = Path("artifacts/production-preflight")


def _utc_now() -> str:
    """Timestamp the observation, without asserting physical move timing."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _record_failure(report: dict[str, Any], exc: BaseException) -> None:
    """Keep diagnostic categories without leaking response bodies or secrets."""
    report["result"] = "failed"
    report["failure"] = {
        "type": type(exc).__name__,
        "message": str(exc)[:800],
    }


def run() -> int:
    """Return a nonzero exit status if real deployed-source access fails."""
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "schema": "production-browser-preflight-v1",
        "site": SITE_URL,
        "source": BROADCAST_URL,
        "checkedAt": _utc_now(),
        "result": "pending",
        "browser": "Chromium via Playwright 1.57",
        "physicalMoveTimeCertified": False,
        "providerRequests": 0,
    }
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, args=["--no-sandbox"]
            )
            try:
                page = browser.new_page(
                    viewport={"width": 1440, "height": 900},
                    reduced_motion="reduce",
                    service_workers="block",
                )
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)[:300]))
                page.goto(SITE_URL, wait_until="domcontentloaded", timeout=30_000)
                page.locator("#board button.square").first.wait_for(timeout=20_000)
                page.wait_for_function(
                    "() => document.querySelectorAll('#board button.square').length === 64",
                    timeout=20_000,
                )
                page.wait_for_function(
                    """() => {
                      const source = document.getElementById('source-status')?.textContent || '';
                      // An existing cached-at timestamp is not proof that the
                      // page's own current cross-origin fetch has completed.
                      return /\\d+ moves observed · checked/.test(source) ||
                        /broadcast unavailable|direct refresh unavailable/i.test(source);
                    }""",
                    timeout=20_000,
                )
                status = page.locator("#source-status").inner_text()
                report["page"] = {
                    "title": page.title(),
                    "sourceStatus": status,
                    "gameOptions": page.locator("#game-select option").count(),
                    "modeLive": page.locator("#tab-live").get_attribute("aria-pressed"),
                    "boardSquares": page.locator("#board button.square").count(),
                    "spectatorPanel": page.locator("#spectator-panel").is_visible(),
                }
                report["pageErrors"] = errors

                # This must execute from GitHub Pages, not through a Python HTTP
                # client. The same-origin browser policy is part of the test.
                browser_fetch = page.evaluate(
                    """async (url) => {
                      const start = performance.now();
                      try {
                        const response = await fetch(url, {
                          cache: 'no-store',
                          headers: {Accept: 'application/x-chess-pgn'},
                          signal: AbortSignal.timeout(12000),
                        });
                        const payload = await response.text();
                        return {
                          ok: response.ok,
                          status: response.status,
                          contentType: response.headers.get('content-type'),
                          bytes: payload.length,
                          elapsedMs: Math.round(performance.now()-start),
                        };
                      } catch(error) {
                        return {
                          ok: false,
                          exception: String(error?.name || 'Error'),
                          reason: String(error?.message || 'fetch failed').slice(0,200),
                          elapsedMs: Math.round(performance.now()-start),
                        };
                      }
                    }""",
                    BROADCAST_URL,
                )
                report["broadcastFetch"] = browser_fetch
                page.screenshot(
                    path=str(ARTIFACT_DIR / "desktop.png"),
                    animations="disabled",
                )
                page.set_viewport_size({"width": 390, "height": 844})
                page.screenshot(
                    path=str(ARTIFACT_DIR / "mobile.png"),
                    animations="disabled",
                )
                report["mobileHorizontalOverflow"] = page.evaluate(
                    "() => document.documentElement.scrollWidth > window.innerWidth"
                )

                if report["page"]["modeLive"] != "true":
                    raise AssertionError("Deployed site did not enter live mode")
                if report["page"]["gameOptions"] != 14:
                    raise AssertionError("Deployed game registry is incomplete")
                if not report["page"]["spectatorPanel"]:
                    raise AssertionError("Deployed spectator challenge did not mount")
                if errors:
                    raise AssertionError("Client-side JavaScript raised errors")
                if not browser_fetch.get("ok"):
                    raise AssertionError(
                        "Lichess broadcast fetch failed from the Pages origin "
                        "(possible CORS, HTTP, or connectivity issue)"
                    )
                if "moves observed" not in status or "checked" not in status:
                    raise AssertionError(
                        "Deployed app did not complete its own cross-origin "
                        "broadcast refresh; cached source timestamps do not count"
                    )
                if report["mobileHorizontalOverflow"]:
                    raise AssertionError("Mobile layout has horizontal overflow")
                report["result"] = "passed"
            finally:
                browser.close()
    except Exception as error:
        _record_failure(report, error)
    finally:
        report["finishedAt"] = _utc_now()
        (ARTIFACT_DIR / "result.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["result"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(run())
