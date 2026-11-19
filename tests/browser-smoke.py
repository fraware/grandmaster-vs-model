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
        module_names += ['src/broadcast.mjs']
    module_names += ['src/challenge.mjs', 'src/challenge-ui.mjs', main_js]
    source = []
    for relative in module_names:
        module = (ROOT / relative).read_text(encoding='utf-8')
        module = re.sub(r'^import .*?;\s*$', '', module, flags=re.M)
        module = re.sub(r'\bexport\s+(?=(?:const|function|async|class)\b)', '', module)
        source.append(module)
    responses = {
        './data/archive-2024.json': json.loads((ROOT / 'data/archive-2024.json').read_text()),
        './data/match.json': json.loads((ROOT / 'data/match.json').read_text()),
        './data/live-game1.json': json.loads((ROOT / 'data/live-game1.json').read_text()),
        './data/models.json': json.loads((ROOT / 'data/models.json').read_text()),
        './data/collection.json': json.loads((ROOT / 'data/collection.json').read_text()),
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
        page = browser.new_page(viewport=viewport, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        populate(page, source)
        assert page.locator('#board').count() == 0, 'Main page must not duplicate the board'
        assert page.locator('#challenge-board button.challenge-square').count() == 64
        assert page.locator('.challenge-step').count() == 3
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), label
        if screenshot_dir:
            page.screenshot(path=str(Path(screenshot_dir) / f'{label}-first.png'), full_page=True)
        # First prediction. Replayed position must show the chess move, not only highlights.
        page.locator('#challenge-move-select').select_option('b5c3')
        assert 'Nc3' in page.locator('#challenge-hint').inner_text()
        if label == 'desktop':
            page.locator('#challenge-reveal').click()
        else:
            assert page.locator('#challenge-mobile-reveal').is_visible()
            page.locator('#challenge-mobile-reveal').click()
        assert 'Exact match.' in page.locator('#challenge-answer-result').text_content()
        assert 'white knight' in page.locator('#challenge-board button[aria-label^="c3,"]').get_attribute('aria-label')
        assert page.locator('#challenge-mobile-reveal').is_hidden()
        page.locator('#challenge-next').click()
        page.locator('#challenge-board button[aria-label^="f8,"]').click()
        page.locator('#challenge-board button[aria-label^="a8,"]').click()
        assert page.locator('#challenge-move-select').input_value() == 'f8a8'
        page.locator('#challenge-reveal').click()
        page.locator('#challenge-next').click()
        wrong = page.locator('#challenge-move-select option').evaluate_all('''options => options.map(o => o.value).find(v => v && v !== "f4f2")''')
        page.locator('#challenge-move-select').select_option(wrong)
        page.locator('#challenge-reveal').click()
        assert 'Different move.' in page.locator('#challenge-answer-result').text_content()
        page.locator('#challenge-next').click()
        assert '2 of 3.' in page.locator('#challenge-result-label').inner_text()
        assert page.locator('#challenge-prompt').is_hidden()
        assert page.locator('.challenge-result-tile').count() == 3
        assert page.locator('.challenge-result-tile.hit').count() == 2
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
            shared = page.evaluate('window.__shared')
            assert '2/3 moves' in shared['text']
            assert '🟩🟩⬛' in shared['text']
            assert shared['fileName'] == 'grandmaster-vs-model-score.png'
            assert shared['fileType'] == 'image/png' and shared['size'] > 1000
        else:
            share_text = page.locator('#challenge-share-text').input_value()
            assert '2/3 moves' in share_text
            assert '🟩🟩⬛' in share_text
            assert 'grandmaster-vs-model/#challenge' in share_text
        with page.expect_download(timeout=10000) as info:
            page.locator('#challenge-download').click()
        download = info.value
        assert download.suggested_filename == 'grandmaster-vs-model-result.png'
        assert Path(download.path()).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
        if screenshot_dir:
            page.screenshot(path=str(Path(screenshot_dir) / f'{label}-result.png'), full_page=True)
        page.locator('#challenge-restart').click()
        assert '1 OF 3' in page.locator('#challenge-count').inner_text()
        assert page.locator('#challenge-reveal').is_disabled()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
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
    page.locator('#tab-live').click()
    assert 'Broadcast move · 3…a6' in page.locator('#result-title').inner_text()
    if screenshot_dir:
        page.screenshot(path=str(Path(screenshot_dir) / 'lab-live.png'), full_page=True)
    assert not errors, errors
    page.close()
    outage = browser.new_page()
    populate(outage, source, online=False)
    outage.locator('#tab-live').click()
    assert 'Broadcast unavailable' in outage.locator('#source-status').inner_text()
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
            test_lab(browser, screenshot_dir)
        finally:
            browser.close()
    print('Chromium smoke: separate homepage/lab, desktop/mobile/narrow challenge, result card, share, and live-source fixture passed.')


if __name__ == '__main__':
    main()
