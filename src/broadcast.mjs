/** Validated, source-attributed broadcast caches. A retrieval time is not a move time. */
import {START_FEN, play} from './chess.mjs';
import {GAME_ONE_PGN, findChampionshipGame, parsePgn} from './pgn.mjs';

export const BROADCAST_SCHEMA = 'broadcast-snapshot-v1';
export const GAME_ONE_ROUND_ID = 'xLgOJ6cb';

export function validateAppendOnly(previous, current) {
  if (!previous || !current) return;
  if (current.moves.length < previous.moves.length) {
    throw new Error('Broadcast history decreased');
  }
  for (let i = 0; i < previous.moves.length; i++) {
    if (current.moves[i].uci !== previous.moves[i].uci) {
      throw new Error(`Broadcast changed move ${i + 1}`);
    }
  }
}

/** Serializes legal moves into a small file suitable for static site hosting. */
export function snapshotFromPgn(pgn, fetchedAt) {
  if (typeof fetchedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(fetchedAt) || Number.isNaN(Date.parse(fetchedAt))) {
    throw new Error('A valid UTC retrieval timestamp is needed');
  }
  const games = parsePgn(pgn);
  const selected = findChampionshipGame(games);
  if (!selected && games.some(g => g.moves.length)) throw new Error('Target championship game not identified');
  return {
    schema: BROADCAST_SCHEMA,
    roundId: GAME_ONE_ROUND_ID,
    source: GAME_ONE_PGN,
    fetchedAt,
    game: selected ? {
      white: selected.tags.White || null,
      black: selected.tags.Black || null,
      result: selected.tags.Result || '*',
      moves: selected.moves.map(m => m.uci),
    } : null,
  };
}

/** A cached file is untrusted input, even if served from the project's own site. */
export function restoreSnapshot(data) {
  if (!data || data.schema !== BROADCAST_SCHEMA || data.roundId !== GAME_ONE_ROUND_ID || data.source !== GAME_ONE_PGN) {
    throw new Error('Unexpected broadcast snapshot identity');
  }
  if (data.game === null) return null;
  if (typeof data.fetchedAt !== 'string' || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('Invalid snapshot retrieval time');
  const game = data.game;
  if (!game || !Array.isArray(game.moves) || game.moves.length > 500 || !['*', '1-0', '0-1', '1/2-1/2'].includes(game.result)) throw new Error('Invalid snapshot game');
  if (typeof game.white !== 'string' || typeof game.black !== 'string') throw new Error('Missing player identities');
  if (!/gukesh|dommaraju/i.test(`${game.white} ${game.black}`) || !/sindarov/i.test(`${game.white} ${game.black}`)) throw new Error('Snapshot players differ from championship');
  const moves=[],positions=[START_FEN];
  let fen=START_FEN;
  for (const [i,uci] of game.moves.entries()) {
    const m=play(fen,uci);
    moves.push({ply:i+1,uci:m.uci,san:m.san,fenBefore:fen,fenAfter:m.fen});
    fen=m.fen;
    positions.push(fen);
  }
  return {tags:{White:game.white,Black:game.black,Result:game.result},moves,positions};
}
