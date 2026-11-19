#!/usr/bin/env node
/** Fetch a sourced Lichess PGN and build a legally validated static cache.
 * The site uses this solely as an observation fallback. No forecast is created.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFromPgn,restoreSnapshot} from '../src/broadcast.mjs';
import {GAME_ONE_PGN} from '../src/pgn.mjs';

export async function run(args, dependencies={}) {
  let fixture=null,output=null,strict=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--fixture' && args[i+1]) fixture=args[++i];
    else if(args[i]==='--out' && args[i+1]) output=args[++i];
    else if(args[i]==='--strict')strict=true;
    else throw new Error(`Unexpected CLI argument: ${args[i]}`);
  }
  if(!output)throw new Error('Provide --out OUTPUT_PATH; no source files are overwritten implicitly');
  const load=dependencies.fetch??globalThis.fetch;
  const timestamp=(dependencies.now??(()=>new Date()))().toISOString();
  try{
    let pgn;
    if(fixture)pgn=await readFile(fixture,'utf8');
    else{
      const response=await load(GAME_ONE_PGN, {headers:{Accept:'application/x-chess-pgn'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      pgn=await response.text();
    }
    const snapshot=snapshotFromPgn(pgn,timestamp);
    restoreSnapshot(snapshot); // Rejects invalid content even when produced by our own serializer.
    const path=resolve(output);
    await writeFile(path,JSON.stringify(snapshot,null,2)+'\n',{flag:'w'});
    return {updated:true,moves:snapshot.game?.moves.length||0,path};
  }catch(error){
    if(strict)throw error;
    return {updated:false,error:String(error)};
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run(process.argv.slice(2)).then(result=>{
    if(result.updated)console.log(`Broadcast cache: ${result.moves} legal moves staged at ${result.path}`);
    else console.warn(`Broadcast cache unchanged: ${result.error}`);
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
