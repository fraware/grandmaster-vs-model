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
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {roundInfo,activeRound} from '../src/match-2026.mjs';
import {cycle,sanitizeError} from './forecast-cycle.mjs';

const currentFile=fileURLToPath(import.meta.url);
const waitDefault=ms=>new Promise(resolveWait=>setTimeout(resolveWait,ms));
const HTTP_AUTH_FAILURE=/^Broadcast stream HTTP (401|403)$/;
export const streamUrl=game=>{
  const round=roundInfo(game);
  return `https://lichess.org/api/stream/broadcast/round/${round.roundId}.pgn`;
};

function validateOptions({maxDurationMs,minRefreshMs,maxConnections,retryDelayMs}){
  if(!Number.isInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>7_200_000)
    throw new Error('Invalid observer session duration');
  if(!Number.isInteger(minRefreshMs)||minRefreshMs<0||minRefreshMs>30_000)
    throw new Error('Invalid minimum source refresh interval');
  if(!Number.isInteger(maxConnections)||maxConnections<1||maxConnections>100)
    throw new Error('Invalid stream connection limit');
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
  maxDurationMs=90_000,minRefreshMs=1_500,maxConnections=4,
  retryDelayMs=2_500,onStatus=()=>{}
}={}){
  roundInfo(game);
  validateOptions({maxDurationMs,minRefreshMs,maxConnections,retryDelayMs});
  if(typeof onSnapshot!=='function'||typeof streamFetcher!=='function'||typeof now!=='function'||typeof wait!=='function')
    throw new Error('Missing observer dependency');
  const until=now()+maxDurationMs;
  let connections=0,notifications=0,lastRefreshMs=-Infinity,bytesReceived=0;
  let lastTransportFailure=null;
  while(now()<until&&connections<maxConnections){
    const controller=new AbortController();
    const deadlineMs=Math.max(1,until-now());
    const timer=setTimeout(()=>controller.abort(),deadlineMs);
    connections++;
    let transportFailure=null;
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
      await onSnapshot({reason:'connected',game,observedAt:new Date(now()).toISOString()});
      notifications++;
      lastRefreshMs=now();
      while(now()<until){
        let item;
        try{item=await reader.read();}
        catch(error){transportFailure=error;break;}
        if(item.done)break;
        const size=item.value?.byteLength??0;
        if(!Number.isSafeInteger(size)||size<0)throw new Error('Unexpected stream chunk');
        if(size===0)continue;
        bytesReceived+=size;
        if(bytesReceived>50_000_000)throw new Error('Broadcast stream byte ceiling reached');
        const delay=Math.max(0,minRefreshMs-(now()-lastRefreshMs));
        if(delay)await wait(delay);
        if(now()>=until)break;
        await onSnapshot({reason:'stream-update',game,observedAt:new Date(now()).toISOString()});
        notifications++;
        lastRefreshMs=now();
      }
    }catch(error){
      // Source refresh errors must fail closed. The notification itself is
      // deliberately outside the per-read transport catch.
      if(error?.message?.startsWith('Broadcast snapshot'))throw error;
      if(HTTP_AUTH_FAILURE.test(String(error?.message)))throw error;
      transportFailure=error;
    }finally{
      clearTimeout(timer);
      controller.abort();
      try{await reader?.cancel();}catch{/* Stream already terminated. */}
      try{reader?.releaseLock();}catch{/* Lock already released. */}
    }
    if(transportFailure)lastTransportFailure='transport-failed';
    onStatus({kind:'disconnected',game,connection:connections,transportFailure:!!transportFailure});
    if(now()>=until)break;
    if(connections<maxConnections){
      const ms=Math.min(retryDelayMs*2**Math.min(connections-1,5),30_000,Math.max(0,until-now()));
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
    }catch{throw new Error('Broadcast snapshot validation failed');}
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
  (async()=>{
    if(mode==='--probe'){
      const result=await probeStream({game});
      log({...result,kind:'public-stream-probe'});
      if(!result.ok)process.exitCode=1;
    }else{
      if(scheduled?.game!==game){
        log({status:'outside-scheduled-session',game});
        return;
      }
      const result=await observeReadOnly({
        game,maxDurationMs:duration,onStatus:log
      });
      log(result);
    }
  })().catch(error=>{
    // Upstream data and response bodies are never printed in CI logs.
    console.error(sanitizeError(error));
    process.exitCode=1;
  });
}
