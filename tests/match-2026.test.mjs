import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {roundInfo,activeRound,validateRegistry,BROADCAST_REGISTRY} from '../src/match-2026.mjs';
import {snapshotFromPgn,restoreSnapshot} from '../src/broadcast.mjs';
import {cycle,currentWorkflowContext} from '../scripts/forecast-cycle.mjs';
import {collect} from '../scripts/collection.mjs';
import {buildIndex,extendObservation,validateObservation} from '../src/collection.mjs';
import {START_FEN,play} from '../src/chess.mjs';
const gameTwo='[Event "FIDE World Chess Championship 2026"]\n[White "Javokhir Sindarov"]\n[Black "Gukesh D"]\n[Result "*"]\n\n1. e4 *';
const model={id:'openai-gpt-6-2-astra',name:'GPT-6.2 Astra',version:'gpt-6.2-astra',provider:'openai',capture:true};
const roster={schema:'model-roster-v1',verifiedOn:'2026-11-19',models:[model]};

test('all 14 Lichess round references are pinned and have monotonically scheduled times',()=>{
  assert.equal(validateRegistry(BROADCAST_REGISTRY),BROADCAST_REGISTRY);
  assert.equal(new Set(BROADCAST_REGISTRY.rounds.map(r=>r.roundId)).size,14);
  assert.deepEqual(BROADCAST_REGISTRY.rounds.map(r=>r.game),Array.from({length:14},(_,i)=>i+1));
  for(let i=1;i<=14;i++){
    const r=roundInfo(i);
    assert.match(r.pgnUrl,new RegExp(`/${r.roundId}\\.pgn$`));
    if(i>1)assert.ok(Date.parse(r.startsAt)>Date.parse(roundInfo(i-1).startsAt));
  }
  assert.throws(()=>validateRegistry({...BROADCAST_REGISTRY,rounds:BROADCAST_REGISTRY.rounds.slice(0,13)}),/identity/);
  const tampered=structuredClone(BROADCAST_REGISTRY);tampered.rounds[1].roundId='invented';
  assert.throws(()=>validateRegistry(tampered),/Game 2/);
});

test('scheduled windows exclude pre-game, rest days and post-session API spending',()=>{
  assert.equal(activeRound('2026-11-24T13:59:59.000Z'),null);
  assert.equal(activeRound('2026-11-24T14:00:00.000Z')?.game,1);
  assert.equal(activeRound('2026-11-25T14:00:00.000Z')?.game,2);
  assert.equal(activeRound('2026-11-27T14:30:00.000Z'),null);
  assert.equal(activeRound('2026-12-11T14:00:00.000Z')?.game,14);
  assert.equal(activeRound('2026-12-14T15:00:00.000Z'),null);
});

test('round 2 cache binds observed PGN to its actual broadcast identity',()=>{
  const round=roundInfo(2);
  const record=snapshotFromPgn(gameTwo,'2026-11-25T14:03:00.000Z',round);
  assert.equal(record.roundId,'L3j03TZq');
  assert.deepEqual(restoreSnapshot(record,round).moves.map(m=>m.uci),['e2e4']);
  assert.throws(()=>restoreSnapshot(record,roundInfo(1)),/identity/);
});

