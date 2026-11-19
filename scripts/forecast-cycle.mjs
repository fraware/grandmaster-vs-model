#!/usr/bin/env node
/**
 * One cautious forecast polling cycle for FIDE 2026 Game 1.
 *
 * Each attempted provider call is recorded once, even if invalid or unsuccessful.
 * No result is certified as pre-move without independent public chronology.
 * Running repeatedly is safe: known positions are never invoiced twice.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makePrompt,parsePrediction,requestModel} from './model-runner.mjs';
import {parsePgn,findChampionshipGame,GAME_ONE_PGN} from '../src/pgn.mjs';
import {validateAppendOnly} from '../src/broadcast.mjs';
import {extendObservation,ATTEMPT_SCHEMA,attemptKey,validateAttempt,publicSource} from '../src/collection.mjs';
import {EVENT_ID,canonical} from '../src/protocol.mjs';
import {START_FEN,withSans} from '../src/chess.mjs';
import {collect} from './collection.mjs';
const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
const hash=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
const providerKeys={openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY'};
const intervalStart='2026-11-24T12:00:00Z', intervalEnd='2026-12-13T00:00:00Z';
export function withinMatchWindow(at){return Date.parse(at)>=Date.parse(intervalStart)&&Date.parse(at)<Date.parse(intervalEnd);}
export function sanitizeError(error){
  const msg=String(error?.message??error);
  const http=/HTTP\s+(\d{3})/.exec(msg);
  if(http)return `Provider HTTP ${http[1]}`;
  if(/timeout|aborted/i.test(msg))return 'Provider request timed out';
  if(/transport|fetch|network/i.test(msg))return 'Provider network request failed';
  return 'Provider response validation failed';
}
async function broadcast(fetcher){
  const response=await fetcher(GAME_ONE_PGN,{headers:{Accept:'application/x-chess-pgn'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error(`Broadcast source HTTP ${response.status}`);
  const pgn=await response.text();
  const games=parsePgn(pgn),game=findChampionshipGame(games);
  if(!game&&games.some(g=>g.moves.length))throw new Error('Broadcast identity mismatch');
  return game;
}
/** Test-injectable orchestration. Do not log response bodies or environment secrets. */
export async function cycle({root=defaultRoot,fetcher=fetch,providerRequest=requestModel,clock=()=>new Date(),keys=process.env,activeOnly=true}={}){
  const dir=resolve(root);
  const at=clock().toISOString();
  if(activeOnly&&!withinMatchWindow(at))return {status:'outside-match-window',newAttempts:0};
  const sourceGame=await broadcast(fetcher);
  const observationsPath=join(dir,'data/observations/game1.json');
  const existing=existsSync(observationsPath)?JSON.parse(await readFile(observationsPath,'utf8')):null;
  if(!sourceGame){
    if(existing?.moves.length)throw new Error('Broadcast lost previously recorded moves');
    return {status:'awaiting-identified-game',newAttempts:0};
  }
  // This match uses standard chess from the initial position. Reject an
  // unrelated/FEN-injected PGN, even if the player names happen to match.
  if(sourceGame.positions[0]!==START_FEN)throw new Error('Non-standard championship starting position');
  // Validate observed history before any paid provider calls.
  const previousGame=existing?{moves:existing.moves}:null;
  validateAppendOnly(previousGame,sourceGame);
  const observations=extendObservation(existing,sourceGame,at);
  const known=existing?.moves.length??0;
  if(observations.moves.length!==known){
    await mkdir(join(dir,'data/observations'),{recursive:true});
    await writeFile(observationsPath,JSON.stringify(observations,null,2)+'\n');
  }
  if(sourceGame.tags.Result && sourceGame.tags.Result!=='*'){
    await collect({root:dir,write:true});
    return {status:'game-finished',newObservations:observations.moves.length-known,newAttempts:0};
  }
  const ply=sourceGame.moves.length+1,fen=sourceGame.positions.at(-1);
  const side=ply%2===1?'White':'Black',opponent=side==='White'?'Black':'White';
  const player=sourceGame.tags[side],opponentName=sourceGame.tags[opponent];
  if(!player||!opponentName){
    await collect({root:dir,write:true});
    return {status:'awaiting-player-colors',newObservations:observations.moves.length-known,newAttempts:0};
  }
  const roster=JSON.parse(await readFile(join(dir,'data/models.json'),'utf8'));
  if(roster.schema!=='model-roster-v1'||!Array.isArray(roster.models))throw new Error('Invalid model roster');
  const models=roster.models.filter(m=>m.capture&&keys[providerKeys[m.provider]]);
  if(!models.length){
    await collect({root:dir,write:true});
    return {status:'no-provider-credentials',newObservations:observations.moves.length-known,newAttempts:0};
  }
  // Canonical player strings prevent untrusted PGN tag text from becoming
  // instructions inside the provider prompt. Source identities are checked.
  const identify=name=>/gukesh|dommaraju/i.test(name)?'Gukesh D':/sindarov/i.test(name)?'Javokhir Sindarov':null;
  const actualWhite=identify(sourceGame.tags.White),actualBlack=identify(sourceGame.tags.Black);
  if(!actualWhite||!actualBlack||actualWhite===actualBlack)throw new Error('Broadcast player identities incomplete');
  const legal=withSans(fen).map(x=>x.uci);
  const prompt=makePrompt({fen,player:side==='White'?actualWhite:actualBlack,opponent:side==='White'?actualBlack:actualWhite,game:1,history:sourceGame.moves.map(m=>m.uci).join(' ')});
  const outdir=join(dir,'data/attempts');await mkdir(outdir,{recursive:true});
  const pending=models.filter(m=>!existsSync(join(outdir,`g01-p${String(ply).padStart(3,'0')}-${m.id}.json`)));
  if(!pending.length){
    await collect({root:dir,write:true});
    return {status:'position-already-attempted',ply,newAttempts:0};
  }
  const results=await Promise.all(pending.map(async model=>{
    const startedAt=clock().toISOString();
    let status='request-failed',response='',predictedUci=null,error=null,providerResponseId=null,providerReportedModel=null,elapsedMs=null,usage=null;
    try{
      const reply=await providerRequest({provider:model.provider,version:model.version,prompt,apiKey:keys[providerKeys[model.provider]],timeoutMs:40000,fetcher,workspaceId:model.provider==='anthropic'?(keys.ANTHROPIC_WORKSPACE_ID||null):null});
      response=reply.output;
      providerResponseId=reply.responseId;
      providerReportedModel=reply.model;
      elapsedMs=reply.elapsedMs;
      usage=reply.usage;
      try{predictedUci=parsePrediction(response,legal);status='valid';}
      catch{status='invalid';error='Model did not return one legal UCI move';}
    }catch(e){status='request-failed';error=sanitizeError(e);}
    const completedAt=clock().toISOString();
    return {schema:ATTEMPT_SCHEMA,event:EVENT_ID,game:1,ply,fen,source:publicSource,model:{id:model.id,name:model.name,provider:model.provider,version:model.version},prompt,promptSha256:hash(prompt),response,responseSha256:hash(response),status,predictedUci,error,startedAt,completedAt,providerResponseId,providerReportedModel,elapsedMs,usage};
  }));
  // A second PGN retrieval detects an obvious race. A successful check is not
  // proof that a forecast preceded a physical move or its public observation.
  let stillCurrent=false;
  try{
    const post=await broadcast(fetcher);
    validateAppendOnly(sourceGame,post);
    stillCurrent=Boolean(post&&post.moves.length===sourceGame.moves.length&&post.tags.Result!=='1-0'&&post.tags.Result!=='0-1'&&post.tags.Result!=='1/2-1/2');
  }catch{stillCurrent=false;}
  if(!stillCurrent){
    for(const record of results){
      if(record.status==='valid'){record.status='feed-changed';record.predictedUci=null;record.error='Postflight did not confirm the same open position';}
    }
  }
  for(const record of results)record.postflightConfirmed=stillCurrent;
  let newAttempts=0;
  for(const a of results){
    validateAttempt(a);
    const path=join(outdir,attemptKey(a)+'.json');
    await writeFile(path,JSON.stringify({...a,digest:hash(a)},null,2)+'\n',{flag:'wx'});
    newAttempts++;
  }
  await collect({root:dir,write:true});
  return {status:stillCurrent?'captured-provisional':'captured-with-feed-change',ply,newAttempts,newObservations:observations.moves.length-known,models:results.map(x=>({id:x.model.id,status:x.status}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2)throw new Error('Usage: node scripts/forecast-cycle.mjs');
  cycle().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(`Capture cycle failed: ${sanitizeError(error)}`);process.exitCode=1;});
}