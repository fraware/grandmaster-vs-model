"""Offline Chromium acceptance test for the spectator prediction experience.

Runs independently of external Lichess services and paid model APIs. All game
moves, timestamps and network failures are deterministic browser fixtures.
"""
from __future__ import annotations

from pathlib import Path
import runpy

from playwright.sync_api import sync_playwright

harness = runpy.run_path(str(Path(__file__).with_name("browser-smoke.py")))
page_sources = harness["page_sources"]
populate = harness["populate"]
PGN = harness["PGN"]


def run_spectator_test(browser) -> None:
    source = page_sources("lab")
    pregame = PGN.replace("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", "*")
    assert pregame != PGN
    for label, viewport in [
        ("desktop", {"width": 1280, "height": 900}),
        ("mobile", {"width": 390, "height": 844}),
    ]:
        page = browser.new_page(viewport=viewport, has_touch=(label == "mobile"))
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        populate(page, source, pgn=pregame, now_iso="2026-11-20T12:00:00Z")
        page.locator("#tab-live").click()
        assert "Your next move." in page.locator("#lab-title").text_content()
        assert "PREGAME" in page.locator("#spectator-phase").inner_text()
        assert page.locator("#bottom-player").inner_text() == "Javokhir Sindarov"
        assert page.locator("#top-player").inner_text() == "Gukesh D"
        assert "FIDE announced" in page.locator("#spectator-detail").inner_text()
        assert page.locator("#guess-area").is_visible()
        assert page.locator("#board button.square").count() == 64
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert page.locator("#spectator-share").is_visible()
        page.evaluate("""() => {
          window.__invitations = [];
          Object.defineProperty(navigator, 'share', {
            configurable:true, value:async ({text}) => {
              window.__invitations.push(text);
            }
          });
        }""")
        page.locator("#spectator-share").click()
        page.wait_for_function("() => window.__invitations.length === 1")
        first_invite = page.evaluate("window.__invitations[0]")
        assert "World Chess Championship 2026" in first_invite
        assert "What will White play first" in first_invite
        assert "mode=live&game=1#experiment" in first_invite
        assert "I have locked my own move" not in first_invite
        assert page.locator("#spectator-share-text").is_hidden()

        if label == "desktop":
            # One roving keyboard tab stop, with accessible arrows and Enter.
            page.locator('#board button.square[tabindex="0"]').focus()
            page.keyboard.press("ArrowRight")
            assert page.locator('#board button.square[data-visual="1"]').evaluate(
                "(node) => node === document.activeElement"
            )
            page.locator('#board button.square[data-square="e2"]').click()
            assert "legal-target" in page.locator(
                '#board button.square[data-square="e4"]'
            ).get_attribute("class")
            page.locator('#board button.square[data-square="e4"]').click()
        else:
            for sq in ("e2", "e4"):
                element = page.locator(f'#board button.square[data-square="{sq}"]')
                element.scroll_into_view_if_needed()
                bounds = element.bounding_box()
                assert bounds is not None
                page.touchscreen.tap(bounds["x"] + bounds["width"] / 2,
                                     bounds["y"] + bounds["height"] / 2)
        assert "Prediction locked." in page.locator("#spectator-message").text_content()
        if label == "mobile":
            # A board tap must reveal the locked result without manual
            # page searching. The viewport follows the move to its outcome.
            page.wait_for_function("""() => {
              const panel = document.getElementById('spectator-panel');
              const rect = panel.getBoundingClientRect();
              return rect.top >= 0 && rect.top < innerHeight - 90;
            }""", timeout=4000)
        assert "LOCKED" in page.locator("#decision-list").inner_text()
        assert page.locator("#guess-area").is_hidden()
        assert page.locator("#spectator-next").is_hidden()
        assert page.locator("#spectator-share").is_visible()
        page.locator("#spectator-share").click()
        page.wait_for_function("() => window.__invitations.length === 2")
        locked_invite = page.evaluate("window.__invitations[1]")
        assert "I have locked my own move in this browser." in locked_invite
        assert "mode=live&game=1#experiment" in locked_invite
        assert "e4" not in locked_invite
        assert "e2e4" not in locked_invite
        assert "My move:" not in locked_invite
        assert "lockedAt" not in locked_invite
        assert page.locator("#spectator-share-text").is_hidden()

        # A network failure leaves the choice unaltered and unscored.
        page.evaluate("window.__fixtureOnline = false")
        page.locator("#refresh-button").click()
        page.get_by_text("broadcast unavailable", exact=False).first.wait_for()
        assert "Prediction locked." in page.locator("#spectator-message").text_content()

        # An append-only official PGN later resolves the exact opening guess.
        page.evaluate("""({pgn,now}) => {
          window.__fixtureOnline = true;
          window.__fixturePgn = pgn;
          Date.now = () => Date.parse(now);
        }""", {"pgn": PGN, "now": "2026-11-24T14:10:00Z"})
        page.locator("#refresh-button").click()
        page.get_by_text("Exact match.", exact=False).first.wait_for()
        assert "1 matched / 1 resolved" in page.locator("#spectator-stats").inner_text()
        assert page.locator("#spectator-next").is_visible()
        assert "You matched the move." in page.locator("#result-title").text_content()
        assert "physical" in page.locator("#spectator-detail").inner_text()
        page.locator("#spectator-share").click()
        page.wait_for_function("() => window.__invitations.length === 3")
        resolved_invite = page.evaluate("window.__invitations[2]")
        assert "exact match with the sourced move" in resolved_invite
        assert "e4" not in resolved_invite
        assert "e2e4" not in resolved_invite

        # Continue from the resolved opening to the latest position.
        page.locator("#spectator-next").click()
        assert "LIVE" in page.locator("#spectator-phase").inner_text()
        assert "6 / 6 PLIES" in page.locator("#nav-position").inner_text()
        assert page.locator("#guess-area").is_visible()
        if label == "desktop":
            # Accessible move-list alternative to board input.
            page.locator("#guess-select").select_option("b5a4")
            page.locator("#guess-button").click()
        else:
            # A genuine pointer drag on the board selects one legal move.
            # The action panel is below the board on mobile. After clicking
            # "Continue", the board may be above the viewport; Playwright mouse
            # coordinates do not scroll the target into view automatically.
            page.locator("#board").scroll_into_view_if_needed()
            start = page.locator('#board button.square[data-square="b5"]').bounding_box()
            finish = page.locator('#board button.square[data-square="a4"]').bounding_box()
            assert start is not None and finish is not None
            assert 0 <= start["y"] < viewport["height"], start
            assert 0 <= finish["y"] < viewport["height"], finish
            page.mouse.move(start["x"] + start["width"]/2,
                            start["y"] + start["height"]/2)
            page.mouse.down()
            page.mouse.move(finish["x"] + finish["width"]/2,
                            finish["y"] + finish["height"]/2, steps=8)
            page.mouse.up()
        detail = page.locator("#spectator-message").text_content()
        assert "Prediction locked." in detail, (
            f"{label}: second move was not locked; spectator={detail}; "
            f"selector={page.locator('#guess-select').input_value()}; "
            f"phase={page.locator('#spectator-phase').inner_text()}"
        )
        assert "1 waiting" in page.locator("#spectator-stats").inner_text()

        next_pgn = PGN.replace("3. Bb5 a6 *", "3. Bb5 a6 4. Ba4 *")
        page.evaluate("(pgn) => { window.__fixturePgn = pgn; }", next_pgn)
        page.locator("#refresh-button").click()
        page.get_by_text("2 matched / 2 resolved", exact=False).first.wait_for()
        assert "Exact match." in page.locator("#spectator-message").text_content()

        # The scientific model count stays untouched by spectator predictions.
        assert page.locator("#model-attempt-total").inner_text() == "0"
        page.locator("#tab-archive").click()
        assert page.locator("#spectator-panel").is_hidden()
        page.locator("#tab-live").click()
        page.locator("#nav-start").click()
        assert "Exact match." in page.locator("#spectator-message").text_content()
        # A later round is pregame and must identify its own opening, not Game 1.
        page.locator("#game-select").select_option("2")
        assert "PREGAME" in page.locator("#spectator-phase").inner_text()
        assert "before Game 2." in page.locator("#spectator-detail").inner_text()
        assert page.locator("#bottom-player").inner_text() == "White player"
        assert page.locator("#top-player").inner_text() == "Black player"
        assert not errors, errors
        page.close()


