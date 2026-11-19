import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {replaySanMoves} from '../src/pgn.mjs';
import {createChallenge, scoreChallenge, challengeShareText, CHALLENGE_PLIES} from '../src/challenge.mjs';
const archive = JSON.parse(await readFile(new URL('../data/archive-2024.json', import.meta.url), 'utf8'));
const replay = replaySanMoves(archive.moves.trim().split(/\s+/));
const questions = createChallenge(archive, replay);

test('three positions are reproducible from the actual, legally replayed championship final', () => {
  assert.deepEqual(questions.map(x => x.ply), [...CHALLENGE_PLIES]);
  assert.deepEqual(questions.map(x => x.answer.san), ['Nc3', 'Rxa8', 'Rf2']);
  assert.deepEqual(questions.map(x => x.player), ['Ding Liren', 'Gukesh D', 'Ding Liren']);
  assert.ok(questions.every(x => x.legalMoves.some(m => m.uci === x.answer.uci)));
});
test('scores correct and alternative legal predictions independently of strength', () => {
  const right = questions.map(q => q.answer.uci);
  assert.deepEqual(scoreChallenge(questions, right), {correct: 3, total: 3});
  const alternative = questions.map(q => q.legalMoves.find(m => m.uci !== q.answer.uci).uci);
  assert.deepEqual(scoreChallenge(questions, alternative), {correct: 0, total: 3});
  assert.deepEqual(scoreChallenge(questions, [right[0], alternative[1], right[2]]), {correct: 2, total: 3});
});
test('rejects illegal or missing user answers', () => {
  assert.throws(() => scoreChallenge(questions, ['a1a9',...questions.slice(1).map(q => q.answer.uci)]));
  assert.throws(() => scoreChallenge(questions, [null,...questions.slice(1).map(q => q.answer.uci)]));
});
test('rejects modified source data and source move history', () => {
  assert.throws(() => createChallenge({...archive, source: 'https://example.com'}, replay));
  assert.throws(() => createChallenge(archive, {...replay, moves: replay.moves.slice(0, 110)}));
  const changed = {...replay, moves: replay.moves.map((m, i) => i === 108 ? {...m, uci:'f4f3'} : m)};
  assert.throws(() => createChallenge(archive, changed));
});
test('share text uses canonical challenge URL without user result claims in query parameters', () => {
  const t = challengeShareText(2, 'https://fraware.github.io/grandmaster-vs-model/?mode=live&game=2#method');
  assert.match(t, /2\/3 moves/);
  assert.ok(t.endsWith('https://fraware.github.io/grandmaster-vs-model/#challenge'));
  assert.throws(() => challengeShareText(4, 'https://example.org'));
  assert.throws(() => challengeShareText(1, 'javascript:alert(1)'));
});

test('challenge share grid reflects actual answers, and rejects inconsistent outcomes', () => {
  const t=challengeShareText(2,'https://fraware.github.io/grandmaster-vs-model/?source=friend#method',[true,false,true]);
  assert.match(t,/🟩⬛🟩/u);
  assert.match(t,/2\/3 moves/);
  assert.ok(t.endsWith('/#challenge'));
  assert.throws(()=>challengeShareText(2,'https://example.org/',[true,false,false]),/Inconsistent/);
  assert.throws(()=>challengeShareText(2,'https://example.org/',[true,false,'yes']),/Inconsistent/);
});
