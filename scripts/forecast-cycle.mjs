#!/usr/bin/env node
/**
 * One cautious forecast polling cycle for the scheduled FIDE 2026 game.
 *
 * Each attempted provider call is recorded once, even if invalid or unsuccessful.
 * No result is certified as pre-move without independent public chronology.
 * Production uses a remotely published reservation before provider requests.
 * In-flight interruptions remain unresolved and are never automatically retried.
 * The exported legacy mode is retained for isolated offline adapter tests only.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makePrompt,parsePrediction,requestModel} from './model-runner.mjs';
import {parsePgn,findChampionshipGame} from '../src/pgn.mjs';
import {roundInfo,activeRound} from '../src/match-2026.mjs';
import {validateAppendOnly} from '../src/broadcast.mjs';
import {extendObservation,ATTEMPT_SCHEMA,attemptKey,validateAttempt} from '../src/collection.mjs';
import {RESERVATION_SCHEMA,reservationKey,validateReservation} from '../src/reservations.mjs';
import {EVENT_ID,canonical} from '../src/protocol.mjs';
import {START_FEN,withSans} from '../src/chess.mjs';
import {collect} from './collection.mjs';
const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
const hash=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
const providerKeys={openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY'};
/**
 * Operator-supplied GitHub Actions reference. A signed GitHub attestation, when
 * available, independently binds a file digest to the workflow identity.
 * The environment reference itself is not cryptographic evidence.
 */
