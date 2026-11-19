import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {snapshotFromPgn,restoreSnapshot,validateAppendOnly} from '../src/broadcast.mjs';
import {parsePgn,findChampionshipGame} from '../src/pgn.mjs';
import {run} from '../scripts/cache-broadcast.mjs';
const sample='[White "Gukesh D"]\n[Black "Javokhir Sindarov"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const fetchedAt='2026-11-24T14:03:07.000Z';

test('pre-match committed snapshot discloses no observed moves or fake timestamp',()=>{
  const empty=JSON.parse(readFileSync(new URL('../data/live-game1.json',import.meta.url),'utf8'));
  assert.equal(empty.fetchedAt,null);
  assert.equal(restoreSnapshot(empty),null);
});

test('PGN snapshot round-trips legal moves and source provenance',()=>{
  const cache=snapshotFromPgn(sample,fetchedAt);
  assert.equal(cache.roundId,'xLgOJ6cb');
  assert.equal(cache.fetchedAt,fetchedAt);
  const restored=restoreSnapshot(JSON.parse(JSON.stringify(cache)));
  assert.deepEqual(restored.moves.map(x=>x.uci),['e2e4','e7e5','g1f3','b8c6']);
  assert.equal(restored.positions.length,5);
});

test('unidentified boards with moves must not be mistaken for championship',()=>{
  assert.throws(()=>snapshotFromPgn('[White "Player A"]\n[Black "Player B"]\n\n1. d4 *',fetchedAt),/Target championship/);
});

test('untrusted snapshots reject player misidentification, illegal UCI, and incorrect identifiers',()=>{
  const cache=snapshotFromPgn(sample,fetchedAt);
  assert.throws(()=>restoreSnapshot({...cache,roundId:'made-up'}),/identity/);
  assert.throws(()=>restoreSnapshot({...cache,game:{...cache.game,white:'Other'}}),/players/);
  assert.throws(()=>restoreSnapshot({...cache,game:{...cache.game,moves:['e2e5']}}),/Illegal/);
});

test('new observations must preserve every earlier played move',()=>{
  const older=findChampionshipGame(parsePgn(sample));
  const newer=findChampionshipGame(parsePgn(sample.replace(' *',' 3. Bb5 *')));
  assert.doesNotThrow(()=>validateAppendOnly(older,newer));
  assert.throws(()=>validateAppendOnly(newer,older),/decreased/);
  const changed=findChampionshipGame(parsePgn(sample.replace('e5','c5')));
  assert.throws(()=>validateAppendOnly(older,changed),/changed move 2/);
});

test('cache writer produces deterministic legally checked fixture and explicit failure result',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gvm-broadcast-'));
  try{
    const file=join(dir,'live.json');
    const response=await run(['--out',file], {now:()=>new Date(fetchedAt),fetch:async()=>new Response(sample,{status:200})});
    assert.equal(response.updated,true);
    const restored=restoreSnapshot(JSON.parse(await readFile(file,'utf8')));
    assert.equal(restored.moves.length,4);
    const unchanged=await run(['--out',file],{fetch:async()=>{throw Error('offline');}});
    assert.equal(unchanged.updated,false);
    assert.equal(restoreSnapshot(JSON.parse(await readFile(file,'utf8'))).moves.length,4);
  }finally{await rm(dir,{recursive:true,force:true});}
});
