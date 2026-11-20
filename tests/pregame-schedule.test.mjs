import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roundInfo} from '../src/match-2026.mjs';

test('production browser preflight is scheduled for all 14 rounds 35 minutes early',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/production-preflight.yml',import.meta.url),'utf8');
  const crons=[...yaml.matchAll(/cron: '([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(crons,[
    '25 13 24,25,26,28,29,30 11 *',
    '25 13 2,3,4,6,7,8,10,11 12 *'
  ]);
  const checks=new Set();
  for(const item of crons){
    const [minute,hour,days,month]=item.split(' ');
    for(const day of days.split(',')){
      checks.add(new Date(Date.UTC(2026,Number(month)-1,Number(day),
        Number(hour),Number(minute))).toISOString());
    }
  }
  assert.equal(checks.size,14);
  for(let game=1;game<=14;game++){
    const start=Date.parse(roundInfo(game).startsAt);
    assert.ok(checks.has(new Date(start-35*60000).toISOString()),
      `Missing pregame check for Game ${game}`);
  }
  assert.match(yaml,/github\.event_name|GITHUB_EVENT_NAME/);
  assert.match(yaml,/date -u \+%Y/);
  assert.match(yaml,/retention-days: 60/);
  assert.match(yaml,/contents: read/);
  assert.doesNotMatch(yaml,/OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/);
});

test('pregame browser report selects an official round without tracking or provider calls',async()=>{
  const source=await readFile(new URL('./production-preflight.py',import.meta.url),'utf8');
  assert.match(source,/def select_target\(/);
  assert.match(source,/selectedGame/);
  assert.match(source,/browser_fetch/);
  assert.match(source,/"providerRequests": 0/);
  assert.match(source,/"physicalMoveTimeCertified": False/);
});