def run_rate_limit_recovery_test(browser) -> None:
    """HTTP 429 freezes requests; an eventual source recovery retains the game."""
    source = page_sources("lab")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_default_timeout(10000)
    try:
        populate(page, source, pgn=PGN, now_iso="2026-11-24T14:10:00Z")
        page.locator("#tab-live").click()
        page.wait_for_function(
            "() => document.getElementById('source-status').textContent.includes('6 moves observed')"
        )
        assert page.locator("#nav-position").inner_text() == "6 / 6 PLIES"
        page.evaluate("""() => {
          window.__originalFetch = window.fetch;
          window.__rateLimitedCalls = 0;
          window.fetch = async (url, ...options) => {
            if (String(url).includes('lichess.org/api/broadcast/')) {
              window.__rateLimitedCalls += 1;
              return new Response('', {status:429,
                headers:{'Retry-After':'120'}});
            }
            return window.__originalFetch(url, ...options);
          };
        }""")
        page.locator("#refresh-button").click()
        page.wait_for_function(
            "() => document.getElementById('source-status').textContent.includes('rate-limited')"
        )
        assert page.locator("#refresh-button").is_disabled()
        assert page.evaluate("window.__rateLimitedCalls") == 1
        assert page.locator("#nav-position").inner_text() == "6 / 6 PLIES"
        assert page.locator("#board button.square").count() == 64

        # Retry-After is 120 seconds, longer than the one-minute minimum.
        page.evaluate("Date.now = () => Date.parse('2026-11-24T14:11:00Z')")
        page.locator("#nav-start").click()
        assert page.locator("#refresh-button").is_disabled()
        assert page.evaluate("window.__rateLimitedCalls") == 1

        page.evaluate("""() => {
          Date.now = () => Date.parse('2026-11-24T14:12:01Z');
          window.fetch = window.__originalFetch;
        }""")
        page.locator("#nav-end").click()
        assert page.locator("#refresh-button").is_enabled()
        page.locator("#refresh-button").click()
        page.wait_for_function(
            "() => document.getElementById('source-status').textContent.includes('6 moves observed')"
        )
        assert page.locator("#board button.square").count() == 64
        assert page.locator("#guess-area").is_visible()
        assert page.evaluate("window.__rateLimitedCalls") == 1
    finally:
        page.close()


