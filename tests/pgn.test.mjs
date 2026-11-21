import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePgn,replaySanMoves,findChampionshipGame,GAME_ONE_PGN} from '../src/pgn.mjs';

const historical=JSON.parse(readFileSync(new URL('../data/archive-2024.json',import.meta.url)));
test('replays every documented move from the 2024 World Championship final',()=>{
  const game=replaySanMoves(historical.moves.split(' '));
  assert.equal(game.moves.length,116);
  assert.equal(game.positions.length,117);
  assert.equal(game.moves[108].san,'Rf2');
  assert.equal(game.moves[108].uci,'f4f2');
  assert.equal(game.moves.at(-1).san,'Ke5');
  assert.equal(game.moves.at(-1).fenAfter,'8/8/8/4kp2/6p1/4K1P1/8/8 w - - 2 59');
});

test('parses a current-match PGN with comments, nested sidelines, and result',()=>{
  const pgn=`[Event "World Championship 2026"]
[White "Gukesh D"]
[Black "Javokhir Sindarov"]
[Result "*"]

1. e4 { clock: 1:58 } (1.d4 d5 (1... Nf6)) 1... e5 $1
2.Nf3 Nc6 3. Bb5 a6 *`;
  const game=findChampionshipGame(parsePgn(pgn));
  assert.deepEqual(game.moves.map(x=>x.san),['e4','e5','Nf3','Nc6','Bb5','a6']);
  assert.equal(game.moves[4].uci,'f1b5');
});

test('identifies target board even if other event boards occur first',()=>{
  const source=`[White "Other"]\n[Black "Other"]\n\n1. d4 d5 1/2-1/2\n\n[White "Sindarov"]\n[Black "Gukesh"]\n\n1. e4 c5 *`;
  const games=parsePgn(source);
  assert.equal(games.length,2);
  assert.deepEqual(findChampionshipGame(games).moves.map(m=>m.uci),['e2e4','c7c5']);
});

test('empty broadcast has no fabricated games',()=>{
  assert.deepEqual(parsePgn(''),[]);
  assert.equal(findChampionshipGame(parsePgn('')),null);
});

test('malformed and illegal moves fail closed',()=>{
  assert.throws(()=>parsePgn('[White "Gukesh"]\n[Black "Sindarov"]\n\n1. e4 e4'),/Unrecognized/);
  assert.throws(()=>parsePgn('1. e4 (1. d4'),/Incomplete/);
  assert.throws(()=>parsePgn('[Invalid Header]\n\n1. e4'),/Malformed/);
  assert.throws(()=>parsePgn('1. e4 @'),/Unsupported PGN token/);
});

test('broadcast uses confirmed Lichess round rather than an invented ID',()=>{
  assert.equal(GAME_ONE_PGN,'https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn');
});

test('pinned game selection rejects explicit contradictory round tags and ambiguous boards',()=>{
  const base='[White "Gukesh D"]\n[Black "Javokhir Sindarov"]\n[Result "*"]\n\n1. e4 *';
  const tagged=(tag)=>parsePgn(`[Round "${tag}"]\n${base}`);
  assert.equal(findChampionshipGame(tagged('1'),1).moves[0].uci,'e2e4');
  assert.equal(findChampionshipGame(tagged('Game 2'),2).moves[0].uci,'e2e4');
  assert.equal(findChampionshipGame(tagged('2.1'),2).moves[0].uci,'e2e4');
  assert.throws(()=>findChampionshipGame(tagged('2'),1),/round tag conflicts/);
  assert.throws(()=>findChampionshipGame(tagged('Game 1'),2),/round tag conflicts/);
  assert.equal(findChampionshipGame(tagged('?'),2).moves[0].uci,'e2e4');
  assert.equal(findChampionshipGame(parsePgn(base),2).moves[0].uci,'e2e4');
  assert.throws(()=>findChampionshipGame(tagged('2'),0),/Invalid expected/);
  assert.throws(()=>findChampionshipGame([...tagged('2'),...tagged('2')],2),/Ambiguous/);
  // Historical one-argument callers deliberately retain their old behavior.
  assert.equal(findChampionshipGame(tagged('2')).moves[0].uci,'e2e4');
});
