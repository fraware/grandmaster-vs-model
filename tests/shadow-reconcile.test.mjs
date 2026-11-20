import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {START_FEN,play} from '../src/chess.mjs';
import {extendObservation} from '../src/collection.mjs';
import {roundInfo} from '../src/match-2026.mjs';
import {reconcileShadowArtifacts,validateShadowSession,
  SHADOW_REPORT_SCHEMA} from '../src/shadow-reconcile.mjs';
import {reconcileDirectory} from '../scripts/reconcile-shadow.mjs';

const makeSummary=(game=1,props={})=>({
  schema:'read-only-broadcast-session-v1',
  game,source:roundInfo(game).pgnUrl,
  sessionStartedAt:roundInfo(game).startsAt.replace('14:00:00.000','14:03:00.000'),
  sessionCompletedAt:roundInfo(game).startsAt.replace('14:00:00.000','14:58:00.000'),
  providerCalls:0,physicalMoveTiming:'unverified',status:'duration-reached',
  connections:31,notifications:30,bytesReceived:1234,...props
});
const artifact=(id,observation,summary=makeSummary())=>({
  artifact:`shadow-broadcast-4470000000${id}-1`,observation,summary
});
const e4=play(START_FEN,'e2e4');
const e5=play(e4.fen,'e7e5');
const first={moves:[{uci:'e2e4'}],positions:[START_FEN,e4.fen]};
const second={moves:[{uci:'e2e4'},{uci:'e7e5'}],positions:[START_FEN,e4.fen,e5.fen]};
const obs=(game,position,at)=>extendObservation(null,position,at,game);

test('consistent overlapping artifacts yield a deterministic, provenance-limited PGN report',()=>{
  const a=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
  const b=artifact(2,obs(1,second,'2026-11-24T14:16:00.000Z'));
  const mixed=reconcileShadowArtifacts([b,a]);
  const ordered=reconcileShadowArtifacts([a,b]);
  assert.deepEqual(mixed,ordered);
  assert.equal(mixed.schema,SHADOW_REPORT_SCHEMA);
  assert.equal(mixed.inputArtifactCount,2);
  assert.equal(mixed.reportedDistinctMoves,2);
  assert.equal(mixed.physicalMoveTimesCertified,false);
  assert.equal(mixed.modelForecastsCertified,false);
  assert.equal(mixed.artifactProvenanceVerified,false);
  const game=mixed.games[0];
  assert.equal(game.maximumReportedPly,2);
  assert.deepEqual(game.moves.map(move=>move.uci),['e2e4','e7e5']);
  assert.equal(game.moves[0].earliestOperatorReportedAt,'2026-11-24T14:12:00.000Z');
  assert.equal(game.moves[0].carryingArtifactCount,2);
  assert.equal(game.moves[0].timestampVariationMs,4*60*1000);
  assert.equal(game.moves[1].carryingArtifactCount,1);
  assert.equal(game.moves[0].claims[0].artifact,a.artifact);
  for(const session of mixed.sessions){
    assert.match(session.summaryDigest,/^[a-f0-9]{64}$/);
    assert.match(session.observationDigest,/^[a-f0-9]{64}$/);
  }
});

test('missing, failed and future source artifacts are disclosed without invented chess moves',()=>{
  const empty=artifact(1,null,makeSummary(1,{
    status:'failed',connections:0,notifications:0,bytesReceived:0
  }));
  const report=reconcileShadowArtifacts([empty]);
  assert.equal(report.inputArtifactCount,1);
  assert.equal(report.reportedDistinctMoves,0);
  assert.equal(report.games[0].maximumReportedPly,0);
  assert.equal(report.sessions[0].status,'failed');
  assert.equal(report.sessions[0].observationDigest,null);
});