export function currentWorkflowContext(keys){
  if(keys?.GITHUB_ACTIONS!=='true')return null;
  const repository=keys.GITHUB_REPOSITORY,runId=keys.GITHUB_RUN_ID,runAttempt=keys.GITHUB_RUN_ATTEMPT;
  if(typeof repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||
     typeof runId!=='string'||!/^[1-9][0-9]{0,19}$/.test(runId)||
     typeof runAttempt!=='string'||!/^[1-9][0-9]{0,5}$/.test(runAttempt)){
    throw new Error('Invalid GitHub Actions provenance context');
  }
  return {repository,runId,runAttempt};
}
export function withinMatchWindow(at){return activeRound(at)!==null;}
export function sanitizeError(error){
  const msg=String(error?.message??error);
  const http=/HTTP\s+(\d{3})/.exec(msg);
  if(http)return `Provider HTTP ${http[1]}`;
  if(/timeout|aborted/i.test(msg))return 'Provider request timed out';
  if(/broadcast|source|PGN|source history|non-standard|player identit/i.test(msg))return 'Broadcast source retrieval or validation failed';
  if(/transport|fetch|network/i.test(msg))return 'Provider network request failed';
  return 'Provider response validation failed';
}
async function broadcast(fetcher,round){
  const response=await fetcher(round.pgnUrl,{headers:{Accept:'application/x-chess-pgn'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error(`Broadcast source HTTP ${response.status}`);
  const pgn=await response.text();
  const games=parsePgn(pgn),game=findChampionshipGame(games,round.game);
  if(!game&&games.some(g=>g.moves.length))throw new Error('Broadcast identity mismatch');
  return game;
}
/** Test-injectable orchestration. Do not log response bodies or environment secrets. */
export async function cycle({root=defaultRoot,fetcher=fetch,providerRequest=requestModel,clock=()=>new Date(),keys=process.env,activeOnly=true,gameNumber=null,sampleEvery=5,maxRequests=900,captureProviders=null,mode='legacy'}={}){
  const dir=resolve(root);
  if(!Number.isInteger(sampleEvery)||sampleEvery<1||sampleEvery>20)throw new Error('Invalid sampling stride');
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>10000)throw new Error('Invalid total request ceiling');
  if(captureProviders!==null&&(!Array.isArray(captureProviders)||captureProviders.length===0||
      captureProviders.some(p=>!Object.hasOwn(providerKeys,p))||
      new Set(captureProviders).size!==captureProviders.length)){
    throw new Error('Invalid capture provider allowlist');
  }
  if(!['legacy','reserve','execute'].includes(mode))throw new Error('Invalid collection phase');
  const captureRun=currentWorkflowContext(keys);
  if(mode!=='legacy'&&!captureRun)throw new Error('Durable collection requires a GitHub Actions run');
  const at=clock().toISOString();
  const scheduled=activeRound(at);
  if(activeOnly&&!scheduled)return {status:'outside-game-session',newAttempts:0};
  if(gameNumber!==null&&(!Number.isInteger(gameNumber)||gameNumber<1||gameNumber>14))throw new Error('Invalid game selector');
  const round=roundInfo(gameNumber??scheduled?.game??1);
  if(activeOnly&&round.game!==scheduled.game)throw new Error('Selected game is not the scheduled session');
  const sourceGame=await broadcast(fetcher,round);
  // The response-completion time is the earliest defensible local observation
  // time. The scheduling check above occurs before any PGN bytes arrive.
  const observedAt=clock().toISOString();
  const observationsPath=join(dir,`data/observations/game${round.game}.json`);
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
  const observations=extendObservation(existing,sourceGame,observedAt,round.game);
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
  // Predeclared deterministic selection varies ply parity over the game.
  // No retrospective cherry-picking based on position or model agreement.
  if((ply-1)%sampleEvery!==(round.game-1)%sampleEvery){
    await collect({root:dir,write:true});
    return {status:'position-not-in-sample',game:round.game,ply,newObservations:observations.moves.length-known,newAttempts:0};
  }
  const side=ply%2===1?'White':'Black',opponent=side==='White'?'Black':'White';
  const player=sourceGame.tags[side],opponentName=sourceGame.tags[opponent];
  if(!player||!opponentName){
    await collect({root:dir,write:true});
    return {status:'awaiting-player-colors',newObservations:observations.moves.length-known,newAttempts:0};
  }
  const roster=JSON.parse(await readFile(join(dir,'data/models.json'),'utf8'));
  if(roster.schema!=='model-roster-v1'||!Array.isArray(roster.models))throw new Error('Invalid model roster');
  const models=roster.models.filter(m=>m.capture&&keys[providerKeys[m.provider]]&&
    (captureProviders===null||captureProviders.includes(m.provider)));
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
  const prompt=makePrompt({fen,player:side==='White'?actualWhite:actualBlack,opponent:side==='White'?actualBlack:actualWhite,game:round.game,history:sourceGame.moves.map(m=>m.uci).join(' ')});
  const outdir=join(dir,'data/attempts');await mkdir(outdir,{recursive:true});
  const claimDir=join(dir,'data/claims');
  await mkdir(claimDir,{recursive:true});
  // Validate the full stored history before allocating an expense slot.
  await collect({root:dir});
  const filePattern=/^g\d{2}-p\d{3}-[a-z0-9-]+\.json$/;
  const recorded=(await readdir(outdir)).filter(name=>filePattern.test(name));
  const reserved=(await readdir(claimDir)).filter(name=>filePattern.test(name));
  const occupied=new Set([...recorded,...reserved]);
  const slots=Math.max(0,maxRequests-occupied.size);
  const filename=model=>`g${String(round.game).padStart(2,'0')}-p${String(ply).padStart(3,'0')}-${model.id}.json`;
  const available=models.filter(m=>!existsSync(join(outdir,filename(m))));
  if(mode==='reserve'){
    const pending=available.filter(m=>!existsSync(join(claimDir,filename(m))));
    if(pending.length>slots){
      await collect({root:dir,write:true});
      return {status:slots===0?'total-request-ceiling-reached':'insufficient-request-allowance-for-comparators',game:round.game,ply,newReservations:0,newAttempts:0};
    }
    if(!pending.length){
      await collect({root:dir,write:true});
      return {status:'position-already-reserved',game:round.game,ply,newReservations:0,newAttempts:0};
    }
    // The workflow MUST commit and push these immutable documents to main
    // before it invokes --execute. A local reservation alone is insufficient.
    const reservedAt=clock().toISOString();
    for(const model of pending){
      const raw={schema:RESERVATION_SCHEMA,event:EVENT_ID,game:round.game,ply,
        fen,source:round.pgnUrl,model:{id:model.id,name:model.name,
          provider:model.provider,version:model.version},
        promptSha256:hash(prompt),reservedAt,captureRun};
      const claim={...raw,digest:hash(raw)};
      validateReservation(claim);
      await writeFile(join(claimDir,filename(model)),JSON.stringify(claim,null,2)+'\n',{flag:'wx'});
    }
    await collect({root:dir,write:true});
    return {status:'reserved-awaiting-publication',game:round.game,ply,
      newReservations:pending.length,newAttempts:0};
  }
  let pending=[];
  if(mode==='execute'){
    for(const model of available){
      const path=join(claimDir,filename(model));
      if(!existsSync(path))continue;
      const claim=JSON.parse(await readFile(path,'utf8'));
      const {digest,...raw}=claim;
      validateReservation(claim);
      if(digest!==hash(raw))throw new Error('Reservation digest mismatch');
      if(canonical(claim.captureRun)!==canonical(captureRun))continue;
      if(claim.fen!==fen||claim.ply!==ply||claim.game!==round.game||
         claim.source!==round.pgnUrl||claim.model.id!==model.id||
         claim.model.version!==model.version||claim.promptSha256!==hash(prompt))
        throw new Error('Reserved position or prompt changed');
      pending.push({model,claim});
    }
    if(!pending.length){
      await collect({root:dir,write:true});
      return {status:'no-current-run-reservations',game:round.game,ply,newAttempts:0};
    }
  }else{
    // Legacy mode exists strictly for offline unit tests and is never exposed
    // by the production CLI. It cannot be treated as restart-safe.
    if(slots===0){
      await collect({root:dir,write:true});
      return {status:'total-request-ceiling-reached',game:round.game,ply,newAttempts:0};
    }
    pending=available.map(model=>({model,claim:null}));
    if(pending.length>slots){
      await collect({root:dir,write:true});
      return {status:'insufficient-request-allowance-for-comparators',game:round.game,ply,newAttempts:0};
    }
    if(!pending.length){
      await collect({root:dir,write:true});
      return {status:'position-already-attempted',game:round.game,ply,newAttempts:0};
    }
  }
  const results=await Promise.all(pending.map(async({model,claim})=>{
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
    return {schema:ATTEMPT_SCHEMA,event:EVENT_ID,game:round.game,ply,fen,source:round.pgnUrl,model:{id:model.id,name:model.name,provider:model.provider,version:model.version},prompt,promptSha256:hash(prompt),response,responseSha256:hash(response),status,predictedUci,error,startedAt,completedAt,providerResponseId,providerReportedModel,elapsedMs,usage,captureRun,reservationDigest:claim?.digest??null};
  }));
  // A second PGN retrieval detects an obvious race. A successful check is not
  // proof that a forecast preceded a physical move or its public observation.
  let stillCurrent=false;
  try{
    const post=await broadcast(fetcher,round);
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
  return {status:stillCurrent?'captured-provisional':'captured-with-feed-change',game:round.game,ply,newAttempts,newObservations:observations.moves.length-known,models:results.map(x=>({id:x.model.id,status:x.status}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const flag=process.argv[2];
  if(process.argv.length!==3||!['--reserve','--execute'].includes(flag))
    throw new Error('Usage: node scripts/forecast-cycle.mjs --reserve|--execute');
  cycle({mode:flag.slice(2),sampleEvery:Number(process.env.CAPTURE_SAMPLE_EVERY||5),
    maxRequests:Number(process.env.CAPTURE_MAX_REQUESTS||900),
    captureProviders:process.env.CAPTURE_PROVIDERS?.split(',').map(p=>p.trim())??null
  }).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error(`Capture cycle failed: ${sanitizeError(error)}`);process.exitCode=1;
  });
}
