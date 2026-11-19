"""Optional desktop/mobile Chromium smoke tests using synthetic network responses.

Install Python Playwright and a compatible Chromium binary. Local ``set_content``
keeps this test usable in environments that block navigation to localhost.
This is a DOM/UI integration test, not a real broadcast-network test.

    python -m pip install playwright
    python -m playwright install chromium
    python tests/browser-smoke.py

Set CHROMIUM_PATH to use a system Chromium binary. Set GVM_SCREENSHOT_DIR to
write desktop/mobile screenshots for visual inspection.
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


def make_page_sources() -> tuple[str, str, dict]:
    """Compose the site's actual modules without importing outside JavaScript."""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>{css}</style>')
    html = html.replace('<script type="module" src="app.mjs"></script>', '')
    sources = []
    for relative in ('src/chess.mjs', 'src/pgn.mjs', 'src/broadcast.mjs', 'app.mjs'):
        module = (ROOT / relative).read_text(encoding='utf-8')
        module = re.sub(r'^import .*?;\s*$', '', module, flags=re.M)
        module = re.sub(r'\bexport\s+(?=(?:const|function|async|class)\b)', '', module)
        sources.append(module)
    responses = {
        './data/archive-2024.json': json.loads((ROOT / 'data/archive-2024.json').read_text()),
        './data/match.json': json.loads((ROOT / 'data/match.json').read_text()),
        './data/live-game1.json': json.loads((ROOT / 'data/live-game1.json').read_text()),
    }
    return html, '\n'.join(sources), responses


def populate(page, html: str, script: str, responses: dict, *, online: bool = True) -> None:
    """Inject a deterministic, documented PGN without contacting Lichess."""
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
    page.locator('#board button.square').first.wait_for(timeout=5000)
    page.wait_for_timeout(250)


def main() -> None:
    html, script, responses = make_page_sources()
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path'] = os.environ['CHROMIUM_PATH']
    screenshot_dir = os.environ.get('GVM_SCREENSHOT_DIR')
    if screenshot_dir:
        Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        try:
            for label, viewport in [('desktop', {'width': 1440, 'height': 900}),
                                    ('mobile', {'width': 390, 'height': 844})]:
                page = browser.new_page(viewport=viewport)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                populate(page, html, script, responses)
                page.locator('#tab-archive').click()
                assert page.locator('#board button.square').count() == 64
                assert 'Ding' in page.locator('#result-title').inner_text()
                assert '116 PLIES' in page.locator('#nav-position').inner_text()
                if screenshot_dir:
                    page.screenshot(path=str(Path(screenshot_dir) / f'{label}-archive.png'), full_page=True)
                if label == 'desktop':
                    page.locator('#guess-select').select_option('f4f2')
                    page.locator('#guess-button').click()
                    assert 'LOCKED' in page.locator('#decision-list').inner_text()
                    page.locator('#reveal-button').click()
                    assert 'MATCH' in page.locator('#decision-list').inner_text()
                    page.locator('#nav-next').click()
                    assert page.locator('#nav-position').inner_text().startswith('109 /')
                    page.locator('#tab-live').click()
                    assert 'Broadcast move · 3…a6' in page.locator('#result-title').inner_text()
                    page.locator('#nav-back').click()
                    assert 'a6' in page.locator('#result-title').inner_text()
                    if screenshot_dir:
                        page.screenshot(path=str(Path(screenshot_dir) / 'desktop-live.png'), full_page=True)
                else:
                    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                assert not errors, errors
                page.close()

            outage = browser.new_page(viewport={'width': 1280, 'height': 800})
            populate(outage, html, script, responses, online=False)
            outage.locator('#tab-live').click()
            assert 'Broadcast unavailable' in outage.locator('#source-status').inner_text()
            outage.close()

            cached = dict(responses)
            cached['./data/live-game1.json'] = {
                'schema': 'broadcast-snapshot-v1',
                'roundId': 'xLgOJ6cb',
                'source': 'https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn',
                'fetchedAt': '2026-11-24T14:04:03.000Z',
                'game': {'white': 'Gukesh D', 'black': 'Javokhir Sindarov',
                         'result': '*', 'moves': ['e2e4', 'e7e5']},
            }
            fallback = browser.new_page(viewport={'width': 1280, 'height': 800})
            populate(fallback, html, script, cached, online=False)
            fallback.locator('#tab-live').click()
            assert '2 cached broadcast moves' in fallback.locator('#source-status').inner_text()
            assert '1…e5' in fallback.locator('#result-title').inner_text()
            fallback.close()
        finally:
            browser.close()
    print('Chromium smoke: desktop and mobile UI, legal guess/reveal, mocked 2026 broadcast, and outage cache fallback passed.')


if __name__ == '__main__':
    main()
