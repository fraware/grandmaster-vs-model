import test from 'node:test';
import assert from 'node:assert/strict';
import {selectHomepageRound,homepageInvite} from '../src/home-entry.mjs';
import {roundInfo} from '../src/match-2026.mjs';

test('pregame homepage routes to the first scheduled World Championship round',()=>{
  const x=homepageInvite('2026-11-20T12:00:00Z');
  assert.equal(x.game,1);
  assert.equal(x.phase,'opening');
  assert.equal(x.href,'lab.html?mode=live&game=1#experiment');
  assert.match(x.description,/24 Nov.*14:00 UTC/);
  assert.match(x.action,/opening/);
});

test('homepage distinguishes a scheduled session from proven live chess play',()=>{
  const before=selectHomepageRound('2026-11-24T13:59:59Z');
  const during=homepageInvite('2026-11-24T14:00:00Z');
  assert.equal(before.phase,'opening');
  assert.equal(during.game,1);
  assert.equal(during.phase,'scheduled-window');
  assert.match(during.description,/scheduled broadcast window/);
  assert.doesNotMatch(during.description,/confirmed live|physical move/);
});

test('the off-day and the next day route to their own official game URLs',()=>{
  assert.equal(homepageInvite('2026-11-27T10:00:00Z').game,4);
  assert.equal(homepageInvite('2026-11-25T13:00:00Z').game,2);
  assert.equal(homepageInvite('2026-12-04T14:20:00Z').game,9);
  for(const value of ['2026-11-27T10:00:00Z','2026-12-04T14:20:00Z']){
    const x=homepageInvite(value);
    assert.equal(x.href,`lab.html?mode=live&game=${x.game}#experiment`);
    assert.equal(x.startsAt,roundInfo(x.game).startsAt);
  }
});

test('long-before-match and post-schedule states never promise live participation',()=>{
  const early=homepageInvite('2026-10-01T00:00:00Z');
  assert.equal(early.phase,'preview');
  assert.match(early.description,/14 days/);
  const late=homepageInvite('2026-12-12T08:00:00Z');
  assert.equal(late.phase,'replay');
  assert.equal(late.game,14);
  assert.match(late.description,/published board history/);
});

test('invalid timestamps fail closed',()=>{
  assert.throws(()=>homepageInvite('bad-time'),/Invalid championship entry time/);
  assert.throws(()=>homepageInvite(new Date(NaN)),/Invalid championship entry time/);
});

test('all fourteen round boundaries map consistently to the pinned registry',()=>{
  for(let i=1;i<=14;i++){
    const round=roundInfo(i),start=Date.parse(round.startsAt);
    const now=homepageInvite(new Date(start));
    assert.equal(now.phase,'scheduled-window');
    assert.equal(now.game,i);
    assert.equal(now.startsAt,round.startsAt);
  }
});
