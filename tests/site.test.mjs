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
