import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roundInfo,activeRound} from '../src/match-2026.mjs';

const capture=new URL('../.github/workflows/capture.yml',import.meta.url);
const expected=[
  '2-59/5 14-23 24,25,26,28,29,30 11 *',
  '2-59/5 0 25,26,27,29,30 11 *',
  '2-59/5 0 1 12 *',
  '2-59/5 14-23 2,3,4,6,7,8,10,11 12 *',
  '2-59/5 0 3,4,5,7,8,9,11,12 12 *',
];

function scheduledInstants(records){
  const instants=new Set();
  for(const cron of records){
    const [minutes,hours,days,month,weekday,...rest]=cron.split(' ');
    assert.deepEqual(rest,[]);
    assert.equal(minutes,'2-59/5');
    assert.equal(weekday,'*');
    const availableHours=hours==='0'?[0]:Array.from({length:10},(_,i)=>14+i);
    assert.ok(hours==='0'||hours==='14-23');
    for(const day of days.split(',')){
      for(const hour of availableHours){
        for(let minute=2;minute<=57;minute+=5){
          const iso=new Date(Date.UTC(2026,Number(month)-1,Number(day),hour,minute)).toISOString();
          assert.equal(instants.has(iso),false,'Duplicate scheduled capture: '+iso);
          instants.add(iso);
        }
      }
    }
  }
  return instants;
}

test('all 14 published game windows are covered at five-minute intervals, without off-day captures',async()=>{
  const yaml=await readFile(capture,'utf8');
  const records=[...yaml.matchAll(/cron: '([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(records,expected);
  const actual=scheduledInstants(records);
  const required=new Set();
  for(let game=1;game<=14;game++){
    const start=Date.parse(roundInfo(game).startsAt);
    for(let hour=0;hour<11;hour++){
      for(let minute=2;minute<=57;minute+=5){
        const instant=new Date(start+hour*3_600_000+minute*60_000).toISOString();
        assert.equal(activeRound(instant)?.game,game);
        required.add(instant);
      }
    }
  }
  assert.equal(actual.size,14*11*12);
  assert.deepEqual([...actual].sort(),[...required].sort());
});

test('expired annual cron never enters the expensive 2026 capture job',async()=>{
  const yaml=await readFile(capture,'utf8');
  assert.match(yaml,/jobs:\n  season:/);
  assert.match(yaml,/eligible: \$\{\{ steps\.check\.outputs\.eligible \}\}/);
  assert.match(yaml,/\$GITHUB_EVENT_NAME" == "workflow_dispatch"/);
  assert.match(yaml,/date -u \+%Y/);
  assert.match(yaml,/\n  capture:\n    needs: season\n    if: needs\.season\.outputs\.eligible == 'true'/);
  assert.match(yaml,/run: npm run capture:reserve/);
  assert.match(yaml,/run: npm run capture:execute/);
  assert.match(yaml,/CAPTURE_PROVIDERS: 'openai'/);
});
