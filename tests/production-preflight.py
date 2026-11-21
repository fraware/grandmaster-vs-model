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

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from typing import Any

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "data" / "broadcast-2026.json"
SITE_BASE = "https://fraware.github.io/grandmaster-vs-model/"
ARTIFACT_DIR = Path("artifacts/production-preflight")


def select_target(instant: datetime) -> dict[str, Any]:
    """Select the exact pinned round for a given aware UTC instant.

    The chosen session is based on the published schedule, never an inference
    that players have physically started their game.
    """
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("Round selection needs a timezone-aware instant")
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    rounds = registry.get("rounds")
    if registry.get("schema") != "championship-broadcast-registry-v1" or (
        registry.get("event") != "fide-world-championship-2026"
        or not isinstance(rounds, list) or len(rounds) != 14
    ):
        raise ValueError("Invalid pinned championship registry")
    previous = None
    for i, round_data in enumerate(rounds, start=1):
        when = datetime.fromisoformat(round_data["startsAt"].replace("Z", "+00:00"))
        if round_data.get("game") != i or when.tzinfo is None or (
            previous is not None and when <= previous
        ) or not round_data.get("pgnUrl", "").startswith(
            "https://lichess.org/api/broadcast/round/"
        ):
            raise ValueError("Invalid championship round schedule or source")
        previous = when
    target = next(
        (
            row for row in rounds
            if instant < datetime.fromisoformat(
                row["startsAt"].replace("Z", "+00:00")
            ) + timedelta(hours=11)
        ),
        rounds[-1],
    )
    return {
        "game": target["game"],
        "roundId": target["roundId"],
        "scheduledStartAt": target["startsAt"],
        "site": SITE_BASE + f'lab.html?mode=live&game={target["game"]}#experiment',
        "source": target["pgnUrl"],
    }


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
        "site": None,
        "source": None,
        "game": None,
        "roundId": None,
        "scheduledStartAt": None,
        "checkedAt": _utc_now(),
        "result": "pending",
        "browser": "Chromium via Playwright 1.57",
        "physicalMoveTimeCertified": False,
        "providerRequests": 0,
    }
    try:
        target = select_target(datetime.now(timezone.utc))
        report.update(target)
        site_url = target["site"]
        broadcast_url = target["source"]
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
                broadcast_responses: list[dict[str, Any]] = []
                page.on("pageerror", lambda error: errors.append(str(error)[:300]))

                def record_broadcast_response(response: Any) -> None:
                    """Observe the application's own PGN request without issuing another."""
                    if response.url.split("?", 1)[0] == broadcast_url:
                        broadcast_responses.append({
                            "ok": 200 <= response.status < 300,
                            "status": response.status,
                            "contentType": response.headers.get("content-type"),
                            "capture": "passive network observation",
                        })

                page.on("response", record_broadcast_response)
                page.goto(site_url, wait_until="domcontentloaded", timeout=30_000)
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
                    "selectedGame": page.locator("#game-select").input_value(),
                    "modeLive": page.locator("#tab-live").get_attribute("aria-pressed"),
                    "boardSquares": page.locator("#board button.square").count(),
                    "spectatorPanel": page.locator("#spectator-panel").is_visible(),
                }
                report["pageErrors"] = errors

                # The application has already requested the official PGN
                # from the actual Pages origin. Its DOM confirms whether CORS
                # permitted parsing; the browser's response event supplies the
                # HTTP metadata. A second fetch would unnecessarily increase
                # unauthenticated traffic to the public Lichess API.
                browser_fetch = broadcast_responses[-1] if broadcast_responses else {
                    "ok": False,
                    "capture": "passive network observation",
                    "reason": "No app-origin broadcast response observed",
                }
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
                if report["page"]["selectedGame"] != str(target["game"]):
                    raise AssertionError(
                        "The deployed page selected a different championship game"
                    )
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

                # An independent publisher embeds the public historical
                # challenge directly. This checks real GitHub Pages framing
                # headers and actual CSS/JS from the deployed HTTPS origin.
                # The embedded challenge uses archival data only: no added
                # requests to Lichess or any model provider.
                embed_page = browser.new_page(
                    viewport={"width": 540, "height": 1100},
                    reduced_motion="reduce",
                    service_workers="block",
                )
                embed_errors: list[str] = []
                embed_page.on(
                    "pageerror",
                    lambda error: embed_errors.append(str(error)[:300]),
                )
                embed_url = SITE_BASE + "?embed=1#challenge"
                embed_page.set_content(
                    '<iframe title="World Championship chess challenge" '
                    'src="' + embed_url + '" '
                    'style="width:100%;height:1020px;border:0"></iframe>'
                )
                frame = embed_page.frame_locator("iframe")
                frame.locator(
                    "#challenge-board button.challenge-square"
                ).first.wait_for(timeout=20_000)
                frame.locator(
                    "#challenge-board button.challenge-square"
                ).nth(63).wait_for(timeout=20_000)
                report["embed"] = {
                    "url": embed_url,
                    "externalFrame": True,
                    "squares": frame.locator(
                        "#challenge-board button.challenge-square"
                    ).count(),
                    "siteHeaderHidden": frame.locator(
                        ".site-header"
                    ).is_hidden(),
                    "sourceLinked": frame.locator(
                        "#challenge-source"
                    ).is_visible(),
                    "fullGameLink": frame.locator(
                        "#embed-open-full"
                    ).get_attribute("href"),
                    "pageErrors": embed_errors,
                }
                embed_page.screenshot(
                    path=str(ARTIFACT_DIR / "embedded.png"),
                    animations="disabled",
                )
                if (
                    report["embed"]["squares"] != 64
                    or not report["embed"]["siteHeaderHidden"]
                    or not report["embed"]["sourceLinked"]
                    or embed_errors
                ):
                    raise AssertionError(
                        "Deployed embed failed source, layout, or script checks"
                    )
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
