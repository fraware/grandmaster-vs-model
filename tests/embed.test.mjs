import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HISTORICAL_EMBED_URL,publisherEmbedHtml} from '../src/embed.mjs';

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
