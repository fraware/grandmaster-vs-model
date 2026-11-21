/**
 * Deterministic historical challenge derived from the sourced 2024 Game 14 PGN.
 * Scores represent local human guesses. They are never model evaluations.
 */
import {withSans} from './chess.mjs';

export const CHALLENGE_SCHEMA = 'grandmaster-challenge-v1';
export const CHALLENGE_PLIES = Object.freeze([28, 61, 108]);
const expectedUci = ['b5c3', 'f8a8', 'f4f2'];
const chapters = [
  {stage: 'Opening · position 1', title: 'What did Ding play?', detail: 'Ding Liren · White to move · Move 15'},
  {stage: 'Middlegame · position 2', title: 'What did Gukesh play?', detail: 'Gukesh D · Black to move · Move 31'},
  {stage: 'Endgame · position 3', title: 'One last move.', detail: 'Ding Liren · White to move · Move 55'},
];

/** Validate the underlying game and construct three reproducible positions. */
export function createChallenge(archive, replay) {
  if (archive?.schema !== 'historical-game-v1' || archive.game !== 14 ||
      archive.date !== '2024-12-12' || archive.white !== 'Ding Liren' ||
      archive.black !== 'Gukesh D' || !String(archive.source).startsWith('https://lichess.org/')) {
    throw new Error('Unexpected historical source');
  }
  if (replay?.moves?.length !== 116 || replay.positions?.length !== 117) {
    throw new Error('Historical game is incomplete');
  }
  return CHALLENGE_PLIES.map((ply, index) => {
    const actual = replay.moves[ply];
    if (actual?.uci !== expectedUci[index]) throw new Error(`Historical move ${ply + 1} changed`);
    const fen = replay.positions[ply];
    const legalMoves = withSans(fen).map(({uci, san}) => ({uci, san}));
    if (legalMoves.length < 6 || !legalMoves.some(move => move.uci === actual.uci)) {
      throw new Error(`Invalid challenge position ${ply + 1}`);
    }
    return Object.freeze({
      schema: CHALLENGE_SCHEMA,
      index, ply, fen,
      player: ply % 2 === 0 ? archive.white : archive.black,
      color: ply % 2 === 0 ? 'white' : 'black',
      answer: Object.freeze({uci: actual.uci, san: actual.san}),
      legalMoves: Object.freeze(legalMoves),
      ...chapters[index],
    });
  });
}

/**
 * Four additional, fixed three-position sets from the same legally replayed
 * championship final. These are historical practice positions, with no
 * associated model API attempt. The fixed plies make results reproducible.
 */
export const PRACTICE_PLIES = Object.freeze([
  Object.freeze([12, 41, 84]),
  Object.freeze([20, 48, 92]),
  Object.freeze([32, 67, 100]),
  Object.freeze([36, 76, 104]),
]);

export function createPracticeDecks(archive, replay) {
  // Reuse the strict archive and complete-game checks in createChallenge.
  createChallenge(archive, replay);
  const used = new Set(CHALLENGE_PLIES);
  return Object.freeze(PRACTICE_PLIES.map((plies, deck) => Object.freeze(plies.map((ply, index) => {
    if (used.has(ply) || !Number.isInteger(ply) || ply < 0 || ply >= replay.moves.length) {
      throw new Error('Practice position is duplicated or outside the recorded game');
    }
    used.add(ply);
    const actual = replay.moves[ply];
    const fen = replay.positions[ply];
    const legalMoves = withSans(fen).map(({uci, san}) => ({uci, san}));
    if (!actual || legalMoves.length < 8 || !legalMoves.some(m => m.uci === actual.uci && m.san === actual.san)) {
      throw new Error(`Invalid recorded practice position ${ply + 1}`);
    }
    const player = ply % 2 === 0 ? archive.white : archive.black;
    const color = ply % 2 === 0 ? 'white' : 'black';
    return Object.freeze({
      schema:CHALLENGE_SCHEMA, index, ply, fen, player, color,
      answer:Object.freeze({uci:actual.uci, san:actual.san}),
      legalMoves:Object.freeze(legalMoves),
      stage:`Practice set ${deck + 2} · position ${index + 1}`,
      title:`What did ${player.split(' ')[0]} play?`,
      detail:`${player} · ${color[0].toUpperCase() + color.slice(1)} to move · Move ${Math.floor(ply / 2) + 1}`,
    });
  }))));
}

