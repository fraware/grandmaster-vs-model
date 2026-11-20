"""Real-origin browser acceptance for returning championship spectators.

This exercises Chromium localStorage and storage events on the actual site
origin, served entirely from local fixtures. No real Lichess or model API
requests occur. Synthetic PGN moves are explicitly test fixtures.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import runpy

from playwright.sync_api import sync_playwright

harness = runpy.run_path(str(Path(__file__).with_name("browser-smoke.py")))
page_sources = harness["page_sources"]
PGN = harness["PGN"]
URL = "https://fraware.github.io/grandmaster-vs-model/lab.html"
SITE = URL + "?mode=live&game=1#experiment"
KEY = "grandmaster-vs-model:live-choices:v1"
PRE_GAME = PGN.replace("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", "*")


def open_fixture_page(context, source, *, pgn=PRE_GAME,
                      clock="2026-11-20T12:00:00Z", url=SITE,
                      before_script=None):
    """Open a routed secure-origin page with deterministic fetch and clock."""
    html, script, responses = source
    page = context.new_page()
    page.set_default_timeout(10000)
    page.route("**/*", lambda route: route.abort())
    page.route(
        re.compile(r"^https://fraware\.github\.io/grandmaster-vs-model/lab\.html(?:\?.*)?$"),
        lambda route: route.fulfill(
            status=200, content_type="text/html; charset=utf-8", body=html
        ),
    )
    page.goto(url, wait_until="domcontentloaded", timeout=15000)
    assert page.evaluate("window.location.origin") == "https://fraware.github.io"
    page.evaluate("""({responses,pgn,clock}) => {
      window.history.replaceState = () => {};
      Date.now = () => Date.parse(clock);
      window.__fixturePgn = pgn;
      window.fetch = async url => {
        const key = String(url);
        if (Object.prototype.hasOwnProperty.call(responses,key)) {
          return new Response(JSON.stringify(responses[key]), {status:200});
        }
        if (key.includes('lichess.org/api/broadcast/')) {
          return new Response(window.__fixturePgn, {status:200});
        }
        throw new Error('Unexpected resource '+key);
      };
    }""", {"responses": responses, "pgn": pgn, "clock": clock})
    if before_script:
        before_script(page)
    page.add_script_tag(content=script)
    page.locator("#board button.square").first.wait_for()
    page.locator("#spectator-panel").wait_for(state="visible")
    return page


def local_choices(page):
    """Read only the browser's non-sensitive, recreational prediction data."""
    raw = page.evaluate("(key) => localStorage.getItem(key)", KEY)
    return json.loads(raw) if raw else []


