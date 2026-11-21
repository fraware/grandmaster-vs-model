import test from 'node:test';
import assert from 'node:assert/strict';
import {roundInfo} from '../src/match-2026.mjs';
import {shouldAutoRefreshBroadcast,rateLimitDelayMs} from '../src/live-poll.mjs';

test('auto-poll only inside the scheduled window of an unfinished game',()=>{
  for(let game=1;game<=14;game++){
    const start=Date.parse(roundInfo(game).startsAt);
    const at=millis=>({game,at:millis});
    assert.equal(shouldAutoRefreshBroadcast(at(start-1)),false);
    assert.equal(shouldAutoRefreshBroadcast(at(start)),true);
    assert.equal(shouldAutoRefreshBroadcast(at(start+11*60*60_000-1)),true);
    assert.equal(shouldAutoRefreshBroadcast(at(start+11*60*60_000)),false);
    assert.equal(shouldAutoRefreshBroadcast({...at(start+60_000),result:'1-0'}),false);
    assert.equal(shouldAutoRefreshBroadcast({...at(start+60_000),result:'0-1'}),false);
    assert.equal(shouldAutoRefreshBroadcast({...at(start+60_000),result:'1/2-1/2'}),false);
  }
});
test('no clock, game or result ambiguity is admitted',()=>{
  assert.throws(()=>shouldAutoRefreshBroadcast({game:1,at:'bad'}),/instant/);
  assert.throws(()=>shouldAutoRefreshBroadcast({game:0,at:Date.now()}),/round number/);
  assert.throws(()=>shouldAutoRefreshBroadcast({game:1,at:Date.now(),result:'unknown'}),/result/);
});
test('429 cooldown honors seconds, HTTP dates and a full-minute minimum',()=>{
  const now=Date.parse('2026-11-24T14:00:00.000Z');
  assert.equal(rateLimitDelayMs(null,now),65_000);
  assert.equal(rateLimitDelayMs('30',now),65_000);
  assert.equal(rateLimitDelayMs(' 120 ',now),120_000);
  assert.equal(rateLimitDelayMs('Tue, 24 Nov 2026 14:03:00 GMT',now),180_000);
  assert.equal(rateLimitDelayMs('invalid',now),65_000);
  assert.equal(rateLimitDelayMs('99999999',now),24*60*60_000);
  assert.throws(()=>rateLimitDelayMs('60',Number.NaN),/clock/);
});
