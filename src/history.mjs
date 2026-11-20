/** Fail-closed restoration of the independently cross-checked historical match.
 * Used by the research reader; game snapshots and move states are untrusted JSON.
 */
import {START_FEN,play} from './chess.mjs';

export const HISTORICAL_MATCH_SCHEMA='historical-match-2024-v1';
const expectedResults=['0-1','1/2-1/2','1-0','1/2-1/2','1/2-1/2','1/2-1/2','1/2-1/2','1/2-1/2','1/2-1/2','1/2-1/2','1-0','1-0','1/2-1/2','0-1'];
const white=(name)=>name==='Ding Liren'||name==='Gukesh D';

export function restoreHistoricalMatch(data){
  if(data?.schema!==HISTORICAL_MATCH_SCHEMA||data.totalGames!==14||data.totalPlies!==1270||!Array.isArray(data.games)||data.games.length!==14){
    throw new Error('Unexpected historical match identity or size');
  }
  const restored=[];
  let total=0;
  for(const [index,game] of data.games.entries()){
    if(game?.game!==index+1||!white(game.white)||!white(game.black)||game.white===game.black||game.result!==expectedResults[index]||
       typeof game.date!=='string'||!/^(2024-11-(?:2[5-9]|30)|2024-12-(?:0[1-9]|1[0-2]))$/.test(game.date)||
       typeof game.source!=='string'||!game.source.startsWith(`https://lichess.org/broadcast/fide-world-championship-2024/game-${index+1}/`)||
       !Array.isArray(game.moves)||game.moves.length!==game.plyCount||game.plyCount<40||game.plyCount>200){
      throw new Error(`Game ${index+1} has malformed historical metadata`);
    }
    let fen=START_FEN;
    const positions=[fen],moves=[];
    for(const [plyIndex,record] of game.moves.entries()){
      if(record?.ply!==plyIndex+1||record.fenBefore!==fen||typeof record.uci!=='string'||record.uci.length<4||record.uci.length>5)throw Error(`Game ${index+1}, ply ${plyIndex+1} has an invalid before-position`);
      const applied=play(fen,record.uci);
      if(applied.uci!==record.uci||applied.san!==record.san||applied.fen!==record.fenAfter)throw Error(`Game ${index+1}, ply ${plyIndex+1} failed legal reconstruction`);
      moves.push({ply:record.ply,uci:record.uci,san:record.san,fenBefore:fen,fenAfter:applied.fen});
      fen=applied.fen;positions.push(fen);
    }
    restored.push({game:game.game,source:game.source,date:game.date,opening:game.opening,eco:game.eco,result:game.result,plyCount:game.plyCount,
      tags:{White:game.white,Black:game.black,Result:game.result,Date:game.date,Round:String(game.game)},positions,moves});
    total+=game.plyCount;
  }
  if(total!==1270)throw Error(`Historical match has ${total} plies, expected 1,270`);
  if(restored[13].moves[108].uci!=='f4f2')throw Error('Game 14 decisive move differs');
  return restored;
}