def run_round_switch_during_fetch_test(browser) -> None:
    """Switching rounds while a PGN request is pending fetches the new round."""
    source = page_sources("lab")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_default_timeout(10000)
    game_two = PGN.replace('[Round "1"]', '[Round "2"]').replace(
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *', '1. d4 *'
    )
    try:
        populate(page, source, now_iso="2026-11-24T14:10:00Z")
        page.evaluate("""({secondPgn}) => {
          const oldFetch = window.fetch;
          let releaseFirst;
          const holdFirst = new Promise(resolve => { releaseFirst = resolve; });
          window.__releaseFirst = releaseFirst;
          window.__requestedRoundUrls = [];
          window.fetch = (url, ...opts) => {
            const destination = String(url);
            if (destination.includes('/xLgOJ6cb.pgn')) {
              window.__requestedRoundUrls.push('game1');
              return holdFirst.then(() => oldFetch(url, ...opts));
            }
            if (destination.includes('/L3j03TZq.pgn')) {
              window.__requestedRoundUrls.push('game2');
              return Promise.resolve(new Response(secondPgn, {status:200}));
            }
            return oldFetch(url, ...opts);
          };
        }""", {"secondPgn": game_two})
        page.locator("#tab-live").click()
        page.wait_for_function(
            "() => window.__requestedRoundUrls.includes('game1')"
        )
        page.locator("#game-select").select_option("2")
        assert page.locator("#game-select").input_value() == "2"
        page.evaluate("window.__releaseFirst()")
        page.wait_for_function(
            "() => window.__requestedRoundUrls.includes('game2')"
        )
        page.wait_for_function(
            "() => document.getElementById('source-status').textContent.includes('Game 2 · 1 moves observed')"
        )
        assert page.locator("#game-select").input_value() == "2"
        assert page.locator("#source-url").get_attribute("href").endswith(
            "/game-2/L3j03TZq"
        )
        assert page.locator("#board button.square").count() == 64
        assert page.evaluate("window.__requestedRoundUrls") == [
            "game1", "game2"
        ]
    finally:
        page.close()


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            run_spectator_test(browser)
            run_rate_limit_recovery_test(browser)
            run_round_switch_during_fetch_test(browser)
        finally:
            browser.close()
    print("Live spectator smoke: pregame lock, outage recovery, sourced reveal, continuation, mobile drag, and private model ledger passed.")


if __name__ == "__main__":
    main()
