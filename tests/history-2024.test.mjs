/** Exhaustive history integrity tests: all games, every SAN/UCI/FEN transition. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePgn} from '../src/pgn.mjs';
import {restoreHistoricalMatch} from '../src/history.mjs';
import {reconstruct2024} from '../scripts/build-history-2024.mjs';
import {START_FEN,play} from '../src/chess.mjs';

const directory = new URL('../',import.meta.url);
const load = name=>readFile(new URL(name,directory),'utf8');

test('all 14 source games reconstruct exactly to checked-in public record',async()=>{
  const generated=await reconstruct2024();
  const published=JSON.parse(await load('data/championship-2024.json'));
  assert.deepEqual(published,generated);
  assert.equal(generated.totalGames,14);
  assert.equal(generated.totalPlies,1270);
  const records=restoreHistoricalMatch(generated);
  assert.equal(records.length,14);
  assert.equal(records.reduce((n,g)=>n+g.moves.length,0),1270);
  for(const [i,g] of records.entries()){
    const raw=await load(`data/sources/2024/lichess-${String(i+1).padStart(2,'0')}.pgn`);
    const parsed=parsePgn(raw)[0];
    assert.equal(g.moves.length,parsed.moves.length);
    assert.equal(g.tags.Result,parsed.tags.Result);
    assert.equal(g.positions[0],START_FEN);
    for(let ply=0;ply<g.moves.length;ply++){
      assert.equal(g.moves[ply].uci,parsed.moves[ply].uci,`Game ${i+1} ply ${ply+1}`);
      assert.equal(g.moves[ply].san,parsed.moves[ply].san);
      assert.equal(g.moves[ply].fenBefore,g.positions[ply]);
      assert.equal(g.moves[ply].fenAfter,g.positions[ply+1]);
    }
  }
});

test('any forged move, FEN, player identity or result is rejected',async()=>{
  const data=JSON.parse(await load('data/championship-2024.json'));
  const variants=[
    x=>x.games[0].moves[0].uci='a2a3',
    x=>x.games[1].moves[16].fenAfter='invented',
    x=>x.games[3].white='Unrelated Player',
    x=>x.games[13].result='1-0',
    x=>x.games.pop(),
  ];
  for(const mutation of variants){
    const clone=structuredClone(data);
    mutation(clone);
    assert.throws(()=>restoreHistoricalMatch(clone));
  }
});

test('all 1,270 outputs legally follow the recorded position, without guessing timestamps',async()=>{
  const records=restoreHistoricalMatch(JSON.parse(await load('data/championship-2024.json')));
  for(const game of records){
    assert.ok(!('playedAt' in game),'The archive cannot invent physical move timestamps');
    for(const move of game.moves){
      const result=play(move.fenBefore,move.uci);
      assert.equal(result.fen,move.fenAfter);
      assert.equal(result.san,move.san);
    }
  }
});
