/** Strict standard-chess PGN parser for the public Lichess broadcast and archive.
 * No remote text is inserted into HTML; all accepted moves are replayed legally.
 */
import {START_FEN, play, withSans} from './chess.mjs';

function normalizeSan(token) {
  return token.replace(/[!?]+$/g, '').replace(/[+#]+$/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
}

export function replaySanMoves(sanMoves, fen=START_FEN) {
  const positions=[fen], moves=[];
  for (const [index,token] of sanMoves.entries()) {
    if (typeof token !== 'string' || !token.trim()) throw new Error(`Missing SAN at ply ${index+1}`);
    const norm=normalizeSan(token);
    const valid=withSans(fen).filter(move => normalizeSan(move.san) === norm);
    if(valid.length !== 1)throw new Error(`Unrecognized or ambiguous SAN at ply ${index+1}: ${token}`);
    const applied=play(fen,valid[0].uci);
    moves.push({ply:index+1,uci:applied.uci,san:applied.san,fenBefore:fen,fenAfter:applied.fen});
    fen=applied.fen;positions.push(fen);
  }
  return {moves,positions};
}

function removeCommentsAndVariations(input) {
  let result='',brace=0,variation=0,lineComment=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(brace){if(c==='{')brace++;else if(c==='}')brace--;continue;}
    if(c==='{'){brace=1;continue;}
    if(c===';'){lineComment=true;continue;}
    if(c==='('){variation++;continue;}
    if(c===')'){if(variation===0)throw new Error('Unexpected PGN variation ending');variation--;continue;}
    if(variation===0)result+=c;
  }
  if(brace||variation)throw new Error('Incomplete PGN comment or variation');
  return result;
}

function moveTokens(text){
  const stripped=removeCommentsAndVariations(text).replace(/\$\d+/g,' ');
  const tokens=stripped.split(/\s+/).filter(Boolean),out=[];
  for(const token of tokens){
    const clean=token.replace(/^\d+\.(?:\.\.)?/, '').trim();
    if(!clean||/^\d+\.{1,3}$/.test(clean)||/^\.{2,3}$/.test(clean))continue;
    if(['1-0','0-1','1/2-1/2','*'].includes(clean))continue;
    if(!/^(?:[a-hKQRBNO0][a-h1-8x=+#O0\-!?]*)$/.test(clean))throw new Error(`Unsupported PGN token: ${token}`);
    out.push(clean);
  }
  return out;
}

/** Parse a PGN document containing one or more Lichess broadcast games. */
export function parsePgn(text) {
  if(typeof text!=='string')throw new Error('PGN response must be text');
  if(text.length>1_000_000)throw new Error('PGN exceeds allowed size');
  const games=[];let tags={},body=[];
  const flush=()=>{
    if(!body.join('').trim()&&!Object.keys(tags).length)return;
    const sans=moveTokens(body.join('\n'));
    const initial=tags.FEN || START_FEN;
    games.push({tags, ...replaySanMoves(sans,initial)});
    tags={};body=[];
  };
  for(const line of text.replace(/\r\n/g,'\n').split('\n')){
    const tag=line.trim().match(/^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:[^"\\]|\\.)*)"\]$/);
    if(tag){
      if(body.some(x=>x.trim()))flush();
      tags[tag[1]]=tag[2].replace(/\\(["\\])/g,'$1');
    }else if(line.trim().startsWith('['))throw new Error('Malformed PGN tag');
    else body.push(line);
  }
  flush();
  return games;
}

/**
 * Select the target board, with an optional pinned round number.
 *
 * Player names alone cannot disambiguate different games of a multi-round
 * match. When the source explicitly identifies a numeric round (including
 * 1.1 or "Game 1"), reject a conflict with the requested Lichess round.
 * A missing or unrecognized Round tag is not independent evidence of identity;
 * the pinned source URL and legal history are checked by callers.
 *
 * Existing callers without an expectedRound retain the legacy lookup used by
 * archival and standalone parsing tools.
 */
export function findChampionshipGame(games,expectedRound=null) {
  if(!Array.isArray(games))throw new Error('Invalid parsed broadcast games');
  if(expectedRound!==null&&(!Number.isInteger(expectedRound)||expectedRound<1||expectedRound>14))
    throw new Error('Invalid expected championship round');
  const matches=games.filter(game => {
    const names=[game.tags.White||'',game.tags.Black||''];
    return names.some(x=>/gukesh|dommaraju/i.test(x)) && names.some(x=>/sindarov/i.test(x));
  });
  if(expectedRound===null)return matches[0]||null;
  if(matches.length>1)throw new Error('Ambiguous championship boards in the pinned round feed');
  const chosen=matches[0]||null;
  const tag=chosen?.tags?.Round;
  if(typeof tag==='string'){
    const recognized=/^(?:game\s*)?(\d{1,2})(?:\.\d+)?$/i.exec(tag.trim());
    if(recognized&&Number(recognized[1])!==expectedRound)
      throw new Error('Broadcast round tag conflicts with the pinned game');
  }
  return chosen;
}

export const GAME_ONE_BROADCAST = 'https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb';
export const GAME_ONE_PGN = 'https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn';
