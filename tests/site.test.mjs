import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const base = new URL('../',import.meta.url);
const text = name => readFile(new URL(name,base),'utf8');
test('public site exposes the real challenge and canonical, shareable image',async()=>{
  const html=await text('index.html');
  for(const id of ['challenge-board','challenge-move-select','challenge-reveal','challenge-next','challenge-share','challenge-download','challenge-restart']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/rel="canonical"/);
  assert.match(html,/twitter:card" content="summary_large_image"/);
  assert.match(html,/assets\/share-cover\.png/);
  assert.doesNotMatch(html,/<script[^>]*src="https?:\/\//);
  assert.match(html,/src="src\/home\.mjs"/);
  assert.doesNotMatch(html,/id="board"/);
  assert.match(html,/href="lab\.html\?mode=live#experiment"/);
  assert.match(html,/id="challenge-live-next-link"/);
  assert.match(html,/id="challenge-live-next-status"/);
  const image=await readFile(new URL('assets/share-cover.png',base));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1200);
  assert.equal(image.readUInt32BE(20),630);
  assert.ok((await stat(new URL('assets/preview.webp',base))).size>5000);
});
test('production Pages workflow includes every client-side module and image asset',async()=>{
  const yaml=await text('.github/workflows/pages.yml');
  assert.match(yaml,/cp -R src data assets _site\//);
  assert.match(yaml,/cp index\.html lab\.html app\.mjs style\.css landing\.css/);
  const lab=await text('lab.html');
  for(const id of ['board','tab-live','tab-archive','model-grid','experiment'])assert.match(lab,new RegExp(`id="${id}"`));
  assert.doesNotMatch(lab,/id="challenge-board"/);
  assert.match(yaml,/actions\/deploy-pages@v4/);
  const js=await text('app.mjs');
  assert.match(js,/mountChallenge\(historical,replay\)/);
  const entrance=await text('src/home.mjs');
  assert.match(entrance,/mountChallenge\(archive, replay, retrospective\)/);
  assert.match(entrance,/retrospective-2024\.json/);
  assert.match(entrance,/challenge-live-next-link/);
  assert.match(entrance,/challenge-live-next-time/);
  assert.match(yaml,/verify:retrospective/);
});

test('tournament visual identity is consistent across both boards, favicon and share card', async () => {
  const home = await text('index.html');
  const lab = await text('lab.html');
  const theme = await text('theme.css');
  const icon = await text('favicon.svg');
  const exportScript = await text('src/challenge-ui.mjs');
  const previewBuilder = await text('scripts/build-social-card.py');
  assert.match(home, /href="theme\.css"/);
  assert.match(lab, /href="theme\.css"/);
  assert.match(theme, /--paper:\s*#101b1d/);
  assert.match(theme, /--accent:\s*#d7ed75/);
  assert.match(theme, /--board-dark:\s*#658c7b/);
  assert.match(icon, /#d7ed75/);
  assert.match(exportScript, /#101B1D/);
  assert.match(exportScript, /#D7ED75/);
  assert.match(previewBuilder, /#101b1d/);
  assert.match(previewBuilder, /#d7ed75/);
  for (const source of [theme, exportScript, previewBuilder]) {
    assert.doesNotMatch(source, /https?:\/\/fonts\.|@import/);
  }
});


test('direct-manipulation challenge keeps a single board and an accessible move-list fallback', async () => {
  const html = await text('index.html');
  const client = await text('src/challenge-ui.mjs');
  const css = await text('landing.css');
  assert.match(html, /<details class="move-alternative"/);
  assert.match(html, /Prefer a move list\?/);
  assert.match(html, /Your move becomes your prediction\. No extra button\./);
  assert.match(client, /board\.children\.length !== 64/);
  assert.match(client, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(client, /ArrowLeft/);
  assert.match(client, /destination\.animate/);
  assert.match(client, /prefers-reduced-motion/);
  assert.match(css, /\.challenge-square\{touch-action:none/);
  assert.match(css, /\.drag-piece\{position:fixed/);
});


test('first move commits automatically and all practice rounds remain historical', async () => {
  const html = await text('index.html');
  const client = await text('src/challenge-ui.mjs');
  const challenge = await text('src/challenge.mjs');
  assert.match(html, /id="challenge-continue"/);
  assert.match(html, /id="challenge-run-progress"/);
  assert.match(html, /id="challenge-mobile-reveal"/);
  assert.match(html, /Your move becomes your prediction/);
  assert.match(client, /commitTimer = window\.setTimeout/);
  assert.match(client, /mobileRevealButton\.addEventListener\('click', advance\)/);
  assert.match(client, /activeModel = null/);
  assert.match(challenge, /createPracticeDecks/);
  assert.match(challenge, /Practice position is duplicated or outside the recorded game/);
});

test('attested forecast manifest uses NUL-separated filenames and limits signing to new attempts',async()=>{
  const yaml=await text('.github/workflows/capture.yml');
  assert.match(yaml,/mapfile -d '' files/);
  assert.ok(yaml.includes(String.raw`printf '%s\0'`));
  assert.ok(!yaml.includes(String.raw`printf '%s\\0'`));
  assert.match(yaml,/subject-checksums:/);
  assert.match(yaml,/steps\.evidence\.outputs\.new_attempts == 'true'/);
  assert.match(yaml,/continue-on-error: true/);
  assert.match(yaml,/CAPTURE_PROVIDERS: 'openai'/);
  assert.match(yaml,/name: capture-recovery-/);
  assert.match(yaml,/steps\.recovery\.outputs\.changed == 'true'/);
  assert.match(yaml,/retention-days: 30/);
});

test('production capture must publish reservations before spending on API calls',async()=>{
  const yaml=await text('.github/workflows/capture.yml');
  const pre=yaml.indexOf('name: Prepare immutable reservations');
  const push=yaml.indexOf('name: Publish reservations to GitHub before spending');
  const paid=yaml.indexOf('name: Execute only remotely committed reservations');
  assert.ok(pre>=0&&pre<push&&push<paid);
  assert.match(yaml,/git push origin HEAD:main/);
  assert.match(yaml,/git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(yaml,/if: steps\.reservation\.outputs\.execute == 'true'/);
  const pkg=JSON.parse(await text('package.json'));
  assert.ok(!Object.hasOwn(pkg.scripts,'capture:once'));
  assert.match(pkg.scripts['capture:reserve'],/--reserve$/);
  assert.match(pkg.scripts['capture:execute'],/--execute$/);
});

test('bot-authored forecast commits explicitly dispatch the public Pages deployment',async()=>{
  const capture=await text('.github/workflows/capture.yml');
  const pages=await text('.github/workflows/pages.yml');
  assert.match(capture,/actions: write/);
  assert.match(capture,/gh workflow run pages\.yml --ref main/);
  assert.match(capture,/always\(\) && \(steps\.reservation\.outputs\.published/);
  assert.match(pages,/workflow_dispatch:/);
});

test('live spectator entry is independent of public model-evaluation records',async()=>{
  const home=await text('index.html'),lab=await text('lab.html');
  const app=await text('app.mjs'),spectator=await text('src/spectator.mjs');
  const ci=await text('.github/workflows/ci.yml');
  assert.match(home,/Predict the 2026 move/);
  for(const id of ['spectator-panel','spectator-guess-label','spectator-stats',
    'spectator-next','spectator-share','spectator-storage-note']){
    assert.match(lab,new RegExp(`id="${id}"`));
  }
  assert.match(spectator,/sessionStorage|spectator-session-v1/);
  assert.match(app,/spectatorOpportunity/);
  assert.match(app,/spectatorOutcome/);
  assert.match(ci,/live-spectator-smoke\.py/);
  assert.doesNotMatch(spectator,/fetch\(|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/);
});

test('homepage has a prominent, scheduled 2026 action on mobile and desktop',async()=>{
  const home=await text('index.html');
  const controller=await text('src/home.mjs');
  const styles=await text('landing.css');
  assert.match(home,/id="live-invite"/);
  assert.match(home,/id="live-invite-link"/);
  assert.match(home,/game=1#experiment/);
  assert.match(controller,/homepageInvite/);
  assert.match(styles,/\.live-invite-action/);
});

test('pregame reminder is an offline private calendar, not a model call',async()=>{
  const lab=await text('lab.html');
  const app=await text('app.mjs');
  const calendar=await text('src/calendar.mjs');
  assert.match(lab,/id="spectator-calendar"/);
  assert.match(lab,/id="spectator-calendar-status"/);
  assert.match(app,/championshipCalendarIcs/);
  assert.match(calendar,/BEGIN:VCALENDAR/);
  assert.match(calendar,/roundInfo\(game\)/);
  assert.doesNotMatch(calendar,/fetch\(|analytics|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/);
});

test('Pages upload completes in a separate job before deployment and supports retry',async()=>{
  const yaml=await text('.github/workflows/pages.yml');
  const build=yaml.indexOf('  build:');
  const deploy=yaml.indexOf('  deploy:');
  assert.ok(build>0&&deploy>build);
  assert.match(yaml,/deploy:\s+needs: build/);
  assert.ok(yaml.indexOf('actions/upload-pages-artifact@v3')<deploy);
  assert.ok(yaml.indexOf('actions/deploy-pages@v4')>deploy);
  assert.match(yaml,/cp -R src data assets _site\//);
});

test('both pages ship the same chess-first typography, board and contrast',async()=>{
  const home=await text('index.html');
  const live=await text('lab.html');
  const theme=await text('theme.css');
  const workflow=await text('.github/workflows/pages.yml');
  assert.match(home,/href="theme\.css"/);
  assert.match(live,/href="theme\.css"/);
  assert.match(workflow,/style\.css landing\.css theme\.css favicon\.svg/);
  assert.match(theme,/--font-display:/);
  assert.match(theme,/--font-score:/);
  assert.match(theme,/--board-dark:\s*#658c7b/);
  assert.match(theme,/--board-light:\s*#dbe6d6/);
  assert.match(theme,/--accent:\s*#d7ed75/);
  assert.doesNotMatch(theme,/@import|@font-face|https?:\/\/fonts\./);
  assert.doesNotMatch(theme,/backdrop-filter|linear-gradient|radial-gradient/);
});

test('the share graphic and favicon match the tournament identity without remote assets',async()=>{
  const index=await text('index.html');
  const icon=await text('favicon.svg');
  const screenshot=await text('.github/workflows/preview.yml');
  const generator=await text('scripts/build-social-card.py');
  assert.match(index,/assets\/share-cover\.png\?v=5/);
  assert.match(icon,/#d7ed75/);
  assert.match(generator,/FONT_ROOT.*dejavu/);
  assert.match(generator,/WHAT WOULD/);
  assert.match(generator,/YOU PLAY/);
  assert.match(screenshot,/python scripts\/build-social-card\.py/);
  assert.match(screenshot,/assets\/preview\.webp assets\/share-cover\.png/);
});

test('on mobile a locked live move reveals the result in the viewport',async()=>{
  const live=await text('app.mjs');
  const html=await text('lab.html');
  const theme=await text('theme.css');
  assert.match(live,/target\.scrollIntoView/);
  assert.match(live,/prefers-reduced-motion:reduce/);
  assert.match(html,/id="spectator-message" aria-live="polite"/);
  assert.match(theme,/#spectator-panel \{ scroll-margin-top:/);
});


test('production browser preflight follows successful Pages deploys without duplicate Lichess requests', async()=>{
  const workflow=await text('.github/workflows/production-preflight.yml');
  const preflight=await text('tests/production-preflight.py');
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/workflows:\s*\['Publish site'\]/);
  assert.match(workflow,/conclusion == 'success'/);
  assert.match(workflow,/head_branch == 'main'/);
  assert.match(preflight,/page\.on\("response", record_broadcast_response\)/);
  assert.match(preflight,/broadcast_responses\[-1\]/);
  assert.doesNotMatch(preflight,/browser_fetch\s*=\s*page\.evaluate\(/);
});
test('source polling remains bounded when the live game ends or Lichess rate-limits', async()=>{
  const client=await text('app.mjs');
  const policy=await text('src/live-poll.mjs');
  const browser=await text('tests/live-spectator-smoke.py');
  assert.match(client,/shouldAutoRefreshBroadcast/);
  assert.match(client,/sourceRetryUntil=now\+rateLimitDelayMs/);
  assert.match(client,/queuedBroadcastGame=selectedGame/);
  assert.match(policy,/MIN_RATE_LIMIT_MS\s*=\s*65_000/);
  assert.match(browser,/run_rate_limit_recovery_test/);
  assert.match(browser,/run_round_switch_during_fetch_test/);
});

test('spectator invitations are independent, spoiler-free and open before the first move',async()=>{
  const html=await text('lab.html');
  const app=await text('app.mjs');
  const spectator=await text('src/spectator.mjs');
  const browser=await text('tests/live-spectator-smoke.py');
  assert.match(html,/id="spectator-share" hidden>Challenge a friend/);
  assert.match(html,/Copyable chess challenge invitation/);
  assert.match(app,/spectatorChallengeText/);
  assert.match(app,/spectator-share'\)\.hidden=!\(chance\.enabled\|\|choice\)/);
  assert.match(browser,/__invitations/);
  assert.match(browser,/locked_invite/);
  assert.match(browser,/resolved_invite/);
  assert.doesNotMatch(spectator,/My move:\s*\$\{san\}/);
});

test('the optional chess embed reuses the same validated challenge and no private services',async()=>{
  const html=await text('index.html');
  const controller=await text('src/home.mjs');
  const css=await text('theme.css');
  const browser=await text('tests/browser-smoke.py');
  const production=await text('tests/production-preflight.py');
  const readme=await text('README.md');
  assert.match(html,/id="embed-attribution"/);
  assert.match(html,/id="embed-open-full"/);
  assert.match(controller,/parameters\.get\('embed'\) === '1'/);
  assert.match(controller,/parsePeerChallenge/);
  assert.match(controller,/classList\.add\('embed-mode'\)/);
  assert.match(css,/html\.embed-mode \.site-header/);
  assert.match(css,/html\.embed-mode \.challenge-board/);
  assert.match(browser,/def test_embedded_challenge\(browser\)/);
  assert.match(browser,/test_embedded_challenge\(browser\)/);
  assert.match(browser,/chessclub\.example/);
  assert.match(production,/embed_page\.set_content/);
  assert.match(production,/embed_page\.frame_locator\("iframe"\)/);
  assert.match(readme,/\?embed=1#challenge/);
  assert.match(readme,/referrerpolicy="no-referrer"/);
  assert.doesNotMatch(controller,/navigator\.sendBeacon|fetch\(.*analytics/);
});

test('publishers can discover and copy the iframe with no extra services',async()=>{
  const html=await text('index.html');
  const controller=await text('src/home.mjs');
  const css=await text('theme.css');
  const browser=await text('tests/browser-smoke.py');
  const snippet=await text('src/embed.mjs');
  for(const id of ['embed','publisher-embed-copy','publisher-embed-code',
    'publisher-embed-details','publisher-embed-status','publisher-embed-preview']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(controller,/publisherEmbedHtml/);
  assert.match(controller,/navigator\.clipboard\?\.writeText/);
  assert.match(controller,/field\.select\(\)/);
  assert.match(css,/\.publisher-embed-actions button/);
  assert.match(css,/html\.embed-mode \.publisher-embed/);
  assert.match(browser,/window\.__copiedEmbed/);
  assert.match(browser,/el\.selectionStart === 0/);
  assert.match(snippet,/referrerpolicy="no-referrer"/);
  assert.doesNotMatch(snippet,/fetch\(|localStorage|sessionStorage|sendBeacon|analytics/);
});

test('capture preserves partial records even after a paid request or validation error',async()=>{
  const yaml=await text('.github/workflows/capture.yml');
  const prepare=yaml.indexOf('name: Prepare immutable reservations');
  const execute=yaml.indexOf('name: Execute only remotely committed reservations');
  const detect=yaml.indexOf('name: Detect uncommitted recovery evidence after execution');
  const upload=yaml.indexOf('name: Preserve recovery evidence before any later validation or push');
  const validate=yaml.indexOf('name: Check collection integrity');
  const attest=yaml.indexOf('name: Sign forecast record digests');
  const publish=yaml.indexOf('name: Publish sourced observations and recorded attempts');
  assert.ok(prepare>=0&&prepare<execute&&execute<detect&&detect<upload&&
    upload<validate&&validate<attest&&attest<publish,
    'Recovery upload must precede every post-request verification and publish step');
  assert.match(yaml,/name: Prepare immutable reservations without calling providers\n        id: prepare/);
  assert.match(yaml,/id: recovery\n        if: \$\{\{ always\(\) && steps\.prepare\.outcome != 'skipped' \}\}/);
  assert.match(yaml,/git status --porcelain -- data\/claims data\/observations data\/attempts data\/collection\.json/);
  assert.match(yaml,/if: \$\{\{ always\(\) && steps\.recovery\.outputs\.changed == 'true' \}\}/);
  const uploadBlock=yaml.slice(upload,validate);
  assert.match(uploadBlock,/actions\/upload-artifact@v4/);
  assert.match(uploadBlock,/data\/claims\//);
  assert.match(uploadBlock,/data\/observations\//);
  assert.match(uploadBlock,/data\/attempts\//);
  assert.match(uploadBlock,/retention-days: 30/);
  assert.equal((yaml.match(/name: capture-recovery-\$\{\{/g)||[]).length,1,
    'Each capture job must create at most one uniquely named recovery artifact');
  assert.doesNotMatch(uploadBlock,/steps\.evidence\.outputs|if: steps\./,
    'Recovery must not depend on checks that would be skipped on a failed request');
});

test('live championship shares use event-specific metadata and a deployed 1200x630 PNG',async()=>{
  const home=await text('index.html');
  const lab=await text('lab.html');
  const pages=await text('.github/workflows/pages.yml');
  const generator=await text('scripts/build-live-social-card.py');
  const preflight=await text('tests/production-preflight.py');
  assert.match(home,/og:image" content="[^"]*assets\/share-cover\.png\?v=5"/);
  assert.match(lab,/og:title" content="Gukesh vs Sindarov/);
  assert.match(lab,/og:description" content="Play a move on the 2026 World Chess Championship/);
  assert.match(lab,/twitter:title" content="Gukesh vs Sindarov/);
  assert.match(lab,/og:image" content="https:\/\/fraware\.github\.io\/grandmaster-vs-model\/assets\/live-share-cover\.png\?v=1"/);
  assert.match(lab,/twitter:image" content="https:\/\/fraware\.github\.io\/grandmaster-vs-model\/assets\/live-share-cover\.png\?v=1"/);
  assert.doesNotMatch(lab,/og:image" content="[^"]*assets\/share-cover\.png"/);
  assert.match(pages,/python -m pip install --disable-pip-version-check Pillow==12\.0\.0/);
  assert.match(pages,/python scripts\/build-live-social-card\.py --out _site\/assets\/live-share-cover\.png/);
  assert.ok(pages.indexOf('cp -R src data assets _site/')<
    pages.indexOf('python scripts/build-live-social-card.py --out _site/assets/live-share-cover.png'));
  assert.match(generator,/Image\.new\("RGB", \(1200, 630\), BACKGROUND\)/);
  assert.match(generator,/GUKESH D  \/  JAVOKHIR SINDAROV/);
  assert.match(generator,/WORLD CHESS CHAMPIONSHIP 2026/);
  assert.match(generator,/DEFAULT_OUTPUT = ROOT \/ "assets\/live-share-cover\.png"/);
  assert.doesNotMatch(generator,/https?:\/\/|requests\.|urllib/);
  assert.match(preflight,/social_response = page\.request\.get\(social_url/);
  assert.match(preflight,/\[1200, 630\]/);
});

test('live 2026 iframe and historical 2024 iframe are separate playable publication products',async()=>{
  const home=await text('index.html');
  const live=await text('lab.html');
  const controller=await text('src/home.mjs');
  const app=await text('app.mjs');
  const styles=await text('theme.css');
  const browser=await text('tests/browser-smoke.py');
  const preflight=await text('tests/production-preflight.py');
  const readme=await text('README.md');
  for(const id of ['publisher-live-embed-copy','publisher-live-embed-details',
    'publisher-live-embed-code','publisher-live-embed-status',
    'publisher-live-embed-preview']){
    assert.match(home,new RegExp('id="'+id+'"'));
  }
  assert.match(controller,/publisherLiveEmbedHtml/);
  assert.match(controller,/field\.select\(\)/);
  assert.match(live,/id="live-embed-attribution"/);
  assert.match(live,/id="live-embed-open-full"/);
  assert.match(app,/query\.get\('mode'\)==='live'&&query\.get\('embed'\)==='1'/);
  assert.match(app,/classList\.add\('live-embed-mode'\)/);
  assert.match(app,/direct\.searchParams\.set\('game',String\(selectedGame\)\)/);
  assert.match(styles,/html\.live-embed-mode \.site-header/);
  assert.match(styles,/html\.live-embed-mode \.live-embed-attribution/);
  assert.match(browser,/def test_embedded_live_championship\(browser\)/);
  assert.match(browser,/chesspublisher\.example/);
  assert.match(browser,/test_embedded_live_championship\(browser\)/);
  assert.match(preflight,/live_embed_page\.set_content/);
  assert.match(preflight,/live_frame\.locator\("#board button\.square"\)/);
  assert.match(readme,/lab\.html\?mode=live&embed=1#experiment/);
  assert.match(readme,/Third-party browser storage restrictions/);
  assert.doesNotMatch(controller,/sendBeacon|tracking|analytics\.track/);
});
