import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cycle} from '../scripts/forecast-cycle.mjs';
import {collect} from '../scripts/collection.mjs';
import {canonical} from '../src/protocol.mjs';
import {validateReservation,validateCaptureRun} from '../src/reservations.mjs';

const model={id:'openai-gpt-6-2-astra',name:'GPT-6.2 Astra',
  provider:'openai',version:'gpt-6.2-astra',capture:true};
const roster={schema:'model-roster-v1',verifiedOn:'2026-11-19',models:[model]};
const position='[Event "FIDE World Chess Championship 2026"]\n'+
  '[White "Gukesh D"]\n[Black "Javokhir Sindarov"]\n[Result "*"]\n\n1. e4 *';
const advanced=position.replace('1. e4 *','1. e4 e5 *');
const fixed=()=>new Date('2026-11-24T14:05:00.000Z');
const keys={
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'fraware/grandmaster-vs-model',
  GITHUB_RUN_ID:'44750000001',GITHUB_RUN_ATTEMPT:'1',
  OPENAI_API_KEY:'offline-test-only'
};
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const claimFile='g01-p002-openai-gpt-6-2-astra.json';
const fixture=text=>async()=>({ok:true,text:async()=>text});
async function workspace(fn){
  const root=await mkdtemp(join(tmpdir(),'gvm-reservation-'));
  try{
    await mkdir(join(root,'data'));
    await writeFile(join(root,'data/models.json'),JSON.stringify(roster));
    return await fn(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
const params=(root,overrides={})=>({
  root,clock:fixed,keys,fetcher:fixture(position),
  sampleEvery:1,maxRequests:2,captureProviders:['openai'],...overrides
});

test('durable reservation has a stable identity, exact source and validated GitHub owner',async()=>workspace(async root=>{
  let calls=0;
  const result=await cycle(params(root,{mode:'reserve',
    providerRequest:async()=>{calls++;throw Error('No provider request during reservation');}}));
  assert.equal(result.status,'reserved-awaiting-publication');
  assert.equal(result.newReservations,1);
  assert.equal(calls,0);
  const raw=JSON.parse(await readFile(join(root,'data/claims',claimFile),'utf8'));
  assert.equal(validateReservation(raw),true);
  assert.equal(validateCaptureRun(raw.captureRun),true);
  assert.equal(raw.digest,digest(Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='digest'))));
  assert.equal(raw.game,1);assert.equal(raw.ply,2);
  const index=await collect({root});
  assert.equal(index.reservations.length,1);
  assert.equal(index.reservations[0].status,'unresolved');
  assert.equal(index.attempts.length,0);
}));

test('execute without an existing reservation never calls any provider',async()=>workspace(async root=>{
  let calls=0;
  const result=await cycle(params(root,{mode:'execute',providerRequest:async()=>{
    calls++;throw Error('unreserved request');
  }}));
  assert.equal(result.status,'no-current-run-reservations');
  assert.equal(calls,0);
}));

test('executed result links to original reservation and never repeats',async()=>workspace(async root=>{
  let calls=0;
  const p=params(root,{providerRequest:async()=>{calls++;return{
    output:'e7e5',responseId:'test-only',model:model.version,
    elapsedMs:10,usage:{input_tokens:20}
  };}});
  assert.equal((await cycle({...p,mode:'reserve'})).newReservations,1);
  const result=await cycle({...p,mode:'execute'});
  assert.equal(result.status,'captured-provisional');
  assert.equal(result.newAttempts,1);
  assert.equal(calls,1);
  const again=await cycle({...p,mode:'execute'});
  assert.equal(again.newAttempts,0);
  assert.equal(calls,1);
  const claim=JSON.parse(await readFile(join(root,'data/claims',claimFile),'utf8'));
  const attempt=JSON.parse(await readFile(join(root,'data/attempts',claimFile),'utf8'));
  assert.equal(attempt.reservationDigest,claim.digest);
  assert.equal(attempt.promptSha256,claim.promptSha256);
  const index=await collect({root});
  assert.equal(index.reservations[0].status,'completed');
  assert.equal(index.attempts[0].reservationDigest,claim.digest);
  assert.equal(index.attempts[0].timing,'unverified');
}));

test('unresolved claim blocks a new Actions run even without a completed request',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve'}));
  const newer={...keys,GITHUB_RUN_ID:'44750000002'};
  let calls=0;
  const options=params(root,{keys:newer,providerRequest:async()=>{calls++;throw Error('duplicated');}});
  const reserved=await cycle({...options,mode:'reserve'});
  const executed=await cycle({...options,mode:'execute'});
  assert.equal(reserved.status,'position-already-reserved');
  assert.equal(executed.status,'no-current-run-reservations');
  assert.equal(calls,0);
  assert.equal((await collect({root})).reservations[0].status,'unresolved');
}));

