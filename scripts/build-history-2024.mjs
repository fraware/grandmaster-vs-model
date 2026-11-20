/** Reconstruct every move in the completed 2024 Ding–Gukesh match from pinned
 * Lichess broadcast PGNs. Outputs are deterministic, checked against a separate
 * independently published PGN-Mentor recording at collection time.
 *
 * Run: node scripts/build-history-2024.mjs [--write]
 * This script performs no network calls, avoiding mutable upstream inputs in CI.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parsePgn,replaySanMoves} from '../src/pgn.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fromBase=(p)=>path.join(base,p);
const sha256=s=>createHash('sha256').update(s).digest('hex');
const normalizeName=name=>/gukesh/i.test(name)?'Gukesh D':/ding/i.test(name)?'Ding Liren':null;
const filenames=Array.from({length:14},(_,i)=>`data/sources/2024/lichess-${String(i+1).padStart(2,'0')}.pgn`);

export async function reconstruct2024() {
  const manifest=JSON.parse(await readFile(fromBase('data/sources/2024/audit.json'),'utf8'));
  if(manifest.schema!=='championship-source-audit-v1'||manifest.rounds?.length!==14)throw Error('Invalid historical source manifest');
  const games=[];
  for(let i=0;i<14;i++){
    const file=filenames[i];
    const bytes=await readFile(fromBase(file));
    const item=manifest.rounds[i];
    if(item.game!==i+1||item.sourceFile!==file||item.rawSha256!==sha256(bytes))throw Error(`Source hash/identity mismatch in Game ${i+1}`);
    const parsed=parsePgn(bytes.toString('utf8'));
    if(parsed.length!==1)throw Error(`Expected one recorded game in ${file}`);
    const record=parsed[0],tag=record.tags;
    const gameNumber=Number(tag.Round);
    const white=normalizeName(tag.White),black=normalizeName(tag.Black);
    if(gameNumber!==i+1||!white||!black||white===black||tag.Result!==item.result||tag.Date?.replaceAll('.','-')!==item.date)throw Error(`Game ${i+1} source metadata mismatch`);
    if(tag.BroadcastURL!==item.broadcast||tag.GameURL!==item.gameUrl||record.moves.length!==item.plies)throw Error(`Game ${i+1} source metadata/ply count mismatch`);
    const moveFingerprint=sha256(record.moves.map(x=>x.uci).join(' '));
    if(item.uciSha256!==moveFingerprint||item.agreement!==true)throw Error(`Game ${i+1} move fingerprint was not independently checked`);
    games.push({
      game:i+1,date:item.date,white,black,result:item.result,
      opening:tag.Opening||null,eco:tag.ECO||null,
      source:item.gameUrl,roundId:item.roundId,
      rawSourceSha256:item.rawSha256,uciSha256:item.uciSha256,
      plyCount:record.moves.length,
      moves:record.moves.map(({ply,uci,san,fenBefore,fenAfter})=>({ply,uci,san,fenBefore,fenAfter})),
    });
  }
  if(games[13].plyCount!==116||games[13].moves[108].uci!=='f4f2'||games[13].moves[108].san!=='Rf2')throw Error('Game 14 decisive move differs');
  const archive=JSON.parse(await readFile(fromBase('data/archive-2024.json'),'utf8'));
  const legacy=replaySanMoves(archive.moves.trim().split(/\s+/));
  if(legacy.moves.length!==games[13].moves.length||legacy.moves.some((move,i)=>move.uci!==games[13].moves[i].uci))throw Error('Existing public challenge is inconsistent with the pinned Game 14');
  const result={
    schema:'historical-match-2024-v1',title:'FIDE World Chess Championship Match 2024',
    players:['Ding Liren','Gukesh D'],totalGames:games.length,
    totalPlies:games.reduce((n,g)=>n+g.plyCount,0),
    sources:{primary:'Lichess 2024 World Championship broadcasts',license:'CC BY-SA 4.0',audit:'data/sources/2024/audit.json',independentComparison:'PGN Mentor WorldChamp2024.pgn'},
    games,
  };
  if(result.totalPlies!==1270)throw Error(`Expected 1,270 plies, got ${result.totalPlies}`);
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const generated=JSON.stringify(await reconstruct2024())+'\n';
    const target=fromBase('data/championship-2024.json');
    if(process.argv.includes('--write')){
      await writeFile(target,generated);
      console.log(`Wrote ${target}`);
    }else if(await readFile(target,'utf8')!==generated){
      throw Error('Generated 2024 match data differs; run npm run build:history');
    }
    console.log('Verified all 14 historical games and 1,270 legally reconstructed moves');
  }catch(error){console.error(error);process.exitCode=1;}
}
