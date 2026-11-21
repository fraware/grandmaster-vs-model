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
    theme = (ROOT / 'theme.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="theme.css" />', f'<style>{theme}</style>')
    html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" /><base href="https://fraware.github.io/grandmaster-vs-model/" />')
    html = html.replace(f'<script type="module" src="{main_js}"></script>', '')
    module_names = ['src/chess.mjs', 'src/pgn.mjs']
    if kind == 'home':
        module_names += ['src/match-2026.mjs', 'src/home-entry.mjs']
    if kind == 'lab':
        module_names += ['src/match-2026.mjs', 'src/home-entry.mjs', 'src/live-poll.mjs', 'src/protocol.mjs', 'src/collection.mjs', 'src/broadcast.mjs', 'src/history.mjs', 'src/spectator.mjs', 'src/calendar.mjs']
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


def populate(page, source: tuple[str, str, dict], *, online: bool = True,
             pgn: str = PGN, now_iso: str | None = None,
             page_url: str | None = None) -> None:
    """Install a deterministic network facade without touching provider secrets."""
    html, script, responses = source
    if page_url is None:
        page.set_content(html)
    else:
        # Exercise actual query-string parsing without external requests.
        site = 'https://fraware.github.io/grandmaster-vs-model/'
        target_page = site if 'id="challenge-board"' in html else site + 'lab.html'
        if page_url.split('#', 1)[0].split('?', 1)[0] != target_page:
            raise ValueError('Unsupported offline browser test URL')
        def fulfill_local(route):
            if route.request.url.split('?', 1)[0] == target_page:
                route.fulfill(status=200, content_type='text/html', body=html)
            else:
                route.fulfill(status=404, body='')
        page.route(site + '**', fulfill_local)
        page.goto(page_url, wait_until='domcontentloaded')
    page.evaluate('''({responses,pgn,online,nowIso}) => {
       window.history.replaceState = () => {};
       window.__fixturePgn = pgn;
       window.__fixtureOnline = online;
       if (nowIso) Date.now = () => Date.parse(nowIso);
       window.fetch = async (url) => {
         const key = String(url);
         if (Object.prototype.hasOwnProperty.call(responses, key)) {
           return new Response(JSON.stringify(responses[key]), {status: 200});
         }
         if (key.includes('lichess.org/api/broadcast/')) {
           if (!window.__fixtureOnline) throw new Error('Broadcast network unavailable');
           return new Response(window.__fixturePgn, {status: 200});
         }
         throw new Error('Unexpected resource: ' + key);
       };
    }''', {'responses': responses, 'pgn': pgn, 'online': online, 'nowIso': now_iso})
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
        visual = page.evaluate("""() => ({
          background: getComputedStyle(document.body).backgroundColor,
          headingFont: getComputedStyle(document.querySelector('#hero-title')).fontFamily,
          light: getComputedStyle(document.querySelector('.challenge-square.light')).backgroundColor,
          dark: getComputedStyle(document.querySelector('.challenge-square.dark')).backgroundColor
        })""")
        assert visual['background'] == 'rgb(16, 27, 29)', visual
        assert 'Bahnschrift' in visual['headingFont'], visual
        assert visual['light'] == 'rgb(219, 230, 214)', visual
        assert visual['dark'] == 'rgb(101, 140, 123)', visual
        invitation = page.locator('#live-hero-link')
        assert invitation.is_visible(), 'Event-aware chess link must be visible on mobile'
        assert 'mode=live&game=' in invitation.get_attribute('href')
        assert invitation.bounding_box()['y'] < viewport['height'], 'Live entry must be above the fold'
        assert page.locator('#live-invite-link').count() == 1
        assert page.locator('#live-invite-title').inner_text()
        assert page.locator('#challenge-live-next-link').is_hidden()
        if label == 'desktop':
            historic_board = page.locator('#challenge-board').bounding_box()
            assert historic_board is not None
            assert historic_board['y'] + historic_board['height'] <= viewport['height'] - 16, (
                'Historic chessboard moved below the first desktop viewport'
            )
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
        # The completed historical game leads into the correctly scheduled 2026 board.
        event_link = page.locator('#challenge-live-next-link')
        assert event_link.is_visible()
        assert event_link.get_attribute('href') == page.locator('#live-hero-link').get_attribute('href')
        assert event_link.inner_text().strip()
        assert '2026' in page.locator('#challenge-live-next-status').inner_text()
        assert 'Gukesh vs Sindarov' in page.locator('.challenge-live-next-copy p').text_content()
        assert page.locator('#challenge-live-next-time').inner_text()
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
            assert '2/3 grandmaster moves' in shared['text']
            assert '?set=1&target=2#challenge' in shared['text']
            assert '🟩🟩⬛' in shared['text']
            assert 'GPT-6.2 Astra went 3/3' in shared['text']
            assert shared['fileName'] == 'grandmaster-vs-model-score.png'
            assert shared['fileType'] == 'image/png' and shared['size'] > 1000
        else:
            share_text = page.locator('#challenge-share-text').input_value()
            assert '2/3 grandmaster moves' in share_text
            assert '🟩🟩⬛' in share_text
            assert 'GPT-6.2 Astra went 3/3' in share_text
            assert 'grandmaster-vs-model/?set=1&target=2#challenge' in share_text
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

    # A compact laptop also displays the entire chessboard before scrolling.
    laptop = browser.new_page(viewport={'width': 1280, 'height': 800})
    try:
        populate(laptop, source)
        board = laptop.locator('#challenge-board').bounding_box()
        assert board is not None
        assert board['y'] + board['height'] <= 784, (
            f"Board exceeds 1280x800 laptop viewport: {board}"
        )
        assert laptop.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    finally:
        laptop.close()


