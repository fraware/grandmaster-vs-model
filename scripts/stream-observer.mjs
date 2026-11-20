#!/usr/bin/env node
/**
 * Event-driven, read-only observer for a pinned Lichess championship round.
 *
 * The official streaming API emits PGN data without a documented byte-frame
 * boundary. Treat incoming data as a change signal, and retrieve the full
 * canonical round PGN through the existing validated snapshot collector.
 * Never interpret arbitrary TCP chunks as complete PGN records.
 *
 * This module performs zero model API calls. A separate, explicitly enabled
 * capture transport is required before stream events can trigger paid models.
 */
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {roundInfo,activeRound} from '../src/match-2026.mjs';
import {cycle,sanitizeError} from './forecast-cycle.mjs';

const currentFile=fileURLToPath(import.meta.url);
const waitDefault=ms=>new Promise(resolveWait=>setTimeout(resolveWait,ms));
const HTTP_AUTH_FAILURE=/^Broadcast stream HTTP (401|403)$/;
const TRANSIENT_SOURCE=/Broadcast source HTTP (408|429|5\\d\\d)|fetch failed|network|ECONN|ETIMEDOUT|timeout|aborted/i;
// Suppress pure transport whitespace and empty heartbeat fragments. Streaming
// data otherwise acts only as a change signal: never parse incomplete PGNs.
export function isStreamHeartbeat(bytes){
  if(!(bytes instanceof Uint8Array))throw new Error('Unexpected broadcast stream bytes');
  return bytes.every(byte=>byte===9||byte===10||byte===13||byte===32);
}
export const streamUrl=game=>{
  const round=roundInfo(game);
  return `https://lichess.org/api/stream/broadcast/round/${round.roundId}.pgn`;
};

function validateOptions({maxDurationMs,minRefreshMs,maxConnections,retryDelayMs,maxConnectionAgeMs}){
  if(!Number.isInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>7_200_000)
    throw new Error('Invalid observer session duration');
  if(!Number.isInteger(minRefreshMs)||minRefreshMs<0||minRefreshMs>30_000)
    throw new Error('Invalid minimum source refresh interval');
  if(!Number.isInteger(maxConnections)||maxConnections<1||maxConnections>512)
    throw new Error('Invalid stream connection limit');
  if(!Number.isInteger(maxConnectionAgeMs)||maxConnectionAgeMs<1||maxConnectionAgeMs>600_000)
    throw new Error('Invalid stream idle rotation limit');
  if(!Number.isInteger(retryDelayMs)||retryDelayMs<0||retryDelayMs>60_000)
    throw new Error('Invalid reconnection delay');
}

/**
 * Observe a real broadcast stream with bounded retries, duration and refresh
 * frequency. onSnapshot must independently validate each fresh PGN snapshot.
 * Its failures propagate rather than being treated as recoverable transport
 * failures. Incoming network bytes are never treated as move timestamps.
 *
 * @param {object} options - Injected transport/clock enable offline tests.
 * @returns {Promise<object>} Operational counters, never a timing certificate.
 */
export async function observeBroadcast({
  game,streamFetcher=fetch,onSnapshot,now=Date.now,wait=waitDefault,
  maxDurationMs=90_000,minRefreshMs=2_000,maxConnections=192,
  retryDelayMs=5_000,maxConnectionAgeMs=120_000,onStatus=()=>{}
}={}){
  roundInfo(game);
  validateOptions({maxDurationMs,minRefreshMs,maxConnections,retryDelayMs,maxConnectionAgeMs});
  if(typeof onSnapshot!=='function'||typeof streamFetcher!=='function'||typeof now!=='function'||typeof wait!=='function')
    throw new Error('Missing observer dependency');
  const until=now()+maxDurationMs;
  let connections=0,notifications=0,lastRefreshMs=-Infinity,bytesReceived=0;
  let lastTransportFailure=null;
  while(now()<until&&connections<maxConnections){
    const controller=new AbortController();
    const deadlineMs=Math.max(1,Math.min(until-now(),maxConnectionAgeMs));
    const timer=setTimeout(()=>controller.abort(),deadlineMs);
    connections++;
    let transportFailure=null;
    let scheduledRotation=false;
    let reader=null;
    try{
      const response=await streamFetcher(streamUrl(game),{
        method:'GET',
        headers:{Accept:'application/x-chess-pgn'},
        signal:controller.signal
      });
      if(!response?.ok)throw new Error(`Broadcast stream HTTP ${response?.status??'unknown'}`);
      if(typeof response.body?.getReader!=='function')
        throw new Error('Broadcast stream missing readable body');
      reader=response.body.getReader();
      onStatus({kind:'connected',game,connection:connections});
      // A snapshot retrieves any state that predates the streaming connection.
      const initial=await onSnapshot({reason:'connected',game,observedAt:new Date(now()).toISOString()});
      notifications++;
      lastRefreshMs=now();
      if(initial?.status==='game-finished')
        return {status:'game-finished',game,connections,notifications,bytesReceived,transport:lastTransportFailure};
      while(now()<until){
        let item;
        try{item=await reader.read();}
        catch(error){
          if(controller.signal.aborted)scheduledRotation=true;
          else transportFailure=error;
          break;
        }
        if(item.done)break;
        const size=item.value?.byteLength??0;
        if(!Number.isSafeInteger(size)||size<0)throw new Error('Unexpected stream chunk');
        if(isStreamHeartbeat(item.value))continue;
        bytesReceived+=size;
        if(bytesReceived>50_000_000)throw new Error('Broadcast stream byte ceiling reached');
        const delay=Math.max(0,minRefreshMs-(now()-lastRefreshMs));
        if(delay)await wait(delay);
        if(now()>=until)break;
        const update=await onSnapshot({reason:'stream-update',game,observedAt:new Date(now()).toISOString()});
        notifications++;
        lastRefreshMs=now();
        if(update?.status==='game-finished')
          return {status:'game-finished',game,connections,notifications,bytesReceived,transport:lastTransportFailure};
      }
    }catch(error){
      // Source refresh errors must fail closed. The notification itself is
      // deliberately outside the per-read transport catch.
      if(error?.message?.startsWith('Broadcast snapshot'))throw error;
      if(HTTP_AUTH_FAILURE.test(String(error?.message)))throw error;
      if(controller.signal.aborted)scheduledRotation=true;
      else transportFailure=error;
    }finally{
      clearTimeout(timer);
      controller.abort();
      try{await reader?.cancel();}catch{/* Stream already terminated. */}
      try{reader?.releaseLock();}catch{/* Lock already released. */}
    }
    if(transportFailure)lastTransportFailure=transportFailure.code==='SOURCE_TRANSIENT'?
      'source-temporarily-unavailable':'transport-failed';
    onStatus({kind:'disconnected',game,connection:connections,
      transportFailure:!!transportFailure,plannedRotation:scheduledRotation});
    if(now()>=until)break;
    if(connections<maxConnections){
      // Reset quickly following a planned rotation, retaining a real backoff
      // for EOF, network errors and repeated unsuccessful connections.
      const ms=scheduledRotation?0:
        Math.min(retryDelayMs*2**Math.min(connections-1,5),60_000,Math.max(0,until-now()));
      if(ms)await wait(ms);
    }
  }
  return {
    status:now()>=until?'duration-reached':'connection-limit-reached',
    game,connections,notifications,bytesReceived,
    transport:lastTransportFailure
  };
}