test('a changed source position leaves the old reservation unresolved, without billing',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve'}));
  let calls=0;
  const result=await cycle(params(root,{mode:'execute',fetcher:fixture(advanced),
    providerRequest:async()=>{calls++;throw Error('stale request');}}));
  assert.equal(result.newAttempts,0);
  assert.equal(calls,0);
  assert.equal((await collect({root})).reservations[0].status,'unresolved');
}));

test('request cap includes unresolved reservations before another position',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve',maxRequests:1}));
  let calls=0;
  const result=await cycle(params(root,{mode:'reserve',maxRequests:1,
    fetcher:fixture(advanced),providerRequest:async()=>{calls++;}}));
  assert.equal(result.status,'total-request-ceiling-reached');
  assert.equal(calls,0);
  assert.equal((await collect({root})).reservations.length,1);
}));

test('tampered reservation checksum fails before a paid request',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve'}));
  const file=join(root,'data/claims',claimFile);
  const doc=JSON.parse(await readFile(file,'utf8'));
  doc.fen='not a FEN';
  await writeFile(file,JSON.stringify(doc));
  await assert.rejects(()=>collect({root}),/checksum/i);
  let calls=0;
  await assert.rejects(()=>cycle(params(root,{mode:'execute',
    providerRequest:async()=>{calls++;}})),/checksum/i);
  assert.equal(calls,0);
}));

test('even an internally rehashed reservation with an altered prompt is rejected',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve'}));
  const file=join(root,'data/claims',claimFile);
  const doc=JSON.parse(await readFile(file,'utf8'));
  doc.promptSha256='b'.repeat(64);
  const {digest:unused,...raw}=doc;
  doc.digest=digest(raw);
  await writeFile(file,JSON.stringify(doc));
  let calls=0;
  await assert.rejects(()=>cycle(params(root,{mode:'execute',
    providerRequest:async()=>{calls++;}})),/Reserved position or prompt changed/);
  assert.equal(calls,0);
}));

test('provider transport failure is recorded once against the reservation',async()=>workspace(async root=>{
  await cycle(params(root,{mode:'reserve'}));
  let calls=0;
  const options=params(root,{mode:'execute',providerRequest:async()=>{
    calls++;throw Error('offline network fixture');
  }});
  const result=await cycle(options);
  assert.equal(result.models[0].status,'request-failed');
  await cycle(options);
  assert.equal(calls,1);
  const index=await collect({root});
  assert.equal(index.reservations[0].status,'completed');
  assert.equal(index.attempts[0].status,'request-failed');
}));

test('production reservation phases reject a missing GitHub run identity',async()=>workspace(async root=>{
  let calls=0;
  const options=params(root,{mode:'reserve',keys:{OPENAI_API_KEY:'offline'},
    providerRequest:async()=>{calls++;}});
  await assert.rejects(()=>cycle(options),/requires a GitHub Actions run/);
  assert.equal(calls,0);
}));
