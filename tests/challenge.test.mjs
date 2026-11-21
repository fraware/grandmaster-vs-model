import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {replaySanMoves} from '../src/pgn.mjs';
import {createChallenge, createPracticeDecks, PRACTICE_PLIES, scoreChallenge, challengeShareText, parsePeerChallenge, peerChallengeOutcome, CHALLENGE_PLIES} from '../src/challenge.mjs';
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
test('share text encodes a self-reported target for an exact three-position set', () => {
  const t = challengeShareText(2, 'https://fraware.github.io/grandmaster-vs-model/?mode=live&game=2#method');
  assert.match(t, /2\/3 grandmaster moves/);
  assert.ok(t.endsWith('https://fraware.github.io/grandmaster-vs-model/?set=1&target=2#challenge'));
  assert.match(t,/Shared scores are self-reported/);
  assert.throws(() => challengeShareText(4, 'https://example.org'));
  assert.throws(() => challengeShareText(1, 'javascript:alert(1)'));
});

test('challenge share grid reflects actual answers, and rejects inconsistent outcomes', () => {
  const t=challengeShareText(2,'https://fraware.github.io/grandmaster-vs-model/?source=friend#method',[true,false,true]);
  assert.match(t,/🟩⬛🟩/u);
  assert.match(t,/2\/3 grandmaster moves/);
  assert.ok(t.endsWith('/?set=1&target=2#challenge'));
  assert.throws(()=>challengeShareText(2,'https://example.org/',[true,false,false]),/Inconsistent/);
  assert.throws(()=>challengeShareText(2,'https://example.org/',[true,false,'yes']),/Inconsistent/);
});

test('real historical model comparison is disclosed in share text before the canonical challenge URL', () => {
  const text = challengeShareText(2, 'https://fraware.github.io/grandmaster-vs-model/', [true,true,false],
    {name:'GPT-6.2 Astra',score:3});
  assert.match(text, /GPT-6\.2 Astra went 3\/3 in a RETROSPECTIVE API run/);
  assert.match(text, /2024 game was already known/);
  assert.ok(text.endsWith('https://fraware.github.io/grandmaster-vs-model/?set=1&target=2#challenge'));
  assert.throws(() => challengeShareText(2, 'https://example.org/', [true,true,false], {name:'GPT-6.2 Astra',score:4}));
});


test('four additional three-position sets reproduce distinct, legal 2024 moves', () => {
  const decks = createPracticeDecks(archive, replay);
  assert.equal(decks.length, 4);
  assert.deepEqual(decks.map(deck => deck.map(q => q.ply)), PRACTICE_PLIES.map(x => [...x]));
  const positions = decks.flatMap(deck => deck.map(q => q.ply));
  assert.equal(new Set([...positions, ...CHALLENGE_PLIES]).size, 15);
  for (const [index, deck] of decks.entries()) {
    assert.equal(deck.length, 3);
    assert.deepEqual(scoreChallenge(deck, deck.map(q => q.answer.uci)), {correct:3,total:3});
    assert.ok(deck.every(q => q.answer.uci === replay.moves[q.ply].uci));
    assert.ok(deck.every(q => q.legalMoves.some(m => m.uci === q.answer.uci && m.san === q.answer.san)));
    assert.ok(deck.every(q => q.stage.startsWith(`Practice set ${index + 2}`)));
  }
});

test('extra practice sets reject manipulated archival games and remain independent of model records', () => {
  assert.throws(() => createPracticeDecks({...archive, game:13}, replay));
  assert.throws(() => createPracticeDecks(archive, {...replay, moves:replay.moves.slice(0, 100)}));
  const practice = createPracticeDecks(archive, replay)[0];
  const answers = practice.map(q => q.legalMoves.find(m => m.uci !== q.answer.uci).uci);
  assert.deepEqual(scoreChallenge(practice, answers), {correct:0,total:3});
  const share = challengeShareText(0, 'https://fraware.github.io/grandmaster-vs-model/', [false,false,false]);
  assert.doesNotMatch(share, /GPT-6/);
});

test('shared links preserve the actual practice set and discard earlier tracking parameters',()=>{
  for(let set=1;set<=5;set++){
    for(let target=0;target<=3;target++){
      const shared=challengeShareText(target,
        'https://fraware.github.io/grandmaster-vs-model/?utm_source=irrelevant&game=7#models',
        null,null,{set});
      const url=shared.split('\n').at(-1);
      assert.equal(url,
        `https://fraware.github.io/grandmaster-vs-model/?set=${set}&target=${target}#challenge`);
      assert.deepEqual(parsePeerChallenge(url),{set,target});
    }
  }
  assert.throws(()=>challengeShareText(2,'https://example.org',null,null,{set:0}),/set/);
  assert.throws(()=>challengeShareText(2,'https://example.org',null,null,{set:6}),/set/);
  assert.throws(()=>challengeShareText(2,'https://example.org',null,null,{set:'2'}),/set/);
});

test('untrusted, ambiguous and malformed peer scores never produce a challenge',()=>{
  const base='https://fraware.github.io/grandmaster-vs-model/';
  for(const query of ['', '?set=1', '?target=2', '?set=0&target=2',
    '?set=6&target=2', '?set=02&target=2', '?set=1&target=02',
    '?set=1&target=4', '?set=1&target=-1', '?set=1&target=2&target=3',
    '?set=1&set=2&target=3', '?set=1&target=NaN', '?set=1&target=%3Cscript%3E']){
    assert.equal(parsePeerChallenge(base+query),null,query);
  }
  assert.equal(parsePeerChallenge('javascript:alert(1)'),null);
  assert.equal(parsePeerChallenge('invalid-url'),null);
});

test('head-to-head outcomes report local comparisons without claiming verified peer identity',()=>{
  assert.equal(peerChallengeOutcome(3,2),'You beat the shared 2/3 target.');
  assert.equal(peerChallengeOutcome(2,2),'You matched the shared 2/3 target.');
  assert.match(peerChallengeOutcome(1,2),/You scored 1\/3 against the shared 2\/3 target/);
  assert.throws(()=>peerChallengeOutcome(4,2),/Invalid/);
  assert.throws(()=>peerChallengeOutcome(2,-1),/Invalid/);
});