def test_shared_peer_challenges(browser) -> None:
    """Real query links select the same sourced round and compare local scores.

    The incoming score is explicitly treated as user-editable and self-reported.
    No analytics, accounts, network requests, or public ranking are involved.
    """
    source = page_sources('home')
    site = 'https://fraware.github.io/grandmaster-vs-model/'
    games = source[2]['./data/championship-2024.json']['games']
    moves = games[13]['moves']
    practice_plies = [[12, 41, 84], [20, 48, 92],
                      [32, 67, 100], [36, 76, 104]]

    for label, viewport, set_number, target, exact in [
        ('desktop', {'width': 1280, 'height': 900}, 3, 2, True),
        ('mobile', {'width': 390, 'height': 844}, 5, 3, False),
    ]:
        page = browser.new_page(viewport=viewport, has_touch=(label == 'mobile'))
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            populate(page, source,
                     page_url=site + f'?set={set_number}&target={target}#challenge')
            assert page.locator('#challenge-series').inner_text() == f'Round {set_number}'
            assert page.locator('#challenge-peer-target').is_visible()
            assert f'{target}/3' in page.locator('#challenge-peer-target-text').inner_text()
            assert 'SELF-REPORTED' in page.locator('#challenge-peer-target').inner_text()
            assert page.locator('#challenge-model-feedback').is_hidden()
            assert page.locator('#challenge-board button.challenge-square').count() == 64
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')

            for ply in practice_plies[set_number - 2]:
                expected = moves[ply]['uci']
                select = page.locator('#challenge-move-select')
                if not page.locator('#challenge-move-details').evaluate('(node) => node.open'):
                    page.locator('#challenge-move-details summary').click()
                if exact:
                    selected = expected
                else:
                    selected = select.locator('option').evaluate_all(
                        '(opts, actual) => opts.map(o => o.value).find(v => v && v !== actual)',
                        expected)
                    assert selected
                select.select_option(selected)
                page.locator('#challenge-answer-result').get_by_text(
                    'Exact match.' if exact else 'Different move.').wait_for(timeout=3500)
                (page.locator('#challenge-next') if label == 'desktop'
                 else page.locator('#challenge-mobile-reveal')).click()
            assert page.locator('#challenge-finished').is_visible()
            assert page.locator('#challenge-result-label').inner_text() == (
                '3 of 3.' if exact else '0 of 3.')
            assert page.locator('#challenge-peer-outcome').is_visible()
            outcome = page.locator('#challenge-peer-outcome').inner_text()
            assert ('beat the shared' if exact else 'against the shared') in outcome
            assert 'self-reported' in outcome
            assert page.locator('#challenge-versus').is_hidden()

            page.evaluate("""() => {
              Object.defineProperty(navigator,'canShare',{
                configurable:true,value:() => false
              });
              Object.defineProperty(navigator,'share',{
                configurable:true,value:async data => {
                  window.__peerSharedText = data.text;
                }
              });
            }""")
            page.locator('#challenge-share').click()
            page.wait_for_function('typeof window.__peerSharedText === "string"')
            share_text = page.evaluate('window.__peerSharedText')
            assert (f'?set={set_number}&target={3 if exact else 0}#challenge'
                    in share_text)
            assert 'self-reported' in share_text
            assert 'GPT-6.2' not in share_text

            page.locator('#challenge-continue').click()
            assert page.locator('#challenge-peer-target').is_hidden()
            assert page.locator('#challenge-peer-outcome').is_hidden()
            assert not errors, errors
        finally:
            page.close()

    for query in ['?set=99&target=3', '?set=2&target=8',
                  '?set=2&target=2&target=3', '?set=03&target=2']:
        page = browser.new_page()
        try:
            populate(page, source, page_url=site + query + '#challenge')
            assert page.locator('#challenge-series').inner_text() == 'Round 1'
            assert page.locator('#challenge-peer-target').is_hidden()
        finally:
            page.close()


