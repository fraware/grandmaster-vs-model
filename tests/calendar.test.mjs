import test from 'node:test';
import assert from 'node:assert/strict';
import {roundInfo} from '../src/match-2026.mjs';
import {championshipCalendarIcs,championshipCalendarFilename} from '../src/calendar.mjs';

const generatedAt=new Date('2026-11-20T12:00:00.000Z');
const unfold=ics=>ics.replace(/\r\n /g,'');
const asIcs=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');

test('calendar uses the exact pinned scheduled UTC start, for all fourteen games',()=>{
  for(let game=1;game<=14;game++){
    const round=roundInfo(game);
    const start=new Date(round.startsAt);
    const ics=championshipCalendarIcs(game,generatedAt);
    const full=unfold(ics);
    assert.match(full,new RegExp(`DTSTART:${asIcs(start)}\\r\\n`));
    assert.match(full,new RegExp(`DTEND:${asIcs(new Date(start.getTime()+30*60000))}\\r\\n`));
    assert.match(full,/DTSTAMP:20261120T120000Z\r\n/);
    assert.ok(full.includes(`UID:gvm-2026-${round.roundId}@fraware.github.io\r\n`));
    assert.ok(full.includes(`game=${game}#experiment\r\n`));
    assert.ok(full.includes(`Game ${game} scheduled start\r\n`));
    assert.equal(championshipCalendarFilename(game),`grandmaster-vs-model-game-${game}.ics`);
    assert.ok(full.includes('actual play and timing may differ'));
    assert.ok(full.includes('does not certify prediction or move timing'));
  }
});

test('iCalendar export is CRLF-only, ASCII, folded and includes a discretionary alarm',()=>{
  const ics=championshipCalendarIcs(1,generatedAt);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false);
  assert.deepEqual([...ics].filter(ch=>ch.charCodeAt(0)>127),[]);
  for(const line of ics.split('\r\n').filter(Boolean))
    assert.ok(line.length<=73,`Calendar content line too long: ${line.slice(0,90)}`);
  assert.ok(ics.includes('TRIGGER:-PT15M\r\n'));
  assert.ok(ics.includes('BEGIN:VALARM\r\n'));
  assert.ok(ics.includes('METHOD:PUBLISH\r\n'));
  assert.ok(ics.includes('CALSCALE:GREGORIAN\r\n'));
  assert.ok(!ics.includes('e2e4'));
  assert.ok(!ics.includes('OPENAI_API_KEY'));
  assert.ok(!ics.includes('ANTHROPIC_API_KEY'));
});

test('calendar payload and filename reject invalid games and invalid clocks',()=>{
  for(const game of [0,-1,15,1.5,null,'1']){
    assert.throws(()=>championshipCalendarIcs(game,generatedAt),/Unsupported championship game/);
    assert.throws(()=>championshipCalendarFilename(game),/Unsupported championship game/);
  }
  assert.throws(()=>championshipCalendarIcs(1,new Date(NaN)),/timestamp is invalid/);
  assert.throws(()=>championshipCalendarIcs(1,'2026-11-20'),/timestamp is invalid/);
});

test('stable event identifiers prevent a new identifier for each download',()=>{
  const morning=championshipCalendarIcs(1,new Date('2026-11-20T08:00:00Z'));
  const evening=championshipCalendarIcs(1,new Date('2026-11-20T19:00:00Z'));
  const id=s=>unfold(s).split('\r\n').find(line=>line.startsWith('UID:'));
  assert.equal(id(morning),id(evening));
  assert.notEqual(morning,evening);
});