test('game 2 collects source observations and distinct model attempts without cross-game mixing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-game2-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const urls=[],providerRequests=[];
    const fetcher=async(url)=>{urls.push(url);return {ok:true,text:async()=>gameTwo};};
    const providerRequest=async request=>{
      providerRequests.push(request);
      return {output:'e7e5',model:model.version,responseId:'genuine-mock-not-provider',elapsedMs:17,usage:null};
    };
    const clock=()=>new Date('2026-11-25T14:05:00.000Z');
    const first=await cycle({root,clock,fetcher,providerRequest,keys:{OPENAI_API_KEY:'test-only'},sampleEvery:1});
    assert.equal(first.game,2);assert.equal(first.status,'captured-provisional');
    assert.deepEqual(urls,[roundInfo(2).pgnUrl,roundInfo(2).pgnUrl]);
    assert.equal(providerRequests.length,1);
    assert.match(providerRequests[0].prompt,/Game: 2/);
    const obs=JSON.parse(await readFile(join(root,'data/observations/game2.json'),'utf8'));
    assert.equal(validateObservation(obs),true);
    assert.equal(obs.source,roundInfo(2).pgnUrl);
    assert.equal(obs.moves[0].uci,'e2e4');
    const a=JSON.parse(await readFile(join(root,'data/attempts/g02-p002-openai-gpt-6-2-astra.json'),'utf8'));
    assert.equal(a.game,2);assert.equal(a.source,roundInfo(2).pgnUrl);
    const repeat=await cycle({root,clock,fetcher,providerRequest,keys:{OPENAI_API_KEY:'test-only'},sampleEvery:1});
    assert.equal(repeat.newAttempts,0);assert.equal(providerRequests.length,1);
    const index=await collect({root});
    assert.equal(index.observedGames.length,1);assert.equal(index.observedGames[0].game,2);
    assert.equal(index.observedMoves.length,0);
    assert.equal(index.attempts[0].game,2);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('observed outcome comparisons report exact match without certifying physical move timing',()=>{
  const initial=play(START_FEN,'e2e4');
  const sourceGame={moves:[{uci:'e2e4'},{uci:'e7e5'}],positions:[START_FEN,initial.fen,play(initial.fen,'e7e5').fen]};
  const obs=extendObservation(null,sourceGame,'2026-11-25T14:15:00.000Z',2);
  assert.equal(obs.game,2);
  const record={schema:'prediction-attempt-v1',event:'fide-world-championship-2026',game:2,ply:2,fen:initial.fen,source:roundInfo(2).pgnUrl,
    model, prompt:'fixture',promptSha256:'a'.repeat(64),response:'e7e5',responseSha256:'b'.repeat(64),status:'valid',predictedUci:'e7e5',error:null,
    startedAt:'2026-11-25T14:04:00.000Z',completedAt:'2026-11-25T14:05:00.000Z',providerResponseId:'fixture',providerReportedModel:model.version};
  const index=buildIndex({observations:[obs],attempts:[record],models:roster});
  assert.equal(index.attempts[0].comparison.exact,true);
  assert.equal(index.attempts[0].comparison.beforeFeedByOperatorClock,true);
  assert.equal(index.attempts[0].comparison.certifiedPhysicalPreMove,false);
  assert.equal(index.attempts[0].timing,'unverified');
  assert.throws(()=>validateObservation({...obs,moves:[{...obs.moves[0],fenBefore:initial.fen},...obs.moves.slice(1)]}),/FEN chain/);
});

test('predeclared sampling skips nonsampled positions without spending provider credits',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-sampling-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const result=await cycle({root,clock:()=>new Date('2026-11-24T14:05:00.000Z'),
      fetcher:async()=>({ok:true,text:async()=>gameTwo}),
      providerRequest:async()=>{throw new Error('Provider must not be called at nonsampled ply 2');},
      keys:{OPENAI_API_KEY:'test-only'}});
    assert.equal(result.status,'position-not-in-sample');
    assert.equal(result.ply,2);assert.equal(result.newAttempts,0);
    const collected=await collect({root});
    assert.equal(collected.observedGames[0].moves.length,1);
    assert.deepEqual(collected.attempts,[]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('global request ceiling blocks later provider calls across positions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-budget-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const clock=()=>new Date('2026-11-24T14:05:00.000Z');
    let calls=0,pgnt=gameTwo;
    const options={root,clock,sampleEvery:1,maxRequests:1,
      fetcher:async()=>({ok:true,text:async()=>pgnt}),
      providerRequest:async()=>{calls++;return {output:'e7e5',model:model.version,responseId:'offline',elapsedMs:10,usage:null};},
      keys:{OPENAI_API_KEY:'test-only'}};
    assert.equal((await cycle(options)).newAttempts,1);
    pgnt=gameTwo.replace('1. e4 *','1. e4 e5 *');
    const later=await cycle(options);
    assert.equal(later.status,'total-request-ceiling-reached');
    assert.equal(later.newAttempts,0);
    assert.equal(calls,1);
    assert.equal((await collect({root})).observedGames[0].moves.length,2);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('first-observed timestamps are taken after completed PGN retrieval',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-observation-time-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const times=['2026-11-24T14:00:00.000Z','2026-11-24T14:00:04.000Z'];
    let i=0;
    const clock=()=>new Date(times[Math.min(i++,times.length-1)]);
    const result=await cycle({root,clock,fetcher:async()=>({ok:true,text:async()=>gameTwo}),keys:{},sampleEvery:1});
    assert.equal(result.status,'no-provider-credentials');
    const obs=JSON.parse(await readFile(join(root,'data/observations/game1.json'),'utf8'));
    assert.equal(obs.moves[0].firstObservedAt,times[1]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('provider readiness allowlist is enforced before any paid request',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-ready-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify({
      ...roster,models:[model,{
        id:'anthropic-claude-fable-5-2',name:'Claude Fable 5.2',
        provider:'anthropic',version:'claude-fable-5-2',capture:true
      }]
    }));
    const calls=[];
    const options={root,clock:()=>new Date('2026-11-25T14:05:00.000Z'),
      fetcher:async()=>({ok:true,text:async()=>gameTwo}),sampleEvery:1,
      keys:{OPENAI_API_KEY:'offline-key',ANTHROPIC_API_KEY:'offline-key'},
      providerRequest:async({provider})=>{calls.push(provider);
        return {output:'e7e5',model:model.version,responseId:'offline',elapsedMs:1,usage:null};}
    };
    await assert.rejects(()=>cycle({...options,captureProviders:['unknown']}),/allowlist/);
    assert.deepEqual(calls,[]);
    const result=await cycle({...options,captureProviders:['openai']});
    assert.equal(result.newAttempts,1);
    assert.deepEqual(calls,['openai']);
    assert.equal((await collect({root})).attempts.length,1);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('GitHub workflow reference is recorded but never treated as proof of physical move time',async()=>{
  const keys={OPENAI_API_KEY:'offline-key',GITHUB_ACTIONS:'true',
    GITHUB_REPOSITORY:'fraware/grandmaster-vs-model',GITHUB_RUN_ID:'44719842201',
    GITHUB_RUN_ATTEMPT:'2'};
  assert.deepEqual(currentWorkflowContext(keys),{
    repository:'fraware/grandmaster-vs-model',runId:'44719842201',runAttempt:'2'
  });
  assert.throws(()=>currentWorkflowContext({...keys,GITHUB_RUN_ID:'-1'}),/provenance/);
  assert.equal(currentWorkflowContext({}),null);
  const root=await mkdtemp(join(tmpdir(),'gvm-provenance-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const options={root,clock:()=>new Date('2026-11-25T14:05:00.000Z'),
      fetcher:async()=>({ok:true,text:async()=>gameTwo}),sampleEvery:1,
      keys,providerRequest:async()=>({output:'e7e5',model:model.version,responseId:'fixture',elapsedMs:2,usage:null})};
    // A production-origin prediction must reference a previously recorded
    // durable claim. The fixture models the two phases locally; it does not
    // assert that any real remote publication or provider request occurred.
    const reserved=await cycle({...options,mode:'reserve'});
    assert.equal(reserved.newReservations,1);
    const result=await cycle({...options,mode:'execute'});
    assert.equal(result.newAttempts,1);
    const raw=JSON.parse(await readFile(join(root,'data/attempts/g02-p002-openai-gpt-6-2-astra.json'),'utf8'));
    assert.deepEqual(raw.captureRun,currentWorkflowContext(keys));
    const index=await collect({root});
    assert.deepEqual(index.attempts[0].captureRun,currentWorkflowContext(keys));
    assert.equal(index.reservations[0].status,'completed');
    assert.equal(index.attempts[0].reservationDigest,index.reservations[0].digest);
    assert.equal(index.attempts[0].timing,'unverified');
    assert.equal(index.attempts[0].comparison,null);
    assert.equal(index.attempts[0].publication,'operator-supplied');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('collector refuses an explicitly mislabeled round without a model request',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-round-mismatch-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    let providerCalls=0;
    const mislabeled='[Round "1"]\n'+gameTwo;
    await assert.rejects(()=>cycle({
      root,clock:()=>new Date('2026-11-25T14:05:00.000Z'),
      fetcher:async()=>({ok:true,text:async()=>mislabeled}),
      providerRequest:async()=>{providerCalls++;throw Error('Must not call provider');},
      sampleEvery:1,keys:{OPENAI_API_KEY:'offline-test-only'}
    }),/round tag conflicts/);
    assert.equal(providerCalls,0);
    const ledger=await collect({root});
    assert.equal(ledger.observedGames.length,0);
    assert.equal(ledger.attempts.length,0);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('collector rejects legally replayable nonstandard FEN before any reservation or paid call',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gvm-alternate-start-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    const altered='[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"]\n'+gameTwo;
    let providerCalls=0;
    const options={
      root,clock:()=>new Date('2026-11-25T14:05:00.000Z'),
      fetcher:async()=>({ok:true,text:async()=>altered}),
      providerRequest:async()=>{providerCalls++;throw Error('Unexpected paid provider call');},
      sampleEvery:1,keys:{OPENAI_API_KEY:'offline-test-only'}
    };
    await assert.rejects(()=>cycle(options),/Non-standard championship starting position/);
    assert.equal(providerCalls,0);
    const index=await collect({root});
    assert.equal(index.observedGames.length,0);
    assert.equal(index.reservations.length,0);
    assert.equal(index.attempts.length,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