test('conflicting legal move histories are rejected, not aggregated into an outcome',()=>{
  const alternative=play(START_FEN,'d2d4');
  const d4={moves:[{uci:'d2d4'}],positions:[START_FEN,alternative.fen]};
  const a=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
  const b=artifact(2,obs(1,d4,'2026-11-24T14:16:00.000Z'));
  assert.throws(()=>reconcileShadowArtifacts([a,b]),/Conflicting shadow history/);
});

test('the data validator rejects incorrect source, game, moves and clock chronology',()=>{
  const valid=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
  assert.equal(validateShadowSession(valid.summary),true);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,summary:{...valid.summary,providerCalls:1}}
  ]),/Invalid read-only/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,summary:{...valid.summary,source:roundInfo(2).pgnUrl}}
  ]),/Invalid read-only/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,summary:{...valid.summary,sessionCompletedAt:'2026-11-24T13:59:00.000Z'}}
  ]),/Nonmonotone shadow session times/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,summary:{...valid.summary,sessionCompletedAt:'2026-11-24T14:10:00.000Z'}}
  ]),/Observation timestamp follows/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,observation:{...valid.observation,game:2,source:roundInfo(2).pgnUrl}}
  ]),/different rounds/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...valid,observation:{...valid.observation,
      moves:[{...valid.observation.moves[0],fenBefore:e4.fen}]}}
  ]),/FEN chain/);
});

test('duplicate or forged artifact names are rejected',()=>{
  const x=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
  assert.throws(()=>reconcileShadowArtifacts([x,x]),/Duplicate or invalid/);
  assert.throws(()=>reconcileShadowArtifacts([
    {...x,artifact:'../shadow-broadcast-44700000001-1'}
  ]),/Duplicate or invalid/);
  assert.throws(()=>reconcileShadowArtifacts({}),/Invalid shadow artifact collection/);
});

test('separate rounds remain distinct without mixing sampled move histories',()=>{
  const a=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
  const b=artifact(2,obs(2,first,'2026-11-25T14:12:00.000Z'),makeSummary(2));
  const report=reconcileShadowArtifacts([a,b]);
  assert.deepEqual(report.games.map(g=>g.game),[1,2]);
  assert.equal(report.reportedDistinctMoves,2);
  assert.notEqual(report.games[0].source,report.games[1].source);
});

test('directory ingester reads actual expected GitHub artifact layout without touching ledger',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-shadow-reconcile-'));
  try{
    const a=artifact(1,obs(1,first,'2026-11-24T14:12:00.000Z'));
    const b=artifact(2,null,makeSummary(1,{status:'failed'}));
    for(const entry of [a,b]){
      const base=join(root,entry.artifact);
      await mkdir(join(base,'artifacts/shadow'),{recursive:true});
      await writeFile(join(base,'artifacts/shadow/session.json'),JSON.stringify(entry.summary));
      if(entry.observation){
        await mkdir(join(base,'data/observations'),{recursive:true});
        await writeFile(join(base,'data/observations/game1.json'),
          JSON.stringify(entry.observation));
      }
    }
    const output=await reconcileDirectory(root);
    assert.equal(output.inputArtifactCount,2);
    assert.equal(output.reportedDistinctMoves,1);
    assert.equal(output.sessions.filter(x=>x.reportedMoveCount===0).length,1);
    await assert.rejects(()=>reconcileDirectory(join(root,'missing')),/ENOENT/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('untrusted artifact JSON symlinks cannot read files outside their session',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-shadow-boundary-'));
  try{
    const id='shadow-broadcast-44700000009-1';
    const base=join(root,id);
    await mkdir(join(base,'artifacts/shadow'),{recursive:true});
    const outside=join(root,'outside.json');
    await writeFile(outside,JSON.stringify(makeSummary()));
    await symlink(outside,join(base,'artifacts/shadow/session.json'));
    await assert.rejects(()=>reconcileDirectory(root),/escapes its declared download directory/);
  }finally{await rm(root,{recursive:true,force:true});}
});
