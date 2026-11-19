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

/** Sharing deliberately excludes any fabricated public ranking or model comparison. */
export function challengeShareText(correct, url, matches = null, comparison = null) {
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
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Invalid challenge URL');
  u.hash = 'challenge';
  u.search = '';
  const grid = matches ? `${matches.map(hit => hit ? '🟩' : '⬛').join('')}\n` : '';
  const comparisonText = comparison
    ? `GPT-6.2 Astra went ${comparison.score}/3 in a RETROSPECTIVE API run (the 2024 game was already known).\n`
    : '';
  return `I guessed ${correct}/3 moves from the 2024 World Chess Championship final.\n${grid}\n${comparisonText}Think you can match or beat my score?\n${u.toString()}`;
}