def test_close_reopen_and_reveal(browser):
    """Locked opening survives tab closure, then reveals and continues."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900},
                              accept_downloads=True)
    source = page_sources("lab")
    try:
        first = open_fixture_page(ctx, source)
        assert first.locator("#spectator-storage-note").inner_text().startswith(
            "Saved in this browser across visits"
        )
        assert local_choices(first) == []
        for square in ("e2", "e4"):
            first.locator(f'#board button.square[data-square="{square}"]').click()
        first.get_by_text("Prediction locked.", exact=False).first.wait_for()
        saved = local_choices(first)
        assert len(saved) == 1 and saved[0]["uci"] == "e2e4"
        assert first.locator("#spectator-calendar").is_visible()
        with first.expect_download() as event:
            first.locator("#spectator-calendar").click()
        download = event.value
        assert download.suggested_filename == "grandmaster-vs-model-game-1.ics"
        calendar = Path(download.path()).read_bytes().decode("utf-8")
        assert "DTSTART:20261124T140000Z\r\n" in calendar
        assert "TRIGGER:-PT15M\r\n" in calendar
        assert "game=1#experiment\r\n" in calendar.replace("\r\n ", "")
        assert "e2e4" not in calendar
        assert "Calendar file prepared." in first.locator(
            "#spectator-calendar-status"
        ).inner_text()
        first.close()

        # Fresh tab and fresh JS session, unchanged browser profile and origin.
        second = open_fixture_page(
            ctx, source, pgn=PGN, clock="2026-11-24T14:10:00Z"
        )
        second.get_by_text("Exact match.", exact=False).first.wait_for()
        assert "0 / 6 PLIES" in second.locator("#nav-position").inner_text()
        assert "1 matched / 1 resolved" in second.locator("#spectator-stats").inner_text()
        assert second.locator("#spectator-next").is_visible()
        assert second.locator("#guess-area").is_hidden()
        assert second.locator("#spectator-calendar").is_hidden()
        assert local_choices(second) == saved
        second.locator("#spectator-next").click()
        assert "6 / 6 PLIES" in second.locator("#nav-position").inner_text()
        second.locator("#guess-select").select_option("b5a4")
        second.locator("#guess-button").click()
        second.get_by_text("Prediction locked.", exact=False).first.wait_for()
        assert len(local_choices(second)) == 2
        second.close()

        third = open_fixture_page(
            ctx, source, pgn=PGN, clock="2026-11-24T14:15:00Z"
        )
        assert "6 / 6 PLIES" in third.locator("#nav-position").inner_text()
        assert "1 waiting" in third.locator("#spectator-stats").inner_text()
        assert "Prediction locked." in third.locator("#spectator-message").text_content()
        next_pgn = PGN.replace("3. Bb5 a6 *", "3. Bb5 a6 4. Ba4 *")
        third.evaluate("(pgn) => { window.__fixturePgn = pgn; }", next_pgn)
        third.locator("#refresh-button").click()
        third.get_by_text("2 matched / 2 resolved", exact=False).first.wait_for()
        assert "6 / 7 PLIES" in third.locator("#nav-position").inner_text()
        third.close()

        # An explicitly requested position has precedence over saved reveals.
        direct = open_fixture_page(
            ctx, source, pgn=next_pgn, clock="2026-11-24T14:20:00Z",
            url=URL + "?mode=live&game=1&ply=7#experiment",
        )
        assert "7 / 7 PLIES" in direct.locator("#nav-position").inner_text()
        assert direct.locator("#guess-area").is_visible()
        assert "2 matched / 2 resolved" in direct.locator("#spectator-stats").inner_text()
        assert local_choices(direct)[0] == saved[0]
        direct.close()
    finally:
        ctx.close()


def test_live_cross_tab_sync(browser):
    """Another open tab receives a browser storage change without reload."""
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    source = page_sources("lab")
    try:
        left = open_fixture_page(ctx, source)
        right = open_fixture_page(ctx, source)
        assert right.locator("#guess-area").is_visible()
        for square in ("e2", "e4"):
            left.locator(f'#board button.square[data-square="{square}"]').click()
        right.get_by_text("Prediction locked.", exact=False).first.wait_for()
        assert right.locator("#guess-area").is_hidden()
        assert left.locator("#spectator-message").inner_text() == (
            right.locator("#spectator-message").inner_text()
        )
        assert local_choices(right)[0]["uci"] == "e2e4"
    finally:
        ctx.close()


def test_legacy_migration(browser):
    """Old tab-only data imports without modifying the original tab record."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    source = page_sources("lab")
    legacy = [{
        "schema": "spectator-session-v1", "game": 1, "ply": 1,
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "uci": "d2d4",
        "source": "https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn",
        "lockedAt": "2026-11-19T17:00:00.000Z",
    }]
    try:
        def seed(page):
            page.evaluate(
                """({key,records}) => sessionStorage.setItem(
                  key, JSON.stringify(records))""",
                {"key": KEY, "records": legacy}
            )
        page = open_fixture_page(ctx, source, before_script=seed)
        page.get_by_text("Prediction locked.", exact=False).first.wait_for()
        assert local_choices(page) == legacy
        assert json.loads(page.evaluate(
            "(key) => sessionStorage.getItem(key)", KEY
        )) == legacy
        page.close()
        later = open_fixture_page(ctx, source)
        later.get_by_text("Prediction locked.", exact=False).first.wait_for()
        assert "d4" in later.locator("#spectator-message").text_content()
        assert local_choices(later) == legacy
    finally:
        ctx.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--no-sandbox"]
        )
        try:
            test_close_reopen_and_reveal(browser)
            test_live_cross_tab_sync(browser)
            test_legacy_migration(browser)
        finally:
            browser.close()
    print("Returning spectator: durable origin storage, migrated tabs, "
          "same-origin cross-tab update, real page reload and sourced reveal passed.")


if __name__ == "__main__":
    main()
