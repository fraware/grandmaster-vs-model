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
        assert "Your next move." in page.locator("#lab-title").inner_text()
        assert "PREGAME" in page.locator("#spectator-phase").inner_text()
        assert page.locator("#guess-area").is_visible()
        assert page.locator("#board button.square").count() == 64
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

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
        assert "Prediction locked." in page.locator("#spectator-message").inner_text()
        assert "LOCKED" in page.locator("#decision-list").inner_text()
        assert page.locator("#guess-area").is_hidden()
        assert page.locator("#spectator-next").is_hidden()
        assert page.locator("#spectator-share").is_visible()

        # A network failure leaves the choice unaltered and unscored.
        page.evaluate("window.__fixtureOnline = false")
        page.locator("#refresh-button").click()
        page.get_by_text("broadcast unavailable", exact=False).first.wait_for()
        assert "Prediction locked." in page.locator("#spectator-message").inner_text()

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
        assert "You matched the move." in page.locator("#result-title").inner_text()
        assert "physical" in page.locator("#spectator-detail").inner_text()

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
            page.evaluate("""() => {
              window.__dragTrace = [];
              for (const kind of ['pointerdown','pointerup','click']) {
                window.addEventListener(kind, e => {
                  const at = document.elementFromPoint(e.clientX,e.clientY);
                  window.__dragTrace.push({
                    kind, target:e.target?.dataset?.square??null,
                    at:at?.closest?.('#board button.square')?.dataset?.square??null,
                    x:e.clientX,y:e.clientY,pointerId:e.pointerId??null
                  });
                }, true);
              }
            }""")
            start = page.locator('#board button.square[data-square="b5"]').bounding_box()
            finish = page.locator('#board button.square[data-square="a4"]').bounding_box()
            assert start is not None and finish is not None
            page.mouse.move(start["x"] + start["width"]/2,
                            start["y"] + start["height"]/2)
            page.mouse.down()
            page.mouse.move(finish["x"] + finish["width"]/2,
                            finish["y"] + finish["height"]/2, steps=8)
            page.mouse.up()
        detail = page.locator("#spectator-message").inner_text()
        assert "Prediction locked." in detail, (
            f"{label}: second move was not locked; spectator={detail}; "
            f"selector={page.locator('#guess-select').input_value()}; "
            f"phase={page.locator('#spectator-phase').inner_text()}; "
            f"trace={page.evaluate('window.__dragTrace || []')}"
        )
        assert "1 waiting" in page.locator("#spectator-stats").inner_text()

        next_pgn = PGN.replace("3. Bb5 a6 *", "3. Bb5 a6 4. Ba4 *")
        page.evaluate("(pgn) => { window.__fixturePgn = pgn; }", next_pgn)
        page.locator("#refresh-button").click()
        page.get_by_text("2 matched / 2 resolved", exact=False).first.wait_for()
        assert "Exact match." in page.locator("#spectator-message").inner_text()

        # The scientific model count stays untouched by spectator predictions.
        assert page.locator("#model-attempt-total").inner_text() == "0"
        page.locator("#tab-archive").click()
        assert page.locator("#spectator-panel").is_hidden()
        page.locator("#tab-live").click()
        page.locator("#nav-start").click()
        assert "Exact match." in page.locator("#spectator-message").inner_text()
        assert not errors, errors
        page.close()


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            run_spectator_test(browser)
        finally:
            browser.close()
    print("Live spectator smoke: pregame lock, outage recovery, sourced reveal, continuation, mobile drag, and private model ledger passed.")


if __name__ == "__main__":
    main()
