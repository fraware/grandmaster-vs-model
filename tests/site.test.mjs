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
  assert.match(yaml,/verify:retrospective/);
});

test('editorial visual identity is consistent across game, lab, favicon and share image', async () => {
  const game = await text('landing.css');
  const lab = await text('style.css');
  const icon = await text('favicon.svg');
  const exportScript = await text('src/challenge-ui.mjs');
  const previewBuilder = await text('scripts/build-social-card.py');
  assert.match(game, /--paper:#f6f1e8/);
  assert.match(game, /--accent:#6b2f2a/);
  assert.match(game, /--board-dark:#8a664a/);
  assert.match(lab, /--board-dark:#8a664a/);
  assert.match(icon, /#6b2f2a/);
  assert.match(exportScript, /#F6F1E8/);
  assert.match(previewBuilder, /#F6F1E8/);
  for (const source of [game, exportScript, previewBuilder]) {
    assert.doesNotMatch(source, /#def47c|#121e19/i);
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
  assert.match(yaml,/steps\.evidence\.outputs\.changed == 'true'/);
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
