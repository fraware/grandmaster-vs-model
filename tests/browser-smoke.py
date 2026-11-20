"""Offline, reproducible end-to-end smoke tests of the public entrance and lab.

Tests the real HTML, CSS and browser JS against fixed local response fixtures.
It does not establish the availability of external broadcast or model APIs.

Requires ``pip install playwright`` and Chromium. An installed system browser
can be selected with CHROMIUM_PATH. Optional GVM_SCREENSHOT_DIR saves QA captures.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PGN = '''[Event "FIDE World Chess Championship 2026"]
[White "Gukesh D"]
[Black "Javokhir Sindarov"]
[Round "1"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'''


def page_sources(kind: str) -> tuple[str, str, dict]:
    """Bundle existing ES modules strictly for the local DOM harness."""
    if kind not in ('home', 'lab'):
        raise ValueError('Unknown page kind')
    html_file = 'index.html' if kind == 'home' else 'lab.html'
    css_file = 'landing.css' if kind == 'home' else 'style.css'
    main_js = 'src/home.mjs' if kind == 'home' else 'app.mjs'
    html = (ROOT / html_file).read_text(encoding='utf-8')
    css = (ROOT / css_file).read_text(encoding='utf-8')
    html = html.replace(f'<link rel="stylesheet" href="{css_file}" />', f'<style>{css}</style>')
    html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" /><base href="https://fraware.github.io/grandmaster-vs-model/" />')
    html = html.replace(f'<script type="module" src="{main_js}"></script>', '')
    module_names = ['src/chess.mjs', 'src/pgn.mjs']
    if kind == 'lab':
        module_names += ['src/match-2026.mjs', 'src/protocol.mjs', 'src/collection.mjs', 'src/broadcast.mjs', 'src/history.mjs']
    module_names += ['src/challenge.mjs', 'src/retro-view.mjs', 'src/challenge-ui.mjs', main_js]
    source = []
    for relative in module_names:
        module = (ROOT / relative).read_text(encoding='utf-8')
        module = re.sub(r'^import .*?;\s*$', '', module, flags=re.M)
        module = re.sub(r'\bexport\s+(?=(?:const|function|async|class)\b)', '', module)
        source.append(module)
    responses = {
        './data/archive-2024.json': json.loads((ROOT / 'data/archive-2024.json').read_text()),
        './data/championship-2024.json': json.loads((ROOT / 'data/championship-2024.json').read_text()),
        './data/match.json': json.loads((ROOT / 'data/match.json').read_text()),
        './data/live-game1.json': json.loads((ROOT / 'data/live-game1.json').read_text()),
        './data/models.json': json.loads((ROOT / 'data/models.json').read_text()),
        './data/collection.json': json.loads((ROOT / 'data/collection.json').read_text()),
        './data/broadcast-2026.json': json.loads((ROOT / 'data/broadcast-2026.json').read_text()),
        './data/retrospective-2024.json': json.loads((ROOT / 'data/retrospective-2024.json').read_text()),
    }
    return html, '\n'.join(source), responses


def populate(page, source: tuple[str, str, dict], *, online: bool = True) -> None:
    """Install a deterministic network facade without touching provider secrets."""
    html, script, responses = source
    page.set_content(html)
    page.evaluate('''({responses,pgn,online}) => {
       window.history.replaceState = () => {};
       window.fetch = async (url) => {
         const key = String(url);
         if (Object.prototype.hasOwnProperty.call(responses, key)) {
           return new Response(JSON.stringify(responses[key]), {status: 200});
         }
         if (key.includes('lichess.org/api/broadcast/')) {
           if (!online) throw new Error('Broadcast network unavailable');
           return new Response(pgn, {status: 200});
         }
         throw new Error('Unexpected resource: ' + key);
       };
    }''', {'responses': responses, 'pgn': PGN, 'online': online})
    page.add_script_tag(content=script)
    ready = '#challenge-board button.challenge-square' if 'id="challenge-board"' in html else '#board button.square'
    page.locator(ready).first.wait_for(timeout=5000)
    page.wait_for_timeout(90)


def test_home(browser, screenshot_dir: str | None) -> None:
    source = page_sources('home')
    for label, viewport in [('desktop', {'width': 1440, 'height': 900}),
                            ('mobile', {'width': 390, 'height': 844}),
                            ('narrow', {'width': 320, 'height': 640})]:
        page = browser.new_page(viewport=viewport, accept_downloads=True, has_touch=label != 'desktop')
        page.set_default_timeout(9000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        populate(page, source)
        assert page.locator('#board').count() == 0, 'Main page must not duplicate the board'
        assert page.locator('#challenge-board button.challenge-square').count() == 64
        assert page.locator('#challenge-board button[tabindex="0"]').count() == 1
        first_cell = page.locator('#challenge-board button.challenge-square').first
        first_cell.focus()
        first_cell.press('ArrowRight')
        assert page.locator('#challenge-board button[data-visual="1"]').evaluate('(el) => el === document.activeElement'), 'Keyboard focus did not move'
        page.locator('#challenge-board button[data-visual="1"]').press('ArrowLeft')
        assert first_cell.evaluate('(el) => el === document.activeElement'), 'Keyboard focus did not return'
        assert page.locator('.challenge-step').count() == 3
        # Updating a choice must not destroy/recreate all sixty-four buttons.
        page.evaluate('window.__firstSquare = document.querySelector("#challenge-board .challenge-square")')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), label
        if label == 'desktop':
            # Critical first-impression constraint. No scrolling to see a full board.
            board_bounds = page.locator('#challenge-board').bounding_box()
            assert board_bounds is not None
            assert board_bounds['y'] + board_bounds['height'] <= viewport['height'] - 16, (
                f"Chessboard extends below first desktop viewport: {board_bounds}"
            )
        if screenshot_dir:
            page.screenshot(path=str(Path(screenshot_dir) / f'{label}-first.png'), full_page=True)
        # First prediction. Replayed position must show the chess move, not only highlights.
        # The move list is an intentional accessibility fallback, not a large
        # permanent control competing with the chessboard.
        assert not page.locator('#challenge-move-select').is_visible()
        # A first-time visitor plays directly on the board. The source square
        # highlights legal destinations, with no disclosure of the answer.
        if label == 'desktop':
            page.locator('#challenge-board button[data-square="b5"]').click()
            assert 'target' in page.locator('#challenge-board button[data-square="c3"]').get_attribute('class')
            page.locator('#challenge-board button[data-square="c3"]').click()
        else:
            for square in ('b5', 'c3'):
                cell = page.locator(f'#challenge-board button[data-square="{square}"]')
                cell.scroll_into_view_if_needed()
                rect = cell.bounding_box()
                assert rect is not None
                page.touchscreen.tap(rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2)
        assert 'white knight' in page.locator('#challenge-board button[aria-label^="c3,"]').get_attribute('aria-label'), 'Selected move preview did not move the piece'
        assert page.evaluate('window.__firstSquare === document.querySelector("#challenge-board .challenge-square")'), 'Selecting a move rebuilt the board'
        if screenshot_dir:
            page.screenshot(path=str(Path(screenshot_dir) / f'{label}-selected.png'), full_page=True)
        assert 'Nc3' in page.locator('#challenge-hint').inner_text()
        # One action: placing a legal move locks the prediction and automatically
        # reveals the recorded answer. No second "Reveal" click is needed.
        page.locator('#challenge-answer-result').get_by_text('Exact match.').wait_for(timeout=3500)
        assert page.locator('#challenge-reveal').is_hidden()
        if label != 'desktop':
            assert page.locator('#challenge-mobile-reveal').is_visible()
            assert 'Next position' in page.locator('#challenge-mobile-reveal').inner_text()
        assert 'Exact match.' in page.locator('#challenge-answer-result').text_content()
        assert 'GPT-6.2 Astra played Nc3' in page.locator('#challenge-model-pick').inner_text()
        assert 'white knight' in page.locator('#challenge-board button[aria-label^="c3,"]').get_attribute('aria-label')
        assert page.locator('#challenge-mobile-reveal').is_hidden() if label == 'desktop' else page.locator('#challenge-mobile-reveal').is_visible()
        (page.locator('#challenge-next') if label == 'desktop' else page.locator('#challenge-mobile-reveal')).click()
        if label == 'desktop':
            # Drag-and-drop must behave like chess software, not an HTML form.
            page.locator('#challenge-board button[data-square="f8"]').drag_to(
                page.locator('#challenge-board button[data-square="a8"]'), steps=14)
        else:
            for square in ('f8', 'a8'):
                cell = page.locator(f'#challenge-board button[data-square="{square}"]')
                rect = cell.bounding_box()
                assert rect is not None
                page.touchscreen.tap(rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2)
        assert page.locator('#challenge-move-select').input_value() == 'f8a8'
        page.locator('#challenge-answer-result').get_by_text('Exact match.').wait_for(timeout=3500)
        (page.locator('#challenge-next') if label == 'desktop' else page.locator('#challenge-mobile-reveal')).click()
        wrong = page.locator('#challenge-move-select option').evaluate_all('''options => options.map(o => o.value).find(v => v && v !== "f4f2")''')
        if not page.locator('#challenge-move-details').evaluate('(el) => el.open'):
            page.locator('#challenge-move-details summary').click()
        page.locator('#challenge-move-select').select_option(wrong)
        page.locator('#challenge-answer-result').get_by_text('Different move.').wait_for(timeout=3500)
        assert 'Different move.' in page.locator('#challenge-answer-result').text_content()
        (page.locator('#challenge-next') if label == 'desktop' else page.locator('#challenge-mobile-reveal')).click()
        assert '2 of 3.' in page.locator('#challenge-result-label').inner_text()
        assert page.locator('#challenge-prompt').is_hidden()
        assert page.locator('.challenge-result-tile').count() == 3
        assert page.locator('.challenge-result-tile.hit').count() == 2
        assert 'GPT' in page.locator('#challenge-versus-model').inner_text()
        assert '3/3' in page.locator('#challenge-versus-model').inner_text()
        assert page.locator('#challenge-result-evidence').is_visible()
        if label == 'mobile':
            # Native sharing is mocked locally: assert that the actual export
            # and accurate link are submitted together, not posted to a server.
            page.evaluate('''() => {
              window.__shared = null;
              Object.defineProperty(navigator, 'canShare', {
                configurable: true, value: o => o.files?.length === 1
              });
              Object.defineProperty(navigator, 'share', {
                configurable: true, value: async o => {
                  window.__shared = {text:o.text, fileName:o.files?.[0]?.name,
                    fileType:o.files?.[0]?.type, size:o.files?.[0]?.size};
                }
              });
            }''')
        page.locator('#challenge-share').click()
        if label == 'mobile':
            page.wait_for_function('window.__shared !== null', timeout=10000)
            shared = page.evaluate('window.__shared')
            assert '2/3 moves' in shared['text']
            assert '🟩🟩⬛' in shared['text']
            assert 'GPT-6.2 Astra went 3/3' in shared['text']
            assert shared['fileName'] == 'grandmaster-vs-model-score.png'
            assert shared['fileType'] == 'image/png' and shared['size'] > 1000
        else:
            share_text = page.locator('#challenge-share-text').input_value()
            assert '2/3 moves' in share_text
            assert '🟩🟩⬛' in share_text
            assert 'GPT-6.2 Astra went 3/3' in share_text
            assert 'grandmaster-vs-model/#challenge' in share_text
        with page.expect_download(timeout=10000) as info:
            page.locator('#challenge-download').click()
        download = info.value
        assert download.suggested_filename == 'grandmaster-vs-model-result.png'
        assert Path(download.path()).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
        assert tuple(int.from_bytes(Path(download.path()).read_bytes()[n:n+4], 'big') for n in (16, 20)) == (1200, 630)
        if screenshot_dir:
            page.screenshot(path=str(Path(screenshot_dir) / f'{label}-result.png'), full_page=True)
        # Continue into sourced historical positions not used in the GPT run.
        assert page.locator('#challenge-continue').is_visible()
        assert '3 of 15 positions explored' in page.locator('#challenge-run-progress').inner_text()
        page.locator('#challenge-continue').click()
        assert 'Round 2' in page.locator('#challenge-series').inner_text()
        assert '1 of 3' in page.locator('#challenge-count').inner_text()
        assert not page.locator('#challenge-mobile-reveal').is_visible()
        assert page.locator('#challenge-reveal').is_hidden()
        assert page.locator('#challenge-model-feedback').is_hidden()
        # Exercise an entire additional set. It must use archived moves and
        # never show the old GPT comparison for an untested position.
        for practice_round in range(3):
            details = page.locator('#challenge-move-details')
            if not details.evaluate('(el) => el.open'):
                page.locator('#challenge-move-details summary').click()
            first_legal = page.locator('#challenge-move-select option').evaluate_all('''options => options.map(o => o.value).find(v => v)''')
            page.locator('#challenge-move-select').select_option(first_legal)
            page.locator('#challenge-answer-result').get_by_text(re.compile(r'Exact match\.|Different move\.')).wait_for(timeout=3500)
            assert page.locator('#challenge-model-feedback').is_hidden()
            (page.locator('#challenge-next') if label == 'desktop' else page.locator('#challenge-mobile-reveal')).click()
        assert page.locator('#challenge-finished').is_visible()
        assert '6 of 15 positions explored' in page.locator('#challenge-run-progress').inner_text()
        assert page.locator('#challenge-versus').is_hidden()
        assert page.locator('#challenge-result-evidence').is_hidden()
        assert page.locator('#challenge-continue').is_visible()
        page.locator('#challenge-restart').click()
        assert 'Round 2' in page.locator('#challenge-series').inner_text()
        assert '1 of 3' in page.locator('#challenge-count').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert not errors, errors
        page.close()



def test_full_session_and_fast_input(browser) -> None:
    """All fifteen distinct positions are playable with no premature model score."""
    source = page_sources('home')
    page = browser.new_page(viewport={'width': 1280, 'height': 820})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    populate(page, source)

    # A rapid replacement must cancel the original pending commitment. This
    # tests a real timing hazard introduced by the one-action UX.
    page.locator('#challenge-move-details summary').click()
    alternative = page.locator('#challenge-move-select option').evaluate_all(
        '''options => options.map(x => x.value).find(x => x && x !== 'b5c3')''')
    page.evaluate('''({wrong, correct}) => {
      const chooser = document.getElementById('challenge-move-select');
      chooser.value = wrong;
      chooser.dispatchEvent(new Event('change', {bubbles: true}));
      chooser.value = correct;
      chooser.dispatchEvent(new Event('change', {bubbles: true}));
    }''', {'wrong': alternative, 'correct':'b5c3'})
    page.locator('#challenge-answer-result').get_by_text('Exact match.').wait_for(timeout=3500)
    assert page.locator('#challenge-count').inner_text() == '1 of 3'
    assert 'Nc3' in page.locator('#challenge-answer-move').inner_text()
    page.close()

    # Full, deterministic walk through five separate three-move rounds.
    page = browser.new_page(viewport={'width': 1280, 'height': 820})
    page.on('pageerror', lambda error: errors.append(str(error)))
    populate(page, source)
    page.set_default_timeout(5000)
    for deck in range(5):
        assert page.locator('#challenge-series').inner_text() == f'Round {deck + 1}'
        for position in range(3):
            # Execute the same DOM events without repeatedly scrolling the
            # page. Human tap/drag interactions are covered in test_home.
            page.evaluate('''() => {
              const select = document.querySelector('#challenge-move-select');
              select.value = [...select.options].find(o => o.value).value;
              select.dispatchEvent(new Event('change', {bubbles:true}));
            }''')
            page.wait_for_function('document.querySelector("#challenge-feedback").hidden === false',timeout=3500)
            assert page.locator('#challenge-reveal').is_hidden()
            if deck:
                assert page.locator('#challenge-model-feedback').is_hidden()
            page.evaluate('document.querySelector("#challenge-next").click()')
        assert page.locator('#challenge-finished').is_visible()
        assert f'{(deck + 1) * 3} of 15 positions explored' in page.locator('#challenge-run-progress').inner_text()
        if deck != 4:
            page.locator('#challenge-continue').click()
        else:
            assert 'Start a fresh run' in page.locator('#challenge-continue').inner_text()
            page.locator('#challenge-continue').click()
            assert page.locator('#challenge-series').inner_text() == 'Round 1'
            assert page.locator('#challenge-result-label').is_hidden()
            assert page.locator('#challenge-board button.challenge-square').count() == 64
    assert not errors, errors
    page.close()


def test_lab(browser, screenshot_dir: str | None) -> None:
    source = page_sources('lab')
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    populate(page, source)
    assert page.locator('#challenge-board').count() == 0
    page.locator('#tab-archive').click()
    assert page.locator('#board button.square').count() == 64
    assert page.locator('.model-card').count() == 3
    assert '116 PLIES' in page.locator('#nav-position').inner_text()
    if screenshot_dir:
        page.screenshot(path=str(Path(screenshot_dir) / 'lab-archive.png'), full_page=True)
    page.locator('#guess-select').select_option('f4f2')
    page.locator('#guess-button').click()
    assert 'LOCKED' in page.locator('#decision-list').inner_text()
    page.locator('#reveal-button').click()
    assert 'MATCH' in page.locator('#decision-list').inner_text()
    # Historical selector must expose every game with correct identity and move history.
    assert page.locator('#game-select option').count() == 14
    expected_games = source[2]['./data/championship-2024.json']['games']
    for record in expected_games:
        page.locator('#game-select').select_option(str(record['game']))
        assert f'0 / {record["plyCount"]} PLIES' in page.locator('#nav-position').inner_text()
        assert page.locator('#source-url').get_attribute('href') == record['source']
        assert page.locator('#board button.square').count() == 64
    page.locator('#game-select').select_option('1')
    assert 'Game 1/14' in page.locator('#source-status').inner_text()
    assert '0 / 84 PLIES' in page.locator('#nav-position').inner_text()
    assert page.locator('#source-url').get_attribute('href').endswith('/G2R2lPcA/TAq3z9DR')
    page.locator('#nav-end').click()
    assert '84 / 84 PLIES' in page.locator('#nav-position').inner_text()
    page.locator('#game-select').select_option('13')
    assert '0 / 136 PLIES' in page.locator('#nav-position').inner_text()
    page.locator('#game-select').select_option('14')
    assert '0 / 116 PLIES' in page.locator('#nav-position').inner_text()
    page.locator('#tab-live').click()
    page.wait_for_function("document.getElementById('result-title').textContent.includes('Broadcast move')", timeout=5000)
    assert 'Broadcast move · 3…a6' in page.locator('#result-title').inner_text()
    # Every prospective round uses a confirmed, distinct source URL.
    registry = source[2]['./data/broadcast-2026.json']['rounds']
    for record in registry:
        page.locator('#game-select').select_option(str(record['game']))
        assert page.locator('#source-url').get_attribute('href') == record['url']
        assert page.locator('#board button.square').count() == 64
    if screenshot_dir:
        page.screenshot(path=str(Path(screenshot_dir) / 'lab-live.png'), full_page=True)
    assert not errors, errors
    page.close()
    outage = browser.new_page()
    populate(outage, source, online=False)
    outage.locator('#tab-live').click()
    assert 'broadcast unavailable' in outage.locator('#source-status').inner_text().lower()
    outage.close()


def main() -> None:
    screenshot_dir = os.environ.get('GVM_SCREENSHOT_DIR')
    if screenshot_dir:
        Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path'] = os.environ['CHROMIUM_PATH']
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        try:
            test_home(browser, screenshot_dir)
            if os.environ.get("GVM_EXTENDED_BROWSER") == "1":
                test_full_session_and_fast_input(browser)
            test_lab(browser, screenshot_dir)
        finally:
            browser.close()
    print('Chromium smoke: separate homepage/lab, desktop/mobile/narrow challenge, result card, share, and live-source fixture passed.')


if __name__ == '__main__':
    main()
