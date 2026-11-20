import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roundInfo} from '../src/match-2026.mjs';

const path=new URL('../.github/workflows/shadow-stream.yml',import.meta.url);
const script=new URL('../scripts/stream-observer.mjs',import.meta.url);
const year=2026;

/** The two cron groups must cover only the official fourteen game days. */
test('source shadow collector is scheduled across the full classical-game observation period',async()=>{
  const yaml=await readFile(path,'utf8');
  const records=[...yaml.matchAll(/cron: '([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(records,[
    '3 14-23 24,25,26,28,29,30 11 *',
    '3 14-23 2,3,4,6,7,8,10,11 12 *'
  ]);
  const sessions=new Set();
  for(const cron of records){
    const [minute,hours,days,month]=cron.split(' ');
    assert.equal(minute,'3');
    assert.equal(hours,'14-23');
    for(const day of days.split(',')){
      for(let h=14;h<=23;h++){
        sessions.add(new Date(Date.UTC(year,Number(month)-1,Number(day),h,3)).toISOString());
      }
    }
  }
  assert.equal(sessions.size,140);
  for(let game=1;game<=14;game++){
    const start=Date.parse(roundInfo(game).startsAt);
    for(let offset=0;offset<=9;offset++){
      const stamp=new Date(start+offset*3600000+3*60000).toISOString();
      assert.ok(sessions.has(stamp),`Missing shadow session: ${stamp}`);
    }
  }
  assert.match(yaml,/timeout-minutes: 65/);
  assert.match(yaml,/STREAM_DURATION_MS: '3300000'/);
  assert.match(yaml,/artifacts\/shadow\//);
  assert.match(yaml,/retention-days: 90/);
  assert.match(yaml,/contents: read/);
  assert.doesNotMatch(yaml,/OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|gh workflow run/);
});

test('observer is explicitly read-only and creates a provenance-limited artifact',async()=>{
  const source=await readFile(script,'utf8');
  assert.match(source,/providerCalls:0/);
  assert.match(source,/physicalMoveTiming:'unverified'/);
  assert.match(source,/schema:'read-only-broadcast-session-v1'/);
  assert.match(source,/maxConnectionAgeMs=120_000/);
});