def test_embedded_challenge(browser) -> None:
    """An external site's iframe retains legal, independent chess play.

    This exercises the actual embedded DOM in a distinct origin with
    deterministic local game data. Deployed response headers are separately
    checked by the production preflight.
    """
    site = 'https://fraware.github.io/grandmaster-vs-model/'
    source = page_sources('home')
    html, script, responses = source

    for label, viewport, params, expected_set in [
        ('club', {'width': 540, 'height': 1060}, '?embed=1#challenge', 1),
        ('compact', {'width': 320, 'height': 740},
         '?embed=1&set=3&target=2#challenge', 3),
    ]:
        page = browser.new_page(viewport=viewport)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route(site + '**', lambda route: route.fulfill(
            status=200, content_type='text/html', body=html
        ))
        # This parent domain is deliberately distinct from the public
        # chess game's origin. The host needs no scripts or API credentials.
        parent = '<!doctype html><html><body style="margin:0">' + (
            '<iframe title="World Championship chess challenge" '
            'style="width:100%;height:1150px;border:0" src="' +
            site + params + '"></iframe></body></html>')
        page.route('https://chessclub.example/**', lambda route: route.fulfill(
            status=200, content_type='text/html', body=parent
        ))
        page.goto('https://chessclub.example/lesson')
        iframe = next(frame for frame in page.frames
                      if frame.url.startswith(site))
        iframe.wait_for_load_state('domcontentloaded')
        iframe.evaluate("""responses => {
          window.fetch = async url => {
            const key = String(url);
            if (!Object.prototype.hasOwnProperty.call(responses, key))
              throw new Error('Unexpected embedded resource: ' + key);
            return new Response(JSON.stringify(responses[key]), {status:200});
          };
        }""", responses)
        iframe.add_script_tag(content=script)
        frame = page.frame_locator('iframe')
        frame.locator('#challenge-board button.challenge-square').first.wait_for()
        assert frame.locator('#challenge-board button.challenge-square').count() == 64
        assert frame.locator('#challenge-series').inner_text() == f'Round {expected_set}'
        assert frame.locator('#embed-attribution').is_visible()
        assert frame.locator('#embed-open-full').is_visible()
        assert frame.locator('#challenge-source').is_visible()
        assert frame.locator('.site-header').is_hidden()
        assert frame.locator('.hero-topline').is_hidden()
        assert frame.locator('.live-invite').is_hidden()
        assert frame.locator('.site-footer').is_hidden()
        assert frame.locator('.challenge-frame').is_visible()
        assert frame.locator('#challenge-board').is_visible()
        assert frame.locator('#embed-open-full').get_attribute('target') == '_blank'
        assert frame.locator('#embed-open-full').get_attribute('rel') == 'noopener noreferrer'
        full_link = frame.locator('#embed-open-full').get_attribute('href')
        assert full_link is not None and 'embed=1' not in full_link
        if expected_set == 3:
            assert '?set=3&target=2#challenge' in full_link
            assert '2/3' in frame.locator('#challenge-peer-target').inner_text()
        else:
            assert full_link.endswith('/#challenge')
            assert frame.locator('#challenge-peer-target').is_hidden()
        assert iframe.evaluate(
            'document.documentElement.scrollWidth <= window.innerWidth'
        ), label

        # Play directly through the embedded board; no host integration.
        origin = frame.locator(
            '#challenge-board button[data-square="b5"]' if expected_set == 1
            else '#challenge-board button[data-square="e2"]'
        )
        # The first set's Nc3 uses b5→c3; any alternative set's legal
        # move list yields a valid deterministic first prediction.
        if expected_set == 1:
            origin.click()
            frame.locator('#challenge-board button[data-square="c3"]').click()
        else:
            frame.locator('#challenge-move-details summary').click()
            candidate = frame.locator('#challenge-move-select option').evaluate_all(
                '(options) => options.map(o => o.value).find(Boolean)'
            )
            frame.locator('#challenge-move-select').select_option(candidate)
        frame.locator('#challenge-answer-result').get_by_text(
            'Exact match.' if expected_set == 1 else
            'Exact match.|Different move.', exact=False
        ).wait_for(timeout=4000) if expected_set == 1 else iframe.wait_for_function(
            '() => document.getElementById("challenge-feedback").hidden === false',
            timeout=4000
        )
        assert frame.locator('#challenge-next').is_visible()
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
    assert 'Broadcast move · 3…a6' in page.locator('#result-title').text_content()
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

    # Undated links follow the scheduled round; explicit links retain identity.
    pregame = PGN.replace('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *', '*')
    for instant, expected_game in [
        ('2026-11-25T13:00:00Z', 2),
        ('2026-11-27T10:00:00Z', 4),
        ('2026-12-04T14:20:00Z', 9),
        ('2026-12-13T10:00:00Z', 14),
    ]:
        round_page = browser.new_page()
        try:
            populate(round_page, source, pgn=pregame, now_iso=instant)
            round_page.locator('#tab-live').click()
            assert round_page.locator('#game-select').input_value() == str(expected_game)
            assert round_page.locator('#source-url').get_attribute('href') == registry[expected_game - 1]['url']
            assert round_page.locator('#board button.square').count() == 64
        finally:
            round_page.close()

    for requested in (1, 7, 14):
        shared_page = browser.new_page()
        try:
            populate(shared_page, source, pgn=pregame,
                     now_iso='2026-12-04T14:20:00Z',
                     page_url=f'https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&game={requested}')
            assert shared_page.locator('#tab-live').get_attribute('aria-pressed') == 'true'
            assert shared_page.locator('#game-select').input_value() == str(requested)
            assert shared_page.locator('#source-url').get_attribute('href') == registry[requested - 1]['url']
        finally:
            shared_page.close()

    generic_page = browser.new_page()
    try:
        populate(generic_page, source, pgn=pregame,
                 now_iso='2026-12-04T14:20:00Z',
                 page_url='https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live')
        assert generic_page.locator('#game-select').input_value() == '9'
        assert generic_page.locator('#source-url').get_attribute('href') == registry[8]['url']
    finally:
        generic_page.close()


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
            test_shared_peer_challenges(browser)
            test_embedded_challenge(browser)
            if os.environ.get("GVM_EXTENDED_BROWSER") == "1":
                test_full_session_and_fast_input(browser)
            test_lab(browser, screenshot_dir)
        finally:
            browser.close()
    print('Chromium smoke: separate homepage/lab, desktop/mobile/narrow challenge, result card, share, and live-source fixture passed.')


if __name__ == '__main__':
    main()