/** Derive an exact-match score only for completed, legal, locally held answers. */
export function scoreChallenge(questions, answers) {
  if (!Array.isArray(questions) || questions.length !== CHALLENGE_PLIES.length ||
      !Array.isArray(answers) || answers.length !== questions.length) {
    throw new Error('Invalid challenge scoring input');
  }
  let correct = 0;
  answers.forEach((answer, index) => {
    if (!answer || typeof answer !== 'string') throw new Error('Challenge is incomplete');
    if (!questions[index].legalMoves.some(move => move.uci === answer)) {
      throw new Error('Score input contains an illegal move');
    }
    if (questions[index].answer.uci === answer) correct++;
  });
  return {correct, total: questions.length};
}

/**
 * Decode a peer's self-reported score for exactly one of the five fixed
 * three-position decks. Query strings are user-editable; neither a shared
 * target nor a local result is an authenticated score or a public ranking.
 * Invalid/ambiguous links are ignored rather than trusted or partially used.
 */
export function parsePeerChallenge(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  const set = parsed.searchParams.getAll('set');
  const target = parsed.searchParams.getAll('target');
  if (set.length !== 1 || target.length !== 1 ||
      !/^[1-5]$/.test(set[0]) || !/^[0-3]$/.test(target[0])) return null;
  return Object.freeze({set:Number(set[0]),target:Number(target[0])});
}

/** Human-readable comparisons remain explicitly self-reported. */
export function peerChallengeOutcome(correct, target) {
  if (!Number.isInteger(correct) || correct < 0 || correct > 3 ||
      !Number.isInteger(target) || target < 0 || target > 3) {
    throw new Error('Invalid peer challenge comparison');
  }
  if(correct > target) return `You beat the shared ${target}/3 target.`;
  if(correct === target) return `You matched the shared ${target}/3 target.`;
  return `You scored ${correct}/3 against the shared ${target}/3 target. Try again, or send your own result.`;
}

/** Sharing deliberately excludes any fabricated public ranking or model comparison. */
export function challengeShareText(correct, url, matches = null, comparison = null, {set = 1} = {}) {
  if (!Number.isInteger(correct) || correct < 0 || correct > CHALLENGE_PLIES.length) {
    throw new Error('Invalid challenge score');
  }
  if (matches !== null && (!Array.isArray(matches) || matches.length !== 3 ||
      matches.some(x => typeof x !== 'boolean') || matches.filter(Boolean).length !== correct)) {
    throw new Error('Inconsistent challenge result');
  }
  if (comparison !== null && (comparison?.name !== 'GPT-6.2 Astra' ||
      !Number.isInteger(comparison.score) || comparison.score < 0 || comparison.score > 3)) {
    throw new Error('Invalid historical model comparison');
  }
  if (!Number.isInteger(set) || set < 1 || set > 5) throw new Error('Invalid challenge set');
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Invalid challenge URL');
  u.search = '';
  u.searchParams.set('set', String(set));
  u.searchParams.set('target', String(correct));
  u.hash = 'challenge';
  const grid = matches ? `${matches.map(hit => hit ? '🟩' : '⬛').join('')}\n` : '';
  const comparisonText = comparison
    ? `GPT-6.2 Astra went ${comparison.score}/3 in a RETROSPECTIVE API run (the 2024 game was already known).\n`
    : '';
  return `I matched ${correct}/3 grandmaster moves in set ${set}/5 of the 2024 World Championship final.\n${grid}\n${comparisonText}Can you beat this score on the same positions?\nShared scores are self-reported.\n${u.toString()}`;
}
