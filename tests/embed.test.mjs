import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HISTORICAL_EMBED_URL,publisherEmbedHtml,LIVE_EMBED_URL,publisherLiveEmbedHtml} from '../src/embed.mjs';

test('publisher snippet is an explicit, self-contained, privacy-preserving iframe',()=>{
  const markup=publisherEmbedHtml();
  assert.equal(HISTORICAL_EMBED_URL,
    'https://fraware.github.io/grandmaster-vs-model/?embed=1#challenge');
  assert.match(markup,/^<iframe\n/);
  assert.match(markup,/<\/iframe>$/);
  assert.match(markup,/title="Grandmaster vs Model: predict three World Championship moves"/);
  assert.match(markup,/src="https:\/\/fraware\.github\.io\/grandmaster-vs-model\/\?embed=1#challenge"/);
  assert.match(markup,/height="1080"/);
  assert.match(markup,/loading="lazy"/);
  assert.match(markup,/referrerpolicy="no-referrer"/);
  assert.doesNotMatch(markup,/javascript:|<script|analytics|token|api_key|set=|target=|game=/i);
  assert.equal(publisherEmbedHtml(),markup);
});

test('publisher code is identical to the documented integration example',async()=>{
  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  const example=readme.match(/```html\n(<iframe[\s\S]*?<\/iframe>)\n```/);
  assert.ok(example,'README needs a copyable HTML iframe example');
  assert.equal(example[1],publisherEmbedHtml());
});

test('live 2026 widget stays current across rounds and contains no tracking',()=>{
  const code=publisherLiveEmbedHtml();
  assert.equal(LIVE_EMBED_URL,
    'https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&embed=1#experiment');
  assert.match(code,/^<iframe\n/);
  assert.match(code,/title="Gukesh vs Sindarov: play the next World Championship move"/);
  assert.match(code,/width="620"/);
  assert.match(code,/height="1460"/);
  assert.match(code,/loading="lazy"/);
  assert.match(code,/referrerpolicy="no-referrer"/);
  assert.ok(code.includes('src="'+LIVE_EMBED_URL+'"'));
  assert.doesNotMatch(code,/javascript:|<script|analytics|token|api_key|utm_|game=|ply=/i);
  assert.equal(code,publisherLiveEmbedHtml());
});

test('both publisher iframe snippets are byte-identical to documented examples',async()=>{
  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  const examples=[...readme.matchAll(/```html\n(<iframe[\s\S]*?<\/iframe>)\n```/g)].map(x=>x[1]);
  assert.ok(examples.includes(publisherEmbedHtml()),'historical snippet must be documented');
  assert.ok(examples.includes(publisherLiveEmbedHtml()),'current live snippet must be documented');
});