/** Safe, deliberately credential-free source-observation adapter. */
export async function observeReadOnly({
  game,root=fileURLToPath(new URL('../',import.meta.url)),
  snapshotCycle=cycle,...options
}={}){
  return observeBroadcast({game,...options,onSnapshot:async({reason,observedAt})=> {
    try{
      // Model provider keys must never be forwarded from process.env here.
      const result=await snapshotCycle({
        root,gameNumber:game,activeOnly:true,
        keys:{},captureProviders:['openai'],
      });
      options.onStatus?.({kind:'source-refresh',game,reason,notifiedAt:observedAt,
        completedAt:new Date().toISOString(),status:result.status,
        newObservations:result.newObservations??0,newAttempts:0});
      return result;
    }catch(error){
      // Temporary PGN transport failures permit a bounded stream reconnect.
      // Failed legality, identity and append-only checks are permanent for
      // this observer session and must never be silently skipped.
      if(TRANSIENT_SOURCE.test(String(error?.message))){
        const transient=new Error('Broadcast source temporarily unavailable');
        transient.code='SOURCE_TRANSIENT';
        throw transient;
      }
      throw new Error('Broadcast snapshot validation failed');
    }
  }});
}

/** A bounded public-endpoint probe; never reads or publishes championship moves. */
export async function probeStream({game=1,fetcher=fetch,timeoutMs=12_000}={}){
  roundInfo(game);
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)throw new Error('Invalid probe deadline');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher(streamUrl(game),{
      method:'GET',headers:{Accept:'application/x-chess-pgn'},
      signal:controller.signal
    });
    return {game,httpStatus:response.status,ok:response.ok,
      contentType:response.headers?.get('content-type')??null};
  }finally{clearTimeout(timer);controller.abort();}
}

if(process.argv[1]&&resolve(process.argv[1])===currentFile){
  const mode=process.argv[2];
  if(!['--probe','--observe'].includes(mode)||process.argv.length!==3)
    throw new Error('Usage: node scripts/stream-observer.mjs --probe|--observe');
  const scheduled=activeRound(new Date().toISOString());
  const game=process.env.STREAM_GAME?Number(process.env.STREAM_GAME):
    (mode==='--observe'?scheduled?.game??1:1);
  const duration=Number(process.env.STREAM_DURATION_MS||90_000);
  const log=record=>console.log(JSON.stringify(record));
  const sessionStartedAt=new Date().toISOString();
  const summary=async result=>{
    const path=join(fileURLToPath(new URL('../',import.meta.url)),'artifacts/shadow');
    await mkdir(path,{recursive:true});
    await writeFile(join(path,'session.json'),JSON.stringify({
      schema:'read-only-broadcast-session-v1',
      game,source:roundInfo(game).pgnUrl,sessionStartedAt,
      sessionCompletedAt:new Date().toISOString(),
      providerCalls:0,physicalMoveTiming:'unverified',...result
    },null,2)+'\n');
  };
  (async()=>{
    if(mode==='--probe'){
      const result=await probeStream({game});
      log({...result,kind:'public-stream-probe'});
      if(!result.ok)process.exitCode=1;
    }else{
      if(scheduled?.game!==game){
        const result={status:'outside-scheduled-session',game};
        await summary(result);
        log(result);
        return;
      }
      const result=await observeReadOnly({
        game,maxDurationMs:duration,onStatus:log
      });
      await summary(result);
      log(result);
    }
  })().catch(async error=>{
    // Preserve only sanitized failure metadata, never PGNs or credentials.
    await summary({status:'failed',error:sanitizeError(error)}).catch(()=>{});
    console.error(sanitizeError(error));
    process.exitCode=1;
  });
}
