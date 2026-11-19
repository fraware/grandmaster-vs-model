import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN,parseFen,legalMoves,play,serializeFen,withSans,moveToUci} from '../src/chess.mjs';
function perft(fen,depth){if(depth===0)return 1;const moves=legalMoves(fen);if(depth===1)return moves.length;let nodes=0;for(const m of moves)nodes+=perft(play(fen,moveToUci(m)).fen,depth-1);return nodes;}
test('standard initial position produces exactly twenty legal moves',()=>{assert.equal(legalMoves(START_FEN).length,20);assert.equal(serializeFen(parseFen(START_FEN)),START_FEN);});
test('perft of starting position at depths 1, 2 and 3',()=>{for(const [depth,expected] of [[1,20],[2,400],[3,8902]])assert.equal(perft(START_FEN,depth),expected,`depth=${depth}`);});
test('perft of starting position at depth 4 includes special-case legality',()=>{assert.equal(perft(START_FEN,4),197281);});
test('legal opening UCI sequence and SAN notation',()=>{let fen=START_FEN;for(const [uci,san] of [['e2e4','e4'],['e7e5','e5'],['g1f3','Nf3'],['b8c6','Nc6'],['f1b5','Bb5'],['a7a6','a6']]){const next=play(fen,uci);assert.equal(next.san,san);fen=next.fen;}assert.throws(()=>play(fen,'a1a8'),/Illegal move/);});
test('castling is legal and moves rook, but attacked transit squares prohibit it',()=>{
  const allowed='r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.deepEqual(withSans(allowed).map(m=>m.uci).filter(u=>u==='e1g1'||u==='e1c1'),['e1g1','e1c1']);
  const result=play(allowed,'e1g1');assert.equal(result.san,'O-O');assert.equal(parseFen(result.fen).board[61],'R');
  const underAttack='r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1';
  assert.equal(withSans(underAttack).some(m=>m.uci==='e1g1'),false);
});
test('en passant capture is legal and removes the captured pawn',()=>{
  const fen='4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 25';
  const result=play(fen,'e5d6');assert.equal(result.san,'exd6');const state=parseFen(result.fen);
  assert.equal(state.board[27],'.');assert.equal(state.board[19],'P');
});
test('en passant exposing own king to rook attack is illegal',()=>{
  const fen='4k3/8/8/r2pP2K/8/8/8/8 w - d6 0 1';
  assert.equal(withSans(fen).some(m=>m.uci==='e5d6'),false);
});
test('promotion and underpromotion',()=>{
  const fen='4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  const moves=withSans(fen).filter(m=>m.uci.startsWith('a7a8'));
  assert.equal(moves.length,4);
  assert.equal(play(fen,'a7a8n').san,'a8=N');
  assert.equal(parseFen(play(fen,'a7a8q').fen).board[0],'Q');
});
test('invalid FEN and invalid UCI moves are rejected',()=>{
  for(const fen of ['invalid','8/8/8/8/8/8/8/8 w - - 0 1','8/8/8/8/8/8/8/K6k x - - 0 1','8/8/8/8/8/8/8/K6k w - z9 0 1'])assert.throws(()=>parseFen(fen));
  assert.throws(()=>play(START_FEN,'e2e5'),/Illegal/);
});
